import { FastifyPluginAsync } from 'fastify';
import { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import {
  db,
  projects,
  tickets,
  ticketComments,
  ticketAttachments,
  ticketDependencies,
  ticketApprovals,
  ticketVcsLinks,
  projectMilestones,
  projectActivityLogs,
  projectMembers,
  projectTeams,
  roles,
  users,
  teams,
  departments,
  eq,
  desc,
  and,
  or,
  inArray,
} from '@coretrack/db';
import { getCurrentUser, getUserRoleTier, getEffectiveUserPermissions, getUserTeamIds } from '../auth/auth.js';
import { Permissions, hasPermission } from '@coretrack/shared';
import { sendProjectAssignedNotification } from '../services/email.js';
import { getProjectSummary, RateLimitError } from '../services/projectSummariser.js';

export const projectRoutes: FastifyPluginAsync = async (fastify) => {
  const app = fastify.withTypeProvider<ZodTypeProvider>();

  // Helper to compute status including dynamic OVERDUE detection
  function computeProjectStatus(status: string, deadline: Date | null): string {
    if (status !== 'COMPLETED' && deadline && new Date(deadline).getTime() < Date.now()) {
      return 'OVERDUE';
    }
    return status;
  }

  // Helper to verify that a user holds the Manager role (matches GET /auth/users Manager bitmask)
  async function isUserProjectManager(userId: string): Promise<boolean> {
    const targetUser = await db.query.users.findFirst({
      where: eq(users.id, userId),
      columns: { globalPermissions: true },
    });
    if (!targetUser) return false;
    const perms = targetUser.globalPermissions;
    const isSuperAdmin = (perms & Permissions.ORG_ADMIN) === Permissions.ORG_ADMIN;
    const isAdmin = (perms & Permissions.PROJECT_DELETE) === Permissions.PROJECT_DELETE;
    const isManager =
      (perms & Permissions.AUTOMATION_MANAGE) === Permissions.AUTOMATION_MANAGE ||
      (perms & Permissions.PROJECT_ADMIN) === Permissions.PROJECT_ADMIN ||
      (perms & Permissions.PROJECT_EDIT) === Permissions.PROJECT_EDIT;
    return !isSuperAdmin && !isAdmin && isManager;
  }

  function isProjectVisibleToCaller(
    project: { adminVisibleTo?: unknown },
    callerId: string,
    callerTier: number
  ): boolean {
    if (callerTier !== 4) return true;
    const allowed = project.adminVisibleTo;
    if (!Array.isArray(allowed) || allowed.length === 0) return true;
    return allowed.includes(callerId);
  }

  // 1. Project Dashboard Metrics (Placed BEFORE /:key so it is not intercepted)
  app.get(
    '/dashboard/metrics',
    {
      schema: {
        description: 'Get aggregate project management dashboard metrics and overdue alerts',
        tags: ['Projects'],
      },
    },
    async (request, reply) => {
      const caller = await getCurrentUser(request);
      const callerTierInfo = caller ? await getUserRoleTier(caller.id) : null;

      const rawProjects = await db.query.projects.findMany({
        with: {
          tickets: {
            columns: {
              id: true,
              status: true,
            },
          },
          department: true,
        },
      });

      const allProjects =
        caller && callerTierInfo
          ? rawProjects.filter((p) => isProjectVisibleToCaller(p, caller.id, callerTierInfo.tier))
          : rawProjects;

      let totalProjects = allProjects.length;
      let activeProjects = 0;
      let completedProjects = 0;
      let overdueProjects = 0;
      let onHoldProjects = 0;
      let notStartedProjects = 0;
      let totalTickets = 0;
      let completedTickets = 0;

      const now = Date.now();
      const fourteenDaysFromNow = now + 14 * 24 * 60 * 60 * 1000;
      const upcomingDeadlines: Array<{
        id: string;
        key: string;
        name: string;
        deadline: string | null;
        daysRemaining: number;
        status: string;
      }> = [];

      for (const p of allProjects) {
        const computedStatus = computeProjectStatus(p.status, p.deadline);
        if (computedStatus === 'OVERDUE') overdueProjects++;
        else if (computedStatus === 'COMPLETED') completedProjects++;
        else if (computedStatus === 'IN_PROGRESS') activeProjects++;
        else if (computedStatus === 'ON_HOLD') onHoldProjects++;
        else if (computedStatus === 'NOT_STARTED') notStartedProjects++;

        const pTotalTickets = p.tickets.length;
        const pCompleted = p.tickets.filter((t) => ['DONE', 'RESOLVED', 'CLOSED'].includes(t.status.toUpperCase())).length;
        totalTickets += pTotalTickets;
        completedTickets += pCompleted;

        if (p.deadline && p.status !== 'COMPLETED') {
          const deadlineMs = new Date(p.deadline).getTime();
          if (deadlineMs >= now && deadlineMs <= fourteenDaysFromNow) {
            const daysRemaining = Math.ceil((deadlineMs - now) / (1000 * 60 * 60 * 24));
            upcomingDeadlines.push({
              id: p.id,
              key: p.key,
              name: p.name,
              deadline: p.deadline ? p.deadline.toISOString() : null,
              daysRemaining,
              status: computedStatus,
            });
          }
        }
      }

      upcomingDeadlines.sort((a, b) => a.daysRemaining - b.daysRemaining);

      const overallProgress = totalTickets > 0 ? Math.round((completedTickets / totalTickets) * 100) : 0;

      return reply.send({
        data: {
          totalProjects,
          activeProjects,
          completedProjects,
          overdueProjects,
          onHoldProjects,
          notStartedProjects,
          totalTickets,
          completedTickets,
          overallProgress,
          upcomingDeadlines,
        },
      });
    }
  );

  // 2. List Projects (Enriched with PM, Reviewer, Teams, Ticket counts & computed progress)
  app.get(
    '/',
    {
      schema: {
        description: 'List all accessible projects with progress, personnel, and calculated statuses',
        tags: ['Projects'],
      },
    },
    async (request, reply) => {
      const caller = await getCurrentUser(request);
      const callerTierInfo = caller ? await getUserRoleTier(caller.id) : null;

      const rawProjects = await db.query.projects.findMany({
        with: {
          department: true,
          primaryTeam: {
            with: {
              lead: {
                columns: {
                  id: true,
                  fullName: true,
                  email: true,
                },
              },
            },
          },
          assignedTeams: {
            with: {
              team: {
                with: {
                  lead: {
                    columns: {
                      id: true,
                      fullName: true,
                      email: true,
                    },
                  },
                },
              },
            },
          },
          projectManager: {
            columns: {
              id: true,
              fullName: true,
              email: true,
            },
          },
          reviewer: {
            columns: {
              id: true,
              fullName: true,
              email: true,
            },
          },
          tickets: {
            columns: {
              id: true,
              status: true,
            },
          },
          members: {
            with: {
              user: {
                columns: {
                  id: true,
                  fullName: true,
                  email: true,
                },
              },
              role: true,
            },
          },
          milestones: true,
        },
        orderBy: (projects, { asc }) => [asc(projects.name)],
      });

      const allProjects =
        caller && callerTierInfo
          ? rawProjects.filter((p) => isProjectVisibleToCaller(p, caller.id, callerTierInfo.tier))
          : rawProjects;

      const enriched = allProjects.map((p) => {
        const totalTicketsCount = p.tickets.length;
        const completedTicketsCount = p.tickets.filter((t) =>
          ['DONE', 'RESOLVED', 'CLOSED'].includes(t.status.toUpperCase())
        ).length;
        const progressPercentage =
          totalTicketsCount > 0 ? Math.round((completedTicketsCount / totalTicketsCount) * 100) : 0;
        const computedStatus = computeProjectStatus(p.status, p.deadline);

        return {
          ...p,
          assignedTeams: (() => {
            const list = p.assignedTeams.map((at) => at.team);
            if (p.primaryTeam && !list.some((t) => t.id === p.primaryTeam!.id)) {
              list.unshift(p.primaryTeam);
            }
            return list;
          })(),
          totalTicketsCount,
          completedTicketsCount,
          progressPercentage,
          computedStatus,
          memberCount: p.members.length,
          milestonesCount: p.milestones.length,
          completedMilestonesCount: p.milestones.filter((m) => m.status === 'COMPLETED').length,
        };
      });

      return reply.send({ data: enriched });
    }
  );

  // 3. Get Project by Key
  app.get(
    '/:key',
    {
      schema: {
        description: 'Get comprehensive project details by key (milestones, activity logs, team leads, members)',
        tags: ['Projects'],
        params: z.object({
          key: z.string(),
        }),
      },
    },
    async (request, reply) => {
      const { key } = request.params;
      const project = await db.query.projects.findFirst({
        where: eq(projects.key, key),
        with: {
          department: true,
          primaryTeam: {
            with: {
              lead: {
                columns: {
                  id: true,
                  fullName: true,
                  email: true,
                },
              },
              members: {
                with: {
                  user: {
                    columns: {
                      id: true,
                      fullName: true,
                      email: true,
                    },
                  },
                },
              },
            },
          },
          assignedTeams: {
            with: {
              team: {
                with: {
                  lead: {
                    columns: {
                      id: true,
                      fullName: true,
                      email: true,
                    },
                  },
                  members: {
                    with: {
                      user: {
                        columns: {
                          id: true,
                          fullName: true,
                          email: true,
                        },
                      },
                    },
                  },
                },
              },
            },
          },
          projectManager: {
            columns: {
              id: true,
              fullName: true,
              email: true,
            },
          },
          reviewer: {
            columns: {
              id: true,
              fullName: true,
              email: true,
            },
          },
          milestones: {
            orderBy: (milestones, { asc }) => [asc(milestones.dueDate)],
            with: {
              tasks: {
                columns: {
                  id: true,
                  ticketKey: true,
                  title: true,
                  status: true,
                  priority: true,
                  assigneeId: true,
                },
                with: {
                  assignee: {
                    columns: {
                      id: true,
                      fullName: true,
                    },
                  },
                },
              },
            },
          },
          activityLogs: {
            with: {
              user: {
                columns: {
                  id: true,
                  fullName: true,
                  email: true,
                },
              },
            },
            orderBy: (logs, { desc }) => [desc(logs.createdAt)],
            limit: 50,
          },
          members: {
            with: {
              user: {
                columns: {
                  id: true,
                  fullName: true,
                  email: true,
                },
              },
              role: true,
            },
          },
          tickets: {
            columns: {
              id: true,
              ticketKey: true,
              title: true,
              status: true,
              priority: true,
              assigneeId: true,
              teamId: true,
              dueDate: true,
            },
            with: {
              team: {
                columns: {
                  id: true,
                  name: true,
                  keyPrefix: true,
                },
              },
            },
          },
        },
      });

      if (!project) {
        return reply.status(404).send({ error: 'Project not found' });
      }

      const caller = await getCurrentUser(request);
      const callerTierInfo = caller ? await getUserRoleTier(caller.id, key) : null;
      if (caller && callerTierInfo && !isProjectVisibleToCaller(project, caller.id, callerTierInfo.tier)) {
        return reply.status(403).send({
          error: 'FORBIDDEN',
          message: 'You do not have access to view this project.',
        });
      }

      // Build unified assignedTeams list (M2M projectTeams + backwards-compat primaryTeam)
      const resolvedAssignedTeams = project.assignedTeams.map((at) => at.team);
      if (project.primaryTeam && !resolvedAssignedTeams.some((t) => t.id === project.primaryTeam!.id)) {
        resolvedAssignedTeams.unshift(project.primaryTeam);
      }

      // Team task isolation: non-manager/non-admin users only see their own team(s)' tasks (or untagged tasks)
      let visibleTickets = project.tickets;
      if (caller && callerTierInfo) {
        const isProjectAuthority =
          callerTierInfo.tier >= 3 ||
          project.projectManagerId === caller.id ||
          project.reviewerId === caller.id;

        if (!isProjectAuthority) {
          const userTeamIds = await getUserTeamIds(caller.id);
          visibleTickets = project.tickets.filter(
            (t) => !t.teamId || userTeamIds.includes(t.teamId)
          );
        }
      }

      const totalTicketsCount = visibleTickets.length;
      const completedTicketsCount = visibleTickets.filter((t) =>
        ['DONE', 'RESOLVED', 'CLOSED'].includes(t.status.toUpperCase())
      ).length;
      const progressPercentage =
        totalTicketsCount > 0 ? Math.round((completedTicketsCount / totalTicketsCount) * 100) : 0;
      const computedStatus = computeProjectStatus(project.status, project.deadline);

      // Status breakdown
      const ticketStatusBreakdown: Record<string, number> = {
        TODO: 0,
        IN_PROGRESS: 0,
        IN_REVIEW: 0,
        DONE: 0,
        BLOCKED: 0,
      };

      for (const t of visibleTickets) {
        const s = t.status.toUpperCase();
        if (ticketStatusBreakdown[s] !== undefined) {
          ticketStatusBreakdown[s]++;
        } else {
          ticketStatusBreakdown[s] = 1;
        }
      }

      return reply.send({
        data: {
          ...project,
          assignedTeams: resolvedAssignedTeams,
          tickets: visibleTickets,
          totalTicketsCount,
          completedTicketsCount,
          progressPercentage,
          computedStatus,
          ticketStatusBreakdown,
        },
      });
    }
  );

  // 3b. Get Project Summary (Completed, Blockers, Planned + Optional AI Narrative)
  app.get(
    '/:key/summary',
    {
      schema: {
        description: 'Get structured project summary (tasks completed, blockers present, tasks planned) with optional AI narrative',
        tags: ['Projects'],
        params: z.object({
          key: z.string(),
        }),
      },
    },
    async (request, reply) => {
      const { key } = request.params;
      const caller = await getCurrentUser(request);
      const summary = await getProjectSummary(key, caller?.id ?? null);
      if (!summary) {
        return reply.status(404).send({ error: 'Project not found' });
      }
      return reply.send({ data: summary });
    }
  );

  // 3c. Regenerate Project Summary (Refreshes cached AI narrative, rate-limited)
  app.post(
    '/:key/summary/regenerate',
    {
      schema: {
        description: 'Regenerate cached AI narrative for a project summary (rate-limited)',
        tags: ['Projects'],
        params: z.object({
          key: z.string(),
        }),
      },
    },
    async (request, reply) => {
      const { key } = request.params;
      const caller = await getCurrentUser(request);
      try {
        const summary = await getProjectSummary(key, caller?.id ?? null, { regenerate: true });
        if (!summary) {
          return reply.status(404).send({ error: 'Project not found' });
        }
        return reply.send({ data: summary });
      } catch (err) {
        if (err instanceof RateLimitError) {
          return reply.status(429).send({ error: err.message });
        }
        throw err;
      }
    }
  );

  // 4. Create Project
  app.post(
    '/',
    {
      schema: {
        description: 'Create a new project with PM, Reviewer, and Milestones (Super Admin & Admin)',
        tags: ['Projects'],
        body: z.object({
          name: z.string().min(2).max(150),
          key: z.string().min(2).max(10).toUpperCase(),
          description: z.string().optional(),
          departmentId: z.string().uuid().optional().nullable(),
          primaryTeamId: z.string().uuid().optional().nullable(),
          projectType: z.enum(['ENGINEERING', 'SERVICE_DESK', 'BUSINESS', 'MARKETING']).default('ENGINEERING'),
          privacyTier: z.enum(['PUBLIC', 'INTERNAL', 'CONFIDENTIAL']).default('PUBLIC'),
          status: z.enum(['NOT_STARTED', 'IN_PROGRESS', 'ON_HOLD', 'UNDER_REVIEW', 'COMPLETED']).default('NOT_STARTED'),
          startDate: z.string().datetime().optional().nullable(),
          deadline: z.string().datetime().optional().nullable(),
          projectManagerId: z.string().uuid().optional().nullable(),
          reviewerId: z.string().uuid().optional().nullable(),
          adminVisibleTo: z.array(z.string().uuid()).optional(),
        }),
      },
    },
    async (request, reply) => {
      const user = await getCurrentUser(request);
      if (!user) return reply.status(401).send({ error: 'Unauthorized' });

      // RBAC check: Employees and Team Leads are blocked from creating projects
      const callerTierInfo = await getUserRoleTier(user.id);
      const { permissions } = await getEffectiveUserPermissions(user.id);
      const canCreate =
        callerTierInfo.tier >= 3 &&
        (callerTierInfo.tier >= 4 || hasPermission(permissions, Permissions.PROJECT_CREATE));

      if (!canCreate) {
        return reply.status(403).send({
          type: 'https://errors.coretrack.internal/forbidden',
          title: 'Access Denied',
          status: 403,
          error: 'FORBIDDEN',
          message: 'Employees and Team Leads are not authorized to create projects. Only Super Admins, Admins, and designated Project Managers can create projects.',
        });
      }

      const {
        name,
        key,
        description,
        departmentId,
        primaryTeamId,
        projectType,
        privacyTier,
        status,
        startDate,
        deadline,
        projectManagerId,
        reviewerId,
        adminVisibleTo,
      } = request.body;

      // Check key uniqueness
      const existing = await db.query.projects.findFirst({
        where: eq(projects.key, key),
      });
      if (existing) {
        return reply.status(400).send({ error: `Project with key '${key}' already exists` });
      }

      if (projectManagerId && !(await isUserProjectManager(projectManagerId))) {
        return reply.status(400).send({
          error: 'Only users with the Manager role can be assigned as Project Manager.',
        });
      }

      // Safe foreign key validation for departmentId
      let resolvedDeptId: string | null = null;
      if (departmentId) {
        const deptExists = await db.query.departments.findFirst({
          where: eq(departments.id, departmentId),
        });
        if (deptExists) resolvedDeptId = deptExists.id;
      }
      if (!resolvedDeptId) {
        const firstDept = await db.query.departments.findFirst();
        resolvedDeptId = firstDept?.id || null;
      }

      // Safe foreign key validation for primaryTeamId (prevent foreign key violations)
      let resolvedTeamId: string | null = null;
      if (primaryTeamId && typeof primaryTeamId === 'string' && primaryTeamId.trim()) {
        const teamExists = await db.query.teams.findFirst({
          where: eq(teams.id, primaryTeamId.trim()),
        });
        if (teamExists) {
          resolvedTeamId = teamExists.id;
        }
      }

      // Safe foreign key validation for projectManagerId
      let resolvedPmId: string | null = null;
      if (projectManagerId) {
        const pmExists = await db.query.users.findFirst({
          where: eq(users.id, projectManagerId),
        });
        if (pmExists) resolvedPmId = pmExists.id;
      }

      // Safe foreign key validation for reviewerId
      let resolvedReviewerId: string | null = null;
      if (reviewerId) {
        const revExists = await db.query.users.findFirst({
          where: eq(users.id, reviewerId),
        });
        if (revExists) resolvedReviewerId = revExists.id;
      }

      const [newProject] = await db
        .insert(projects)
        .values({
          name,
          key,
          description: description || null,
          departmentId: resolvedDeptId,
          primaryTeamId: resolvedTeamId,
          projectType,
          privacyTier,
          status,
          startDate: startDate ? new Date(startDate) : null,
          deadline: deadline ? new Date(deadline) : null,
          deadlineSetByUserId: deadline ? user.id : null,
          deadlineSetByRoleTier: deadline ? callerTierInfo.tier : 1,
          projectManagerId: resolvedPmId,
          reviewerId: resolvedReviewerId,
          adminVisibleTo: callerTierInfo.tier >= 5 && Array.isArray(adminVisibleTo) ? adminVisibleTo : [],
        })
        .returning();

      // Link primaryTeamId in projectTeams M2M table if provided
      if (resolvedTeamId) {
        await db.insert(projectTeams).values({
          projectId: newProject.id,
          teamId: resolvedTeamId,
        }).onConflictDoNothing();
      }

      // Add audit log
      await db.insert(projectActivityLogs).values({
        projectId: newProject.id,
        userId: user.id,
        action: 'PROJECT_CREATED',
        details: `Project created by ${user.fullName}.`,
      });

      // Notification Emails: PM and Reviewer Appointments
      if (newProject.projectManagerId) {
        db.query.users
          .findFirst({ where: eq(users.id, newProject.projectManagerId) })
          .then((pmUser) => {
            if (pmUser) {
              sendProjectAssignedNotification({
                recipient: { email: pmUser.email, fullName: pmUser.fullName },
                project: {
                  id: newProject.id,
                  key: newProject.key,
                  name: newProject.name,
                  description: newProject.description,
                  deadline: newProject.deadline,
                },
                roleName: 'Project Manager',
                assignedByName: user.fullName,
              }).catch((e) => console.warn('[Email] PM assignment notification error:', e));
            }
          })
          .catch(() => {});
      }

      if (newProject.reviewerId) {
        db.query.users
          .findFirst({ where: eq(users.id, newProject.reviewerId) })
          .then((revUser) => {
            if (revUser) {
              sendProjectAssignedNotification({
                recipient: { email: revUser.email, fullName: revUser.fullName },
                project: {
                  id: newProject.id,
                  key: newProject.key,
                  name: newProject.name,
                  description: newProject.description,
                  deadline: newProject.deadline,
                },
                roleName: 'Project Reviewer',
                assignedByName: user.fullName,
              }).catch((e) => console.warn('[Email] Reviewer assignment notification error:', e));
            }
          })
          .catch(() => {});
      }

      return reply.status(201).send({ data: newProject });
    }
  );

  // 5. Update Project (PM, Reviewer, Dates, Status, Description, Archiving)
  app.patch(
    '/:key',
    {
      schema: {
        description: 'Update project details, assign PM/Reviewer, update deadlines and status',
        tags: ['Projects'],
        params: z.object({
          key: z.string(),
        }),
        body: z.object({
          name: z.string().min(2).max(150).optional(),
          description: z.string().optional(),
          status: z.enum(['NOT_STARTED', 'IN_PROGRESS', 'ON_HOLD', 'UNDER_REVIEW', 'COMPLETED']).optional(),
          startDate: z.string().datetime().optional().nullable(),
          deadline: z.string().datetime().optional().nullable(),
          projectManagerId: z.string().uuid().optional().nullable(),
          reviewerId: z.string().uuid().optional().nullable(),
          primaryTeamId: z.string().uuid().optional(),
          archived: z.boolean().optional(),
          adminVisibleTo: z.array(z.string().uuid()).optional(),
        }),
      },
    },
    async (request, reply) => {
      const user = await getCurrentUser(request);
      if (!user) return reply.status(401).send({ error: 'Unauthorized' });

      const { key } = request.params;
      const targetProject = await db.query.projects.findFirst({
        where: eq(projects.key, key),
      });

      if (!targetProject) {
        return reply.status(404).send({ error: 'Project not found' });
      }

      const updates = request.body;
      const callerTierInfo = await getUserRoleTier(user.id, key);
      const { permissions } = await getEffectiveUserPermissions(user.id, key);

      // RBAC check: Employees and Team Leads are blocked from managing projects
      const isAssignedPm = targetProject.projectManagerId === user.id;
      const canManage =
        callerTierInfo.tier >= 4 ||
        ((callerTierInfo.tier >= 3 || isAssignedPm) && hasPermission(permissions, Permissions.PROJECT_EDIT));

      if (!canManage || callerTierInfo.tier < 3) {
        return reply.status(403).send({
          type: 'https://errors.coretrack.internal/forbidden',
          title: 'Access Denied',
          status: 403,
          error: 'FORBIDDEN',
          message: 'Employees and Team Leads are not authorized to manage or edit projects.',
        });
      }

      // Immutable Deadline Policy:
      // If project has an existing deadline set by a higher authority, reject lower-tier modification
      if (updates.deadline !== undefined && targetProject.deadline) {
        const isChanging =
          (updates.deadline === null && targetProject.deadline !== null) ||
          (updates.deadline && new Date(updates.deadline).getTime() !== new Date(targetProject.deadline).getTime());

        if (isChanging) {
          const currentDeadlineTier = targetProject.deadlineSetByRoleTier || 1;
          if (callerTierInfo.tier < currentDeadlineTier) {
            return reply.status(403).send({
              type: 'https://errors.coretrack.internal/forbidden',
              title: 'Immutable Deadline',
              status: 403,
              error: 'IMMUTABLE_DEADLINE',
              message: `Project deadline is immutable: This deadline was set by a higher authority and cannot be modified by your role (${callerTierInfo.roleName}).`,
            });
          }
        }
      }

      const updateData: Record<string, unknown> = {
        updatedAt: new Date(),
      };

      const auditChanges: string[] = [];

      if (updates.name !== undefined) {
        updateData.name = updates.name;
        auditChanges.push(`Renamed project to "${updates.name}"`);
      }
      if (updates.description !== undefined) {
        updateData.description = updates.description;
      }
      if (updates.status !== undefined) {
        updateData.status = updates.status;
        auditChanges.push(`Changed status to ${updates.status}`);
      }
      if (updates.startDate !== undefined) {
        updateData.startDate = updates.startDate ? new Date(updates.startDate) : null;
      }
      if (updates.deadline !== undefined) {
        updateData.deadline = updates.deadline ? new Date(updates.deadline) : null;
        updateData.deadlineSetByUserId = updates.deadline ? user.id : null;
        updateData.deadlineSetByRoleTier = updates.deadline ? callerTierInfo.tier : 1;
        auditChanges.push(
          updates.deadline
            ? `Updated deadline to ${new Date(updates.deadline).toLocaleDateString()}`
            : 'Removed project deadline'
        );
      }
      if (updates.projectManagerId !== undefined) {
        if (updates.projectManagerId) {
          if (!(await isUserProjectManager(updates.projectManagerId))) {
            return reply.status(400).send({
              error: 'Only users with the Manager role can be assigned as Project Manager.',
            });
          }
          const pmExists = await db.query.users.findFirst({ where: eq(users.id, updates.projectManagerId) });
          updateData.projectManagerId = pmExists ? pmExists.id : null;
        } else {
          updateData.projectManagerId = null;
        }
        auditChanges.push('Updated Project Manager assignment');
      }
      if (updates.reviewerId !== undefined) {
        if (updates.reviewerId) {
          const revExists = await db.query.users.findFirst({ where: eq(users.id, updates.reviewerId) });
          updateData.reviewerId = revExists ? revExists.id : null;
        } else {
          updateData.reviewerId = null;
        }
        auditChanges.push('Updated Project Reviewer assignment');
      }
      if (updates.primaryTeamId !== undefined) {
        if (updates.primaryTeamId) {
          const teamExists = await db.query.teams.findFirst({ where: eq(teams.id, updates.primaryTeamId) });
          updateData.primaryTeamId = teamExists ? teamExists.id : null;
        } else {
          updateData.primaryTeamId = null;
        }
      }
      if (updates.archived !== undefined) {
        updateData.archived = updates.archived;
        auditChanges.push(updates.archived ? 'Archived project' : 'Unarchived project');
      }
      if (updates.adminVisibleTo !== undefined) {
        if (callerTierInfo.tier < 5) {
          return reply.status(403).send({
            type: 'https://errors.coretrack.internal/forbidden',
            title: 'Access Denied',
            status: 403,
            error: 'FORBIDDEN',
            message: 'Only Super Admins can configure per-admin project visibility.',
          });
        }
        updateData.adminVisibleTo = updates.adminVisibleTo;
        auditChanges.push('Updated Admin visibility permissions');
      }

      const [updated] = await db
        .update(projects)
        .set(updateData)
        .where(eq(projects.id, targetProject.id))
        .returning();

      // Log activities
      if (auditChanges.length > 0) {
        await db.insert(projectActivityLogs).values({
          projectId: targetProject.id,
          userId: user.id,
          action: 'PROJECT_UPDATED',
          details: `${user.fullName}: ${auditChanges.join('; ')}`,
        });
      }

      // Notification Emails: If PM or Reviewer changed, notify them
      if (updates.projectManagerId && updates.projectManagerId !== targetProject.projectManagerId) {
        db.query.users
          .findFirst({ where: eq(users.id, updates.projectManagerId) })
          .then((pmUser) => {
            if (pmUser) {
              sendProjectAssignedNotification({
                recipient: { email: pmUser.email, fullName: pmUser.fullName },
                project: {
                  id: updated.id,
                  key: updated.key,
                  name: updated.name,
                  description: updated.description,
                  deadline: updated.deadline,
                },
                roleName: 'Project Manager',
                assignedByName: user.fullName,
              }).catch((e) => console.warn('[Email] PM update notification error:', e));
            }
          })
          .catch(() => {});
      }

      if (updates.reviewerId && updates.reviewerId !== targetProject.reviewerId) {
        db.query.users
          .findFirst({ where: eq(users.id, updates.reviewerId) })
          .then((revUser) => {
            if (revUser) {
              sendProjectAssignedNotification({
                recipient: { email: revUser.email, fullName: revUser.fullName },
                project: {
                  id: updated.id,
                  key: updated.key,
                  name: updated.name,
                  description: updated.description,
                  deadline: updated.deadline,
                },
                roleName: 'Project Reviewer',
                assignedByName: user.fullName,
              }).catch((e) => console.warn('[Email] Reviewer update notification error:', e));
            }
          })
          .catch(() => {});
      }

      return reply.send({ data: updated });
    }
  );

  // 5a. Assign / Sync Multiple Teams on a Project
  app.put(
    '/:key/teams',
    {
      schema: {
        description: 'Assign multiple teams to a project (replaces current team assignments)',
        tags: ['Projects'],
        params: z.object({
          key: z.string(),
        }),
        body: z.object({
          teamIds: z.array(z.string().uuid()),
        }),
      },
    },
    async (request, reply) => {
      const user = await getCurrentUser(request);
      if (!user) return reply.status(401).send({ error: 'Unauthorized' });

      const { key } = request.params;
      const targetProject = await db.query.projects.findFirst({
        where: eq(projects.key, key),
      });

      if (!targetProject) {
        return reply.status(404).send({ error: 'Project not found' });
      }

      const callerTierInfo = await getUserRoleTier(user.id, key);
      const { permissions } = await getEffectiveUserPermissions(user.id, key);
      const isAssignedPm = targetProject.projectManagerId === user.id;
      const canManage =
        callerTierInfo.tier >= 4 ||
        ((callerTierInfo.tier >= 3 || isAssignedPm) &&
          (hasPermission(permissions, Permissions.PROJECT_EDIT) || hasPermission(permissions, Permissions.MEMBER_MANAGE)));

      if (!canManage || callerTierInfo.tier < 3) {
        return reply.status(403).send({
          type: 'https://errors.coretrack.internal/forbidden',
          title: 'Access Denied',
          status: 403,
          error: 'FORBIDDEN',
          message: 'Only Super Admins, Admins, or Project Managers can assign teams to projects.',
        });
      }

      const uniqueTeamIds = Array.from(new Set(request.body.teamIds));

      // Validate all team IDs exist
      const validTeams = uniqueTeamIds.length > 0
        ? await db.query.teams.findMany({ where: inArray(teams.id, uniqueTeamIds) })
        : [];
      const validTeamIds = validTeams.map((t) => t.id);

      // Replace projectTeams rows
      await db.delete(projectTeams).where(eq(projectTeams.projectId, targetProject.id));
      if (validTeamIds.length > 0) {
        await db.insert(projectTeams).values(
          validTeamIds.map((teamId) => ({
            projectId: targetProject.id,
            teamId,
          }))
        );
      }

      // Sync primaryTeamId to the first assigned team (or null) for backwards compatibility
      await db
        .update(projects)
        .set({
          primaryTeamId: validTeamIds[0] || null,
          updatedAt: new Date(),
        })
        .where(eq(projects.id, targetProject.id));

      const teamNames = validTeams.map((t) => `${t.name} (${t.keyPrefix})`).join(', ');
      await db.insert(projectActivityLogs).values({
        projectId: targetProject.id,
        userId: user.id,
        action: 'TEAMS_UPDATED',
        details: `${user.fullName} updated assigned teams: ${teamNames || 'None'}`,
      });

      return reply.send({ data: { teamIds: validTeamIds, teams: validTeams } });
    }
  );

  // 5b. GitHub Integration: Get Config
  app.get(
    '/:key/github',
    {
      schema: {
        description: 'Get project GitHub repository integration configuration',
        tags: ['Projects'],
        params: z.object({
          key: z.string(),
        }),
      },
    },
    async (request, reply) => {
      const { key } = request.params;
      const proj = await db.query.projects.findFirst({
        where: eq(projects.key, key),
      });
      if (!proj) return reply.status(404).send({ error: 'Project not found' });

      return reply.send({
        data: {
          owner: proj.githubRepoOwner,
          repo: proj.githubRepoName,
          lastSyncedAt: proj.githubLastSyncedAt,
          webhookUrl: `${process.env.API_URL || 'http://localhost:4000'}/api/v1/webhooks/github`,
        },
      });
    }
  );

  // 5c. GitHub Integration: Configure Repository
  app.post(
    '/:key/github/config',
    {
      schema: {
        description: 'Configure connected GitHub repository for the project',
        tags: ['Projects'],
        params: z.object({
          key: z.string(),
        }),
        body: z.object({
          owner: z.string().min(1).max(100),
          repo: z.string().min(1).max(150),
          token: z.string().optional(),
        }),
      },
    },
    async (request, reply) => {
      const user = await getCurrentUser(request);
      if (!user) return reply.status(401).send({ error: 'Unauthorized' });

      const { key } = request.params;
      const callerTierInfo = await getUserRoleTier(user.id, key);
      if (callerTierInfo.tier < 3) {
        return reply.status(403).send({
          type: 'https://errors.coretrack.internal/forbidden',
          title: 'Access Denied',
          status: 403,
          error: 'FORBIDDEN',
          message: 'Employees and Team Leads are not authorized to configure GitHub integration.',
        });
      }

      const { owner, repo, token } = request.body;

      const [updated] = await db
        .update(projects)
        .set({
          githubRepoOwner: owner.trim(),
          githubRepoName: repo.trim(),
          githubAccessToken: token?.trim() || null,
          updatedAt: new Date(),
        })
        .where(eq(projects.key, key))
        .returning();

      if (!updated) return reply.status(404).send({ error: 'Project not found' });

      await db.insert(projectActivityLogs).values({
        projectId: updated.id,
        userId: user.id,
        action: 'GITHUB_CONFIGURED',
        details: `Connected GitHub repository to ${owner}/${repo}`,
      });

      return reply.send({
        data: {
          owner: updated.githubRepoOwner,
          repo: updated.githubRepoName,
          lastSyncedAt: updated.githubLastSyncedAt,
        },
      });
    }
  );

  // 5d. GitHub Integration: Sync Pull Requests & Commits
  app.post(
    '/:key/github/sync',
    {
      schema: {
        description: 'Fetch recent Pull Requests and Commits from GitHub repository and link to project tasks',
        tags: ['Projects'],
        params: z.object({
          key: z.string(),
        }),
      },
    },
    async (request, reply) => {
      const user = await getCurrentUser(request);
      if (!user) return reply.status(401).send({ error: 'Unauthorized' });

      const { key } = request.params;
      const callerTierInfo = await getUserRoleTier(user.id, key);
      if (callerTierInfo.tier < 3) {
        return reply.status(403).send({
          type: 'https://errors.coretrack.internal/forbidden',
          title: 'Access Denied',
          status: 403,
          error: 'FORBIDDEN',
          message: 'Employees and Team Leads are not authorized to trigger GitHub sync.',
        });
      }

      const proj = await db.query.projects.findFirst({
        where: eq(projects.key, key),
      });

      if (!proj) return reply.status(404).send({ error: 'Project not found' });
      if (!proj.githubRepoOwner || !proj.githubRepoName) {
        return reply.status(400).send({
          error: 'REPO_NOT_CONFIGURED',
          message: 'GitHub repository is not configured for this project. Please set owner and repo first.',
        });
      }

      const owner = proj.githubRepoOwner;
      const repo = proj.githubRepoName;
      const headers: Record<string, string> = {
        'User-Agent': 'CoreTrack-Enterprise/1.0',
        Accept: 'application/vnd.github.v3+json',
      };
      if (proj.githubAccessToken) {
        headers['Authorization'] = `token ${proj.githubAccessToken}`;
      }

      let fetchedPulls = 0;
      let fetchedCommits = 0;
      let linkedItems = 0;

      try {
        // 1. Fetch Pull Requests
        const prsRes = await fetch(
          `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/pulls?state=all&per_page=30`,
          { headers }
        );
        if (prsRes.ok) {
          const prs = await prsRes.json();
          if (Array.isArray(prs)) {
            fetchedPulls = prs.length;
            for (const pr of prs) {
              const prTitle = pr.title || '';
              const branchName = pr.head?.ref || '';
              const prUrl = pr.html_url || '';
              const prNumber = pr.number;
              const author = pr.user?.login || 'developer';
              const isMerged = !!pr.merged_at;
              const isClosed = pr.state === 'closed' && !isMerged;

              const keyRegex = /([A-Z]{2,10}-\d+)/gi;
              const matches = new Set([
                ...(prTitle.match(keyRegex) || []),
                ...(branchName.match(keyRegex) || []),
              ]);

              for (const rawKey of matches) {
                const ticketKey = rawKey.toUpperCase();
                const ticket = await db.query.tickets.findFirst({
                  where: and(eq(tickets.ticketKey, ticketKey), eq(tickets.projectId, proj.id)),
                });

                if (ticket) {
                  await db
                    .insert(ticketVcsLinks)
                    .values({
                      ticketId: ticket.id,
                      provider: 'GITHUB',
                      linkType: 'PULL_REQUEST',
                      externalId: String(prNumber),
                      title: prTitle,
                      url: prUrl,
                      branchName,
                      status: isMerged ? 'MERGED' : isClosed ? 'CLOSED' : 'OPEN',
                      author,
                    })
                    .onConflictDoNothing();

                  linkedItems++;

                  if (isMerged && ticket.status !== 'DONE') {
                    await db
                      .update(tickets)
                      .set({ status: 'DONE', updatedAt: new Date() })
                      .where(eq(tickets.id, ticket.id));
                  }
                }
              }
            }
          }
        }

        // 2. Fetch Commits
        const commitsRes = await fetch(
          `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/commits?per_page=30`,
          { headers }
        );
        if (commitsRes.ok) {
          const commits = await commitsRes.json();
          if (Array.isArray(commits)) {
            fetchedCommits = commits.length;
            for (const c of commits) {
              const message = c.commit?.message || '';
              const commitUrl = c.html_url || '';
              const commitId = c.sha?.substring(0, 7) || 'HEAD';
              const author = c.commit?.author?.name || c.author?.login || 'developer';

              const keyRegex = /([A-Z]{2,10}-\d+)/gi;
              const matches = new Set<string>(message.match(keyRegex) || []);
              const isFix = /(?:fixes|closes|resolves)\s+[A-Z]{2,10}-\d+/i.test(message);

              for (const rawKey of matches) {
                const ticketKey = (rawKey as string).toUpperCase();
                const ticket = await db.query.tickets.findFirst({
                  where: and(eq(tickets.ticketKey, ticketKey), eq(tickets.projectId, proj.id)),
                });

                if (ticket) {
                  await db
                    .insert(ticketVcsLinks)
                    .values({
                      ticketId: ticket.id,
                      provider: 'GITHUB',
                      linkType: 'COMMIT',
                      externalId: commitId,
                      title: message.split('\n')[0].substring(0, 255),
                      url: commitUrl,
                      status: 'MERGED',
                      author,
                    })
                    .onConflictDoNothing();

                  linkedItems++;

                  if (isFix && ticket.status !== 'DONE') {
                    await db
                      .update(tickets)
                      .set({ status: 'DONE', updatedAt: new Date() })
                      .where(eq(tickets.id, ticket.id));
                  }
                }
              }
            }
          }
        }

        await db
          .update(projects)
          .set({ githubLastSyncedAt: new Date() })
          .where(eq(projects.id, proj.id));

        return reply.send({
          data: {
            success: true,
            fetchedPulls,
            fetchedCommits,
            linkedItems,
            syncedAt: new Date().toISOString(),
          },
        });
      } catch (err: any) {
        return reply.status(500).send({
          error: 'GITHUB_SYNC_ERROR',
          message: err.message || 'Network error fetching GitHub repository data',
        });
      }
    }
  );

  // 6. Project Milestones: Add
  app.post(
    '/:key/milestones',
    {
      schema: {
        description: 'Add a milestone to the project',
        tags: ['Projects'],
        params: z.object({
          key: z.string(),
        }),
        body: z.object({
          title: z.string().min(2).max(150),
          description: z.string().optional(),
          dueDate: z.string().datetime().optional().nullable(),
          status: z.enum(['PENDING', 'IN_PROGRESS', 'COMPLETED']).default('PENDING'),
          taskIds: z.array(z.string().uuid()).optional(),
        }),
      },
    },
    async (request, reply) => {
      const user = await getCurrentUser(request);
      if (!user) return reply.status(401).send({ error: 'Unauthorized' });

      const { key } = request.params;
      const callerTierInfo = await getUserRoleTier(user.id, key);
      if (callerTierInfo.tier < 3) {
        return reply.status(403).send({
          type: 'https://errors.coretrack.internal/forbidden',
          title: 'Access Denied',
          status: 403,
          error: 'FORBIDDEN',
          message: 'Employees and Team Leads are not authorized to create project milestones.',
        });
      }

      const targetProject = await db.query.projects.findFirst({
        where: eq(projects.key, key),
      });
      if (!targetProject) return reply.status(404).send({ error: 'Project not found' });

      const { title, description, dueDate, status, taskIds } = request.body;

      const [newMilestone] = await db
        .insert(projectMilestones)
        .values({
          projectId: targetProject.id,
          title,
          description: description || null,
          dueDate: dueDate ? new Date(dueDate) : null,
          status,
        })
        .returning();

      if (taskIds && taskIds.length > 0) {
        await db
          .update(tickets)
          .set({ milestoneId: newMilestone.id, updatedAt: new Date() })
          .where(and(eq(tickets.projectId, targetProject.id), inArray(tickets.id, taskIds)));

        const linkedTasks = await db.query.tickets.findMany({
          where: eq(tickets.milestoneId, newMilestone.id),
          columns: { id: true, status: true },
        });
        if (linkedTasks.length > 0) {
          const allDone = linkedTasks.every((t) =>
            ['DONE', 'RESOLVED', 'CLOSED'].includes(t.status.toUpperCase())
          );
          const anyActive = linkedTasks.some((t) =>
            ['IN_PROGRESS', 'IN_REVIEW', 'PENDING_APPROVAL'].includes(t.status.toUpperCase())
          );
          if (allDone) {
            await db
              .update(projectMilestones)
              .set({ status: 'COMPLETED', updatedAt: new Date() })
              .where(eq(projectMilestones.id, newMilestone.id));
            newMilestone.status = 'COMPLETED';
          } else if (anyActive && newMilestone.status === 'PENDING') {
            await db
              .update(projectMilestones)
              .set({ status: 'IN_PROGRESS', updatedAt: new Date() })
              .where(eq(projectMilestones.id, newMilestone.id));
            newMilestone.status = 'IN_PROGRESS';
          }
        }
      }

      await db.insert(projectActivityLogs).values({
        projectId: targetProject.id,
        userId: user.id,
        action: 'MILESTONE_ADDED',
        details: `${user.fullName} added milestone "${title}".`,
      });

      return reply.status(201).send({ data: newMilestone });
    }
  );

  // 7. Project Milestones: Update
  app.patch(
    '/:key/milestones/:id',
    {
      schema: {
        description: 'Update milestone status or details',
        tags: ['Projects'],
        params: z.object({
          key: z.string(),
          id: z.string().uuid(),
        }),
        body: z.object({
          title: z.string().min(2).max(150).optional(),
          description: z.string().optional(),
          dueDate: z.string().datetime().optional().nullable(),
          status: z.enum(['PENDING', 'IN_PROGRESS', 'COMPLETED']).optional(),
          taskIds: z.array(z.string().uuid()).optional(),
        }),
      },
    },
    async (request, reply) => {
      const user = await getCurrentUser(request);
      if (!user) return reply.status(401).send({ error: 'Unauthorized' });

      const { key, id } = request.params;
      const targetProject = await db.query.projects.findFirst({
        where: eq(projects.key, key),
      });
      if (!targetProject) return reply.status(404).send({ error: 'Project not found' });

      const updates = request.body;
      const updateData: Record<string, unknown> = {
        updatedAt: new Date(),
      };
      if (updates.title !== undefined) updateData.title = updates.title;
      if (updates.description !== undefined) updateData.description = updates.description;
      if (updates.dueDate !== undefined) updateData.dueDate = updates.dueDate ? new Date(updates.dueDate) : null;
      if (updates.status !== undefined) updateData.status = updates.status;

      const [updatedMilestone] = await db
        .update(projectMilestones)
        .set(updateData)
        .where(and(eq(projectMilestones.id, id), eq(projectMilestones.projectId, targetProject.id)))
        .returning();

      if (!updatedMilestone) return reply.status(404).send({ error: 'Milestone not found' });

      if (updates.taskIds !== undefined) {
        await db
          .update(tickets)
          .set({ milestoneId: null, updatedAt: new Date() })
          .where(and(eq(tickets.projectId, targetProject.id), eq(tickets.milestoneId, id)));

        if (updates.taskIds.length > 0) {
          await db
            .update(tickets)
            .set({ milestoneId: id, updatedAt: new Date() })
            .where(and(eq(tickets.projectId, targetProject.id), inArray(tickets.id, updates.taskIds)));

          const linkedTasks = await db.query.tickets.findMany({
            where: eq(tickets.milestoneId, id),
            columns: { id: true, status: true },
          });
          if (linkedTasks.length > 0) {
            const allDone = linkedTasks.every((t) =>
              ['DONE', 'RESOLVED', 'CLOSED'].includes(t.status.toUpperCase())
            );
            const anyActive = linkedTasks.some((t) =>
              ['IN_PROGRESS', 'IN_REVIEW', 'PENDING_APPROVAL'].includes(t.status.toUpperCase())
            );
            if (allDone && updatedMilestone.status !== 'COMPLETED') {
              await db
                .update(projectMilestones)
                .set({ status: 'COMPLETED', updatedAt: new Date() })
                .where(eq(projectMilestones.id, id));
              updatedMilestone.status = 'COMPLETED';
            } else if (!allDone && anyActive && updatedMilestone.status === 'PENDING') {
              await db
                .update(projectMilestones)
                .set({ status: 'IN_PROGRESS', updatedAt: new Date() })
                .where(eq(projectMilestones.id, id));
              updatedMilestone.status = 'IN_PROGRESS';
            }
          }
        }
      }

      if (updates.status === 'COMPLETED') {
        await db.insert(projectActivityLogs).values({
          projectId: targetProject.id,
          userId: user.id,
          action: 'MILESTONE_COMPLETED',
          details: `${user.fullName} completed milestone "${updatedMilestone.title}".`,
        });
      }

      return reply.send({ data: updatedMilestone });
    }
  );

  // 8. Project Milestones: Delete
  app.delete(
    '/:key/milestones/:id',
    {
      schema: {
        description: 'Delete milestone',
        tags: ['Projects'],
        params: z.object({
          key: z.string(),
          id: z.string().uuid(),
        }),
      },
    },
    async (request, reply) => {
      const user = await getCurrentUser(request);
      if (!user) return reply.status(401).send({ error: 'Unauthorized' });

      const { key, id } = request.params;
      const callerTierInfo = await getUserRoleTier(user.id, key);
      if (callerTierInfo.tier < 3) {
        return reply.status(403).send({
          type: 'https://errors.coretrack.internal/forbidden',
          title: 'Access Denied',
          status: 403,
          error: 'FORBIDDEN',
          message: 'Employees and Team Leads are not authorized to delete project milestones.',
        });
      }

      const targetProject = await db.query.projects.findFirst({
        where: eq(projects.key, key),
      });
      if (!targetProject) return reply.status(404).send({ error: 'Project not found' });

      await db
        .delete(projectMilestones)
        .where(and(eq(projectMilestones.id, id), eq(projectMilestones.projectId, targetProject.id)));

      return reply.send({ message: 'Milestone deleted successfully' });
    }
  );

  // 9. Delete Project (Super Admin & Admin Only)
  app.delete(
    '/:key',
    {
      schema: {
        description: 'Delete project and cascade delete all its tasks, sprints, and milestones',
        tags: ['Projects'],
        params: z.object({
          key: z.string(),
        }),
      },
    },
    async (request, reply) => {
      const user = await getCurrentUser(request);
      if (!user) return reply.status(401).send({ error: 'Unauthorized' });

      const { key } = request.params;
      const callerTierInfo = await getUserRoleTier(user.id, key);
      const { permissions } = await getEffectiveUserPermissions(user.id, key);
      const canDelete = callerTierInfo.tier >= 4 || hasPermission(permissions, Permissions.PROJECT_DELETE);

      if (!canDelete) {
        return reply.status(403).send({
          type: 'https://errors.coretrack.internal/forbidden',
          title: 'Access Denied',
          status: 403,
          error: 'FORBIDDEN',
          message: 'Projects can only be deleted by higher authorities (Super Admins & Admins).',
        });
      }

      const targetProject = await db.query.projects.findFirst({
        where: eq(projects.key, key),
      });
      if (!targetProject) return reply.status(404).send({ error: 'Project not found' });

      // Find all tickets of this project to remove child relations
      const projTickets = await db
        .select({ id: tickets.id })
        .from(tickets)
        .where(eq(tickets.projectId, targetProject.id));
      const ticketIds = projTickets.map((t) => t.id);

      if (ticketIds.length > 0) {
        await db.delete(ticketComments).where(inArray(ticketComments.ticketId, ticketIds));
        await db.delete(ticketAttachments).where(inArray(ticketAttachments.ticketId, ticketIds));
        await db.delete(ticketDependencies).where(
          or(
            inArray(ticketDependencies.sourceTicketId, ticketIds),
            inArray(ticketDependencies.targetTicketId, ticketIds)
          )
        );
        await db.delete(ticketApprovals).where(inArray(ticketApprovals.ticketId, ticketIds));
        await db.delete(ticketVcsLinks).where(inArray(ticketVcsLinks.ticketId, ticketIds));
        await db.delete(tickets).where(eq(tickets.projectId, targetProject.id));
      }

      await db.delete(projectMilestones).where(eq(projectMilestones.projectId, targetProject.id));
      await db.delete(projectActivityLogs).where(eq(projectActivityLogs.projectId, targetProject.id));
      await db.delete(projectMembers).where(eq(projectMembers.projectId, targetProject.id));
      await db.delete(projects).where(eq(projects.id, targetProject.id));

      return reply.send({ message: `Project ${key} deleted successfully` });
    }
  );
};
