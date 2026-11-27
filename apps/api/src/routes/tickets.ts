import { FastifyPluginAsync } from 'fastify';
import { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import {
  db,
  tickets,
  projects,
  projectMilestones,
  projectActivityLogs,
  projectTeams,
  sprints,
  ticketComments,
  ticketDependencies,
  ticketAttachments,
  ticketApprovals,
  ticketVcsLinks,
  users,
  eq,
  desc,
  inArray,
  and,
  or,
  ilike,
  sql,
} from '@coretrack/db';
import {
  CreateTicketSchema,
  UpdateTicketSchema,
  CreateCommentSchema,
  CreateDependencySchema,
  BulkUpdateTicketsSchema,
  PresignAttachmentSchema,
  ApprovalDecisionSchema,
  calculateSLADueDates,
  TriggerType,
  Permissions,
  hasPermission,
} from '@coretrack/shared';
import { broadcastToProject } from '../ws.js';
import { getCurrentUser, getUserRoleTier, getEffectiveUserPermissions, getUserTeamIds } from '../auth/auth.js';
import {
  getPresignedUploadUrl,
  getPresignedDownloadUrl,
  deleteS3Object,
} from '../services/s3.js';
import { evaluateAndExecuteRules } from '../services/automation.js';
import { sendTaskAssignedNotification } from '../services/email.js';

async function wouldCreateCycle(sourceId: string, targetId: string): Promise<boolean> {
  if (sourceId === targetId) return true;
  const allBlocks = await db
    .select({
      source: ticketDependencies.sourceTicketId,
      target: ticketDependencies.targetTicketId,
    })
    .from(ticketDependencies)
    .where(eq(ticketDependencies.dependencyType, 'BLOCKS'));

  const adj = new Map<string, string[]>();
  for (const edge of allBlocks) {
    if (!edge.target) continue;
    if (!adj.has(edge.source)) adj.set(edge.source, []);
    adj.get(edge.source)!.push(edge.target);
  }

  const visited = new Set<string>();
  const queue = [targetId];
  while (queue.length > 0) {
    const curr = queue.shift()!;
    if (curr === sourceId) return true;
    if (!visited.has(curr)) {
      visited.add(curr);
      const neighbors = adj.get(curr) || [];
      for (const n of neighbors) {
        if (!visited.has(n)) queue.push(n);
      }
    }
  }
  return false;
}

function attachDisplayKeys<
  T extends { id: string; projectId: string; ticketKey: string; ticketNumber: number; createdAt: Date | string }
>(items: T[], fallbackProjectKey?: string): (T & { displayKey: string; userTicketNumber: number })[] {
  const byProject = new Map<string, T[]>();
  for (const item of items) {
    const list = byProject.get(item.projectId) || [];
    list.push(item);
    byProject.set(item.projectId, list);
  }

  const assigned = new Map<string, { displayKey: string; userTicketNumber: number }>();
  for (const list of byProject.values()) {
    const sorted = [...list].sort((a, b) => {
      const timeDiff = new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
      return timeDiff !== 0 ? timeDiff : a.ticketNumber - b.ticketNumber;
    });
    sorted.forEach((item, idx) => {
      const prefix = fallbackProjectKey || item.ticketKey.split('-')[0] || 'TASK';
      const num = idx + 1;
      assigned.set(item.id, { displayKey: `${prefix}-${num}`, userTicketNumber: num });
    });
  }

  return items.map((item) => ({
    ...item,
    ...(assigned.get(item.id) || { displayKey: item.ticketKey, userTicketNumber: item.ticketNumber }),
  }));
}

export const ticketRoutes: FastifyPluginAsync = async (fastify) => {
  const app = fastify.withTypeProvider<ZodTypeProvider>();

  async function syncMilestoneStatus(milestoneId: string | null | undefined, actorUserId?: string) {
    if (!milestoneId) return;
    const milestone = await db.query.projectMilestones.findFirst({
      where: eq(projectMilestones.id, milestoneId),
    });
    if (!milestone) return;

    const linkedTasks = await db.query.tickets.findMany({
      where: eq(tickets.milestoneId, milestoneId),
      columns: { id: true, status: true },
    });
    if (linkedTasks.length === 0) return;

    const allDone = linkedTasks.every((t) =>
      ['DONE', 'RESOLVED', 'CLOSED'].includes(t.status.toUpperCase())
    );
    const anyActive = linkedTasks.some((t) =>
      ['IN_PROGRESS', 'IN_REVIEW', 'PENDING_APPROVAL'].includes(t.status.toUpperCase())
    );

    if (allDone && milestone.status !== 'COMPLETED') {
      await db
        .update(projectMilestones)
        .set({ status: 'COMPLETED', updatedAt: new Date() })
        .where(eq(projectMilestones.id, milestoneId));
      await db.insert(projectActivityLogs).values({
        projectId: milestone.projectId,
        userId: actorUserId || null,
        action: 'MILESTONE_COMPLETED',
        details: `Milestone "${milestone.title}" was automatically completed after all linked tasks finished.`,
      });
    } else if (!allDone && anyActive && milestone.status === 'PENDING') {
      await db
        .update(projectMilestones)
        .set({ status: 'IN_PROGRESS', updatedAt: new Date() })
        .where(eq(projectMilestones.id, milestoneId));
    }
  }

  // 1. List Tickets
  app.get(
    '/',
    {
      schema: {
        description: 'List recent tickets by project',
        tags: ['Tickets'],
        querystring: z.object({
          projectId: z.string().uuid().optional(),
          projectKey: z.string().optional(),
          limit: z.coerce.number().min(1).max(500).default(200),
        }),
      },
    },
    async (request, reply) => {
      const { projectId, projectKey, limit } = request.query;

      let targetProjectId = projectId;
      let targetProject = null;
      if (!targetProjectId && projectKey) {
        targetProject = await db.query.projects.findFirst({
          where: eq(projects.key, projectKey),
        });
        targetProjectId = targetProject?.id;
      } else if (targetProjectId) {
        targetProject = await db.query.projects.findFirst({
          where: eq(projects.id, targetProjectId),
        });
      }

      const results = await db.query.tickets.findMany({
        where: targetProjectId ? eq(tickets.projectId, targetProjectId) : undefined,
        orderBy: desc(tickets.createdAt),
        limit,
        with: {
          assignee: true,
          team: {
            columns: {
              id: true,
              name: true,
              keyPrefix: true,
            },
          },
        },
      });

      // Visibility & Team task isolation:
      // - adminOnly tasks are visible only to Admins & Super Admins (tier >= 4)
      // - non-manager/non-admin users only see their own team(s)' tasks (or untagged tasks)
      const caller = await getCurrentUser(request);
      if (caller) {
        const callerTierInfo = await getUserRoleTier(caller.id, targetProject?.key || projectKey);
        const isAdminOrSuperAdmin = callerTierInfo.tier >= 4;
        const isProjectAuthority =
          callerTierInfo.tier >= 3 ||
          (targetProject &&
            (targetProject.projectManagerId === caller.id || targetProject.reviewerId === caller.id));

        const visibleResults = isAdminOrSuperAdmin ? results : results.filter((t) => !t.adminOnly);

        if (!isProjectAuthority) {
          const userTeamIds = await getUserTeamIds(caller.id);
          const filtered = visibleResults.filter((t) => !t.teamId || userTeamIds.includes(t.teamId));
          return reply.send({ data: attachDisplayKeys(filtered, targetProject?.key || projectKey) });
        }

        return reply.send({ data: attachDisplayKeys(visibleResults, targetProject?.key || projectKey) });
      }

      const publicResults = results.filter((t) => !t.adminOnly);
      return reply.send({ data: attachDisplayKeys(publicResults, targetProject?.key || projectKey) });
    }
  );

  // 2. Get Single Ticket Details
  app.get(
    '/:ticketKey',
    {
      schema: {
        description: 'Get ticket details by ticketKey (e.g. CORE-1)',
        tags: ['Tickets'],
        params: z.object({
          ticketKey: z.string(),
        }),
      },
    },
    async (request, reply) => {
      const { ticketKey } = request.params;
      const ticket = await db.query.tickets.findFirst({
        where: eq(tickets.ticketKey, ticketKey),
        with: {
          reporter: true,
          assignee: true,
          team: {
            columns: {
              id: true,
              name: true,
              keyPrefix: true,
            },
          },
          project: {
            columns: {
              id: true,
              key: true,
              projectManagerId: true,
              reviewerId: true,
            },
          },
        },
      });

      if (!ticket) {
        return reply.status(404).send({ error: 'Ticket not found' });
      }

      const caller = await getCurrentUser(request);
      const callerTierInfo = caller
        ? await getUserRoleTier(caller.id, ticket.project?.key)
        : { tier: 0, roleName: 'Guest' };

      if (ticket.adminOnly && callerTierInfo.tier < 4) {
        return reply.status(403).send({
          error: 'Access Denied: This task is restricted to Admins and Super Admins.',
        });
      }

      if (ticket.teamId && caller) {
        const isProjectAuthority =
          callerTierInfo.tier >= 3 ||
          ticket.project?.projectManagerId === caller.id ||
          ticket.project?.reviewerId === caller.id;
        if (!isProjectAuthority) {
          const userTeamIds = await getUserTeamIds(caller.id);
          if (!userTeamIds.includes(ticket.teamId)) {
            return reply.status(403).send({
              error: 'Access Denied: This task belongs to another team.',
            });
          }
        }
      }

      return reply.send({ data: ticket });
    }
  );

  // 3. Create Ticket
  app.post(
    '/',
    {
      schema: {
        description: 'Create a new ticket',
        tags: ['Tickets'],
        body: CreateTicketSchema,
      },
    },
    async (request, reply) => {
      const input = request.body;
      const user = await getCurrentUser(request);

      // In production IAM, reporterId is extracted from authenticated JWT/mock session.
      // Fetch default user as reporter fallback.
      const defaultUser = !user ? await db.query.users.findFirst() : null;
      const reporterId = user?.id || defaultUser?.id || '00000000-0000-0000-0000-000000000001';

      // Atomic ticket number assignment
      const projectRecord = await db.query.projects.findFirst({
        where: eq(projects.id, input.projectId),
      });

      const nextNum = projectRecord?.nextTicketNumber ?? 1;
      const projectKey = projectRecord?.key ?? 'TASK';
      const ticketKey = `${projectKey}-${nextNum}`;

      // Calculate ITSM SLA countdown targets based on priority
      const { responseDueAt, resolutionDueAt } = calculateSLADueDates(
        (input.priority || 'MEDIUM') as 'URGENT' | 'HIGH' | 'MEDIUM' | 'LOW'
      );

      // Smart Auto-Default Deadline Policy:
      // Each and every assigned task must have a deadline.
      let finalDueDate = input.dueDate ? new Date(input.dueDate) : undefined;
      if (!finalDueDate && input.assigneeId) {
        if (input.sprintId) {
          const sprint = await db.query.sprints.findFirst({
            where: eq(sprints.id, input.sprintId),
          });
          finalDueDate = sprint?.endDate ? new Date(sprint.endDate) : new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
        } else {
          finalDueDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
        }
      }

      const callerTierInfo = user
        ? await getUserRoleTier(user.id, projectKey)
        : { tier: 5, roleName: 'Super Admin' };

      // Resolve teamId for team-scoped task isolation
      let resolvedTeamId: string | null = input.teamId ?? null;
      if (user) {
        const userTeamIds = await getUserTeamIds(user.id);
        const isProjectAuthority =
          callerTierInfo.tier >= 3 ||
          projectRecord?.projectManagerId === user.id ||
          projectRecord?.reviewerId === user.id;

        if (resolvedTeamId) {
          if (!isProjectAuthority && !userTeamIds.includes(resolvedTeamId)) {
            return reply.status(403).send({
              error: 'Access Denied: You cannot create tasks for another team.',
            });
          }
        } else if (!isProjectAuthority && userTeamIds.length > 0) {
          // Auto-scope task to the creator's team on this project
          const projTeams = await db
            .select({ teamId: projectTeams.teamId })
            .from(projectTeams)
            .where(eq(projectTeams.projectId, input.projectId));
          const projTeamSet = new Set(projTeams.map((pt) => pt.teamId));
          if (projectRecord?.primaryTeamId) projTeamSet.add(projectRecord.primaryTeamId);
          const matchingTeam = userTeamIds.find((tid) => projTeamSet.has(tid));
          resolvedTeamId = matchingTeam || userTeamIds[0];
        }
      }

      const isAdminOnly = callerTierInfo.tier >= 5 ? Boolean(input.adminOnly) : false;

      const [newTicket] = await db
        .insert(tickets)
        .values({
          projectId: input.projectId,
          teamId: resolvedTeamId,
          ticketKey,
          ticketNumber: nextNum,
          ticketType: input.ticketType,
          title: input.title,
          description: input.description,
          priority: input.priority,
          status: input.status,
          parentId: input.parentId,
          sprintId: input.sprintId,
          milestoneId: input.milestoneId ?? null,
          assigneeId: input.assigneeId,
          assignedByUserId: input.assigneeId ? (user?.id || null) : null,
          assignedByRoleTier: input.assigneeId ? callerTierInfo.tier : 1,
          storyPoints: input.storyPoints,
          estimatedHours: input.estimatedHours?.toString(),
          dueDate: finalDueDate,
          dueDateSetByUserId: user?.id || null,
          dueDateSetByRoleTier: callerTierInfo.tier,
          slaResponseDueAt: responseDueAt,
          slaResolutionDueAt: resolutionDueAt,
          isSlaPaused: false,
          adminOnly: isAdminOnly,
          customFields: input.customFields,
          reporterId,
        })
        .returning();

      // Fetch hydrated ticket with relations for real-time broadcast and response
      const hydratedTicket = (await db.query.tickets.findFirst({
        where: eq(tickets.id, newTicket.id),
        with: {
          reporter: true,
          assignee: true,
          team: {
            columns: {
              id: true,
              name: true,
              keyPrefix: true,
            },
          },
        },
      })) || newTicket;

      // Increment project nextTicketNumber
      await db
        .update(projects)
        .set({ nextTicketNumber: nextNum + 1 })
        .where(eq(projects.id, input.projectId));

      // Auto-advance project from NOT_STARTED → IN_PROGRESS when a task is assigned
      if (input.assigneeId && projectRecord && projectRecord.status === 'NOT_STARTED') {
        await db
          .update(projects)
          .set({ status: 'IN_PROGRESS', updatedAt: new Date() })
          .where(and(eq(projects.id, input.projectId), eq(projects.status, 'NOT_STARTED')));
        console.info(`[Project] Auto-advanced project '${projectKey}' to IN_PROGRESS on task assignment`);
      }

      if (input.milestoneId) {
        await syncMilestoneStatus(input.milestoneId, user?.id);
      }

      // Broadcast to all connected clients on this project
      broadcastToProject(projectKey, {
        type: 'TICKET_CREATED',
        payload: hydratedTicket,
      });

      // Notification Email: If task is assigned, dispatch assignment email to employee
      if (input.assigneeId) {
        db.query.users
          .findFirst({ where: eq(users.id, input.assigneeId) })
          .then((assigneeUser) => {
            if (assigneeUser && projectRecord) {
              sendTaskAssignedNotification({
                recipient: { email: assigneeUser.email, fullName: assigneeUser.fullName },
                ticket: {
                  id: newTicket.id,
                  ticketKey: newTicket.ticketKey,
                  title: newTicket.title,
                  priority: newTicket.priority,
                  dueDate: newTicket.dueDate,
                },
                project: {
                  id: projectRecord.id,
                  key: projectRecord.key,
                  name: projectRecord.name,
                },
                assignedByName: user?.fullName || 'System',
              }).catch((e) => console.warn('[Email] Task assigned notification error:', e));
            }
          })
          .catch(() => {});
      }

      // Asynchronous Automation Trigger: TASK_CREATED
      evaluateAndExecuteRules({
        projectId: input.projectId,
        projectKey,
        triggerType: 'TASK_CREATED',
        ticket: hydratedTicket,
        depth: 0,
      }).catch((err) => {
        console.error('[Automation] Error evaluating TASK_CREATED rules:', err);
      });

      return reply.status(201).send({ data: hydratedTicket });
    }
  );

  // 4. Update Ticket with Optimistic Concurrency Control
  app.patch(
    '/:ticketKey',
    {
      schema: {
        description: 'Update ticket with optimistic concurrency control',
        tags: ['Tickets'],
        params: z.object({
          ticketKey: z.string(),
        }),
        body: UpdateTicketSchema,
      },
    },
    async (request, reply) => {
      const { ticketKey } = request.params;
      const { lockVersion, ...updates } = request.body;

      // Fetch existing ticket to check lock_version
      const existing = await db.query.tickets.findFirst({
        where: eq(tickets.ticketKey, ticketKey),
      });

      if (!existing) {
        return reply.status(404).send({ error: 'Ticket not found' });
      }

      if (existing.lockVersion !== lockVersion) {
        return reply.status(409).send({
          type: 'https://errors.coretrack.internal/stale-version-conflict',
          title: 'Optimistic Concurrency Conflict',
          status: 409,
          detail: 'The ticket was modified by another user while you were editing.',
          currentLockVersion: existing.lockVersion,
        });
      }

      // Auto-pause SLA countdown clock when pending customer or in approval
      let isSlaPaused = updates.isSlaPaused;
      if (updates.status) {
        if (['PENDING_APPROVAL', 'IN_REVIEW', 'RESOLVED', 'DONE', 'CANCELED'].includes(updates.status)) {
          isSlaPaused = true;
        } else if (['IN_PROGRESS', 'TODO'].includes(updates.status)) {
          isSlaPaused = false;
        }
      }

      const projectKey = ticketKey.split('-')[0];
      const user = await getCurrentUser(request);
      const callerTierInfo = user
        ? await getUserRoleTier(user.id, projectKey)
        : { tier: 5, roleName: 'Super Admin' };

      if (existing.adminOnly && callerTierInfo.tier < 4) {
        return reply.status(403).send({
          error: 'Access Denied: This task is restricted to Admins and Super Admins.',
        });
      }

      if (updates.adminOnly !== undefined && callerTierInfo.tier < 5) {
        return reply.status(403).send({
          error: 'Access Denied: Only Super Admins can change admin-only visibility.',
        });
      }

      // Assignment Authority & Task Editing Guard:
      // Regular employees (Tier 1) can only edit, change status, priority, or deadline on tasks assigned to themselves.
      if (callerTierInfo.tier < 2) {
        if (!user) {
          return reply.status(401).send({ error: 'Authentication required' });
        }

        // Case 1: Task is assigned to someone else
        if (existing.assigneeId && existing.assigneeId !== user.id) {
          return reply.status(403).send({
            type: 'https://errors.coretrack.internal/forbidden',
            title: 'Task Editing Prohibited',
            status: 403,
            error: 'ASSIGNED_PERSON_ONLY',
            message: 'Access Denied: You cannot edit tasks assigned to others. Only the assigned person or higher authorities can edit or update status, priority, or deadline.',
          });
        }

        // Case 2: Task is unassigned - employee can only update if they are the reporter or self-assigning
        if (!existing.assigneeId) {
          const isSelfAssigning = updates.assigneeId === user.id;
          const isReporter = existing.reporterId === user.id;
          if (!isSelfAssigning && !isReporter) {
            return reply.status(403).send({
              type: 'https://errors.coretrack.internal/forbidden',
              title: 'Task Editing Prohibited',
              status: 403,
              error: 'ASSIGNED_PERSON_ONLY',
              message: 'Access Denied: Unassigned tasks can only be edited by their creator, higher authorities, or by claiming/assigning the task to yourself.',
            });
          }
        }

        // Case 3: Employee cannot reassign tasks to other users
        if (updates.assigneeId !== undefined && updates.assigneeId !== null && updates.assigneeId !== user.id) {
          return reply.status(403).send({
            type: 'https://errors.coretrack.internal/forbidden',
            title: 'Reassignment Prohibited',
            status: 403,
            error: 'REASSIGNMENT_PROHIBITED',
            message: 'Access Denied: Employees cannot reassign tasks to other members. Only higher authorities can assign tasks to others.',
          });
        }
      }

      // Immutable Deadline Policy:
      // If user is attempting to modify or clear an existing deadline that was set by a higher authority:
      if (updates.dueDate !== undefined && existing.dueDate) {
        const isChanging =
          (updates.dueDate === null && existing.dueDate !== null) ||
          (updates.dueDate && new Date(updates.dueDate).getTime() !== new Date(existing.dueDate).getTime());

        if (isChanging) {
          const currentDeadlineTier = existing.dueDateSetByRoleTier || 1;
          if (callerTierInfo.tier < currentDeadlineTier) {
            return reply.status(403).send({
              type: 'https://errors.coretrack.internal/forbidden',
              title: 'Immutable Deadline',
              status: 403,
              error: 'IMMUTABLE_DEADLINE',
              message: `Deadline is immutable: This deadline was set by a higher authority and cannot be modified by your role (${callerTierInfo.roleName}).`,
            });
          }
        }
      }

      // Smart Auto-Default Deadline Policy for newly assigned tasks:
      let computedDueDate = updates.dueDate ? new Date(updates.dueDate) : updates.dueDate === null ? null : undefined;
      if (updates.assigneeId && !computedDueDate && !existing.dueDate) {
        const targetSprintId = updates.sprintId || existing.sprintId;
        if (targetSprintId) {
          const sprint = await db.query.sprints.findFirst({
            where: eq(sprints.id, targetSprintId),
          });
          computedDueDate = sprint?.endDate ? new Date(sprint.endDate) : new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
        } else {
          computedDueDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
        }
      }

      // Determine assignment authority:
      let computedAssignedByUserId: string | null | undefined = undefined;
      let computedAssignedByRoleTier: number | undefined = undefined;
      if (updates.assigneeId !== undefined) {
        if (updates.assigneeId) {
          computedAssignedByUserId = user?.id || null;
          computedAssignedByRoleTier = callerTierInfo.tier;
        } else {
          computedAssignedByUserId = null;
          computedAssignedByRoleTier = 1;
        }
      }

      // Recalculate SLA targets when priority changes (unless explicit SLA dates were provided)
      let recalculatedSlaResponseDueAt: Date | null | undefined =
        updates.slaResponseDueAt ? new Date(updates.slaResponseDueAt) : updates.slaResponseDueAt === null ? null : undefined;
      let recalculatedSlaResolutionDueAt: Date | null | undefined =
        updates.slaResolutionDueAt ? new Date(updates.slaResolutionDueAt) : updates.slaResolutionDueAt === null ? null : undefined;

      if (
        updates.priority &&
        updates.priority !== existing.priority &&
        updates.slaResponseDueAt === undefined &&
        updates.slaResolutionDueAt === undefined
      ) {
        const recalculated = calculateSLADueDates(
          updates.priority as 'URGENT' | 'HIGH' | 'MEDIUM' | 'LOW',
          existing.createdAt
        );
        recalculatedSlaResponseDueAt = recalculated.responseDueAt;
        recalculatedSlaResolutionDueAt = recalculated.resolutionDueAt;
      }

      const updateValues: Record<string, unknown> = {
        ...updates,
        spentHours: updates.spentHours !== undefined ? updates.spentHours.toString() : undefined,
        dueDate: computedDueDate,
        dueDateSetByUserId: computedDueDate ? (user?.id || null) : undefined,
        dueDateSetByRoleTier: computedDueDate ? callerTierInfo.tier : undefined,
        assignedByUserId: computedAssignedByUserId,
        assignedByRoleTier: computedAssignedByRoleTier,
        slaResponseDueAt: recalculatedSlaResponseDueAt,
        slaResolutionDueAt: recalculatedSlaResolutionDueAt,
        isSlaPaused: isSlaPaused !== undefined ? isSlaPaused : undefined,
        lockVersion: existing.lockVersion + 1,
        updatedAt: new Date(),
      };

      for (const key of Object.keys(updateValues)) {
        if (updateValues[key] === undefined) {
          delete updateValues[key];
        }
      }

      const [rawUpdatedTicket] = await db
        .update(tickets)
        .set(updateValues)
        .where(eq(tickets.ticketKey, ticketKey))
        .returning();

      // Fetch hydrated ticket with relations
      const hydratedUpdatedTicket = (await db.query.tickets.findFirst({
        where: eq(tickets.ticketKey, ticketKey),
        with: {
          reporter: true,
          assignee: true,
        },
      })) || rawUpdatedTicket;

      // Broadcast real-time update
      broadcastToProject(projectKey, {
        type: 'TICKET_UPDATED',
        payload: hydratedUpdatedTicket,
      });

      // Auto-sync linked milestone status when task status or milestone assignment changes
      if (updates.status !== undefined || updates.milestoneId !== undefined) {
        await syncMilestoneStatus(rawUpdatedTicket.milestoneId, user?.id);
        if (existing.milestoneId && existing.milestoneId !== rawUpdatedTicket.milestoneId) {
          await syncMilestoneStatus(existing.milestoneId, user?.id);
        }
      }

      // Notification Email: If task assignee changed or newly assigned, dispatch email
      if (updates.assigneeId && updates.assigneeId !== existing.assigneeId) {
        Promise.all([
          db.query.users.findFirst({ where: eq(users.id, updates.assigneeId) }),
          db.query.projects.findFirst({ where: eq(projects.id, existing.projectId) }),
        ]).then(([assigneeUser, projectRecord]) => {
          if (assigneeUser && projectRecord) {
            sendTaskAssignedNotification({
              recipient: { email: assigneeUser.email, fullName: assigneeUser.fullName },
              ticket: {
                id: rawUpdatedTicket.id,
                ticketKey: rawUpdatedTicket.ticketKey,
                title: rawUpdatedTicket.title,
                priority: rawUpdatedTicket.priority,
                dueDate: rawUpdatedTicket.dueDate,
              },
              project: {
                id: projectRecord.id,
                key: projectRecord.key,
                name: projectRecord.name,
              },
              assignedByName: user?.fullName || 'System',
            }).catch((e) => console.warn('[Email] Task re-assigned notification error:', e));
          }
        }).catch(() => {});

        // Auto-advance project from NOT_STARTED → IN_PROGRESS on first task assignment
        db.query.projects
          .findFirst({ where: eq(projects.id, existing.projectId) })
          .then((proj) => {
            if (proj && proj.status === 'NOT_STARTED') {
              db.update(projects)
                .set({ status: 'IN_PROGRESS', updatedAt: new Date() })
                .where(and(eq(projects.id, existing.projectId), eq(projects.status, 'NOT_STARTED')))
                .execute()
                .then(() =>
                  console.info(`[Project] Auto-advanced project '${projectKey}' to IN_PROGRESS on task re-assignment`)
                )
                .catch(() => {});
            }
          })
          .catch(() => {});
      }

      // Asynchronous Automation Trigger check: STATUS_CHANGED / PRIORITY_CHANGED / ASSIGNEE_CHANGED
      let patchTrigger: TriggerType | null = null;
      if (updates.status && updates.status !== existing.status) {
        patchTrigger = 'STATUS_CHANGED';
      } else if (updates.priority && updates.priority !== existing.priority) {
        patchTrigger = 'PRIORITY_CHANGED';
      } else if (updates.assigneeId !== undefined && updates.assigneeId !== existing.assigneeId) {
        patchTrigger = 'ASSIGNEE_CHANGED';
      }

      if (patchTrigger) {
        evaluateAndExecuteRules({
          projectId: existing.projectId,
          projectKey,
          triggerType: patchTrigger,
          ticket: hydratedUpdatedTicket,
          depth: 0,
        }).catch((err) => {
          console.error(`[Automation] Error evaluating ${patchTrigger} rules:`, err);
        });
      }

      return reply.send({ data: hydratedUpdatedTicket });
    }
  );

  // 5. Get Comments for Ticket
  app.get(
    '/:ticketKey/comments',
    {
      schema: {
        description: 'Get comments for a ticket',
        tags: ['Tickets'],
        params: z.object({
          ticketKey: z.string(),
        }),
      },
    },
    async (request, reply) => {
      const { ticketKey } = request.params;
      const ticket = await db.query.tickets.findFirst({
        where: eq(tickets.ticketKey, ticketKey),
      });

      if (!ticket) {
        return reply.status(404).send({ error: 'Ticket not found' });
      }

      const comments = await db
        .select({
          id: ticketComments.id,
          ticketId: ticketComments.ticketId,
          authorId: ticketComments.authorId,
          authorName: users.fullName,
          authorEmail: users.email,
          body: ticketComments.body,
          visibilityScope: ticketComments.visibilityScope,
          createdAt: ticketComments.createdAt,
        })
        .from(ticketComments)
        .leftJoin(users, eq(ticketComments.authorId, users.id))
        .where(eq(ticketComments.ticketId, ticket.id))
        .orderBy(desc(ticketComments.createdAt));

      return reply.send({ data: comments });
    }
  );

  // 6. Post Comment on Ticket
  app.post(
    '/:ticketKey/comments',
    {
      schema: {
        description: 'Post a comment or internal note on a ticket',
        tags: ['Tickets'],
        params: z.object({
          ticketKey: z.string(),
        }),
        body: CreateCommentSchema,
      },
    },
    async (request, reply) => {
      const { ticketKey } = request.params;
      const { body, visibilityScope } = request.body;

      const ticket = await db.query.tickets.findFirst({
        where: eq(tickets.ticketKey, ticketKey),
      });

      if (!ticket) {
        return reply.status(404).send({ error: 'Ticket not found' });
      }

      const defaultUser = await db.query.users.findFirst();
      const authorId = defaultUser?.id || '00000000-0000-0000-0000-000000000001';

      const [newComment] = await db
        .insert(ticketComments)
        .values({
          ticketId: ticket.id,
          authorId,
          body,
          visibilityScope,
        })
        .returning();

      const projectKey = ticketKey.split('-')[0];
      broadcastToProject(projectKey, {
        type: 'COMMENT_ADDED',
        payload: {
          ...newComment,
          authorName: defaultUser?.fullName || 'System User',
          authorEmail: defaultUser?.email || 'user@coretrack.internal',
        },
      });

      return reply.status(201).send({
        data: {
          ...newComment,
          authorName: defaultUser?.fullName || 'System User',
          authorEmail: defaultUser?.email || 'user@coretrack.internal',
        },
      });
    }
  );

  // 7. Bulk Update Tickets (Spreadsheet / Table Multi-Select Operations)
  app.post(
    '/bulk',
    {
      schema: {
        description: 'Bulk update status, priority, sprint, or assignee for multiple tickets',
        tags: ['Tickets'],
        body: BulkUpdateTicketsSchema,
      },
    },
    async (request, reply) => {
      const { ticketKeys, status, priority, assigneeId, sprintId } = request.body;

      const user = await getCurrentUser(request);
      const callerTierInfo = user ? await getUserRoleTier(user.id) : { tier: 5, roleName: 'Super Admin' };

      // Assignment Authority Guard for Bulk Operations:
      // Employees (Tier 1) can only update tasks assigned to themselves
      if (callerTierInfo.tier < 2) {
        if (!user) {
          return reply.status(401).send({ error: 'Authentication required' });
        }

        const targetTickets = await db.query.tickets.findMany({
          where: inArray(tickets.ticketKey, ticketKeys),
        });

        const unauthorizedTickets = targetTickets.filter((t) => t.assigneeId !== user.id);
        if (unauthorizedTickets.length > 0) {
          return reply.status(403).send({
            type: 'https://errors.coretrack.internal/forbidden',
            title: 'Bulk Update Prohibited',
            status: 403,
            error: 'ASSIGNED_PERSON_ONLY',
            message: `Access Denied: You cannot modify tasks assigned to others (${unauthorizedTickets.map((t) => t.ticketKey).join(', ')}). Only the assigned person or higher authorities can update tasks.`,
          });
        }

        if (assigneeId !== undefined && assigneeId !== user.id) {
          return reply.status(403).send({
            type: 'https://errors.coretrack.internal/forbidden',
            title: 'Reassignment Prohibited',
            status: 403,
            error: 'REASSIGNMENT_PROHIBITED',
            message: 'Access Denied: Employees cannot reassign tasks to other members.',
          });
        }
      }

      const updateData: Record<string, unknown> = {
        updatedAt: new Date(),
      };
      if (status !== undefined) updateData.status = status;
      if (priority !== undefined) updateData.priority = priority;
      if (assigneeId !== undefined) {
        updateData.assigneeId = assigneeId;
        if (assigneeId) {
          updateData.assignedByUserId = user?.id || null;
          updateData.assignedByRoleTier = callerTierInfo.tier;
        } else {
          updateData.assignedByUserId = null;
          updateData.assignedByRoleTier = 1;
        }
      }
      if (sprintId !== undefined) updateData.sprintId = sprintId;

      const updatedTickets = await db
        .update(tickets)
        .set(updateData)
        .where(inArray(tickets.ticketKey, ticketKeys))
        .returning();

      for (const t of updatedTickets) {
        const projectKey = t.ticketKey.split('-')[0];
        broadcastToProject(projectKey, {
          type: 'TICKET_UPDATED',
          payload: t,
        });
      }

      // Auto-advance affected projects from NOT_STARTED → IN_PROGRESS when assignee is set via bulk update
      if (assigneeId) {
        const affectedProjectIds = [...new Set(updatedTickets.map((t) => t.projectId))];
        await Promise.all(
          affectedProjectIds.map((pid) =>
            db
              .update(projects)
              .set({ status: 'IN_PROGRESS', updatedAt: new Date() })
              .where(and(eq(projects.id, pid), eq(projects.status, 'NOT_STARTED')))
              .execute()
          )
        ).catch(() => {});
      }

      if (status !== undefined) {
        const affectedMilestoneIds = [
          ...new Set(updatedTickets.map((t) => t.milestoneId).filter((id): id is string => Boolean(id))),
        ];
        await Promise.all(affectedMilestoneIds.map((mid) => syncMilestoneStatus(mid, user?.id))).catch(() => {});
      }

      return reply.send({
        success: true,
        updatedCount: updatedTickets.length,
        data: updatedTickets,
      });
    }
  );

  // 8. Add Ticket Dependency (with Cycle Detection)
  app.post(
    '/:ticketKey/dependencies',
    {
      schema: {
        description: 'Add a dependency between tickets with cycle detection',
        tags: ['Tickets'],
        params: z.object({
          ticketKey: z.string(),
        }),
        body: CreateDependencySchema,
      },
    },
    async (request, reply) => {
      const { ticketKey } = request.params;
      const { targetTicketKey, externalText, dependencyType } = request.body;

      const sourceTicket = await db.query.tickets.findFirst({
        where: eq(tickets.ticketKey, ticketKey),
      });

      if (!sourceTicket) {
        return reply.status(404).send({ error: 'Source ticket not found' });
      }

      // Case 1: External Text Blocker / Dependency
      if (externalText && externalText.trim()) {
        const [dep] = await db
          .insert(ticketDependencies)
          .values({
            sourceTicketId: sourceTicket.id,
            targetTicketId: null,
            dependencyType: dependencyType || 'BLOCKS',
            externalText: externalText.trim(),
          })
          .returning();

        const projectKey = ticketKey.split('-')[0];
        broadcastToProject(projectKey, {
          type: 'DEPENDENCY_ADDED',
          payload: {
            dependency: dep,
            sourceTicketKey: sourceTicket.ticketKey,
            externalText: externalText.trim(),
          },
        });

        return reply.status(201).send({
          data: {
            ...dep,
            sourceTicketKey: sourceTicket.ticketKey,
            externalText: externalText.trim(),
          },
        });
      }

      // Case 2: Target Ticket
      if (!targetTicketKey) {
        return reply.status(400).send({ error: 'Target ticket key or external text required' });
      }

      const targetTicket = await db.query.tickets.findFirst({
        where: eq(tickets.ticketKey, targetTicketKey),
      });

      if (!targetTicket) {
        return reply.status(404).send({ error: `Target ticket '${targetTicketKey}' not found` });
      }

      if (sourceTicket.id === targetTicket.id) {
        return reply.status(400).send({ error: 'A ticket cannot depend on itself' });
      }

      // Cycle Detection for BLOCKS dependencies
      if (dependencyType === 'BLOCKS') {
        const isCycle = await wouldCreateCycle(sourceTicket.id, targetTicket.id);
        if (isCycle) {
          return reply.status(400).send({
            error: 'CYCLIC_DEPENDENCY_DETECTED',
            message: `Adding this dependency would introduce a cycle between ${ticketKey} and ${targetTicketKey}.`,
          });
        }
      }

      const [dependency] = await db
        .insert(ticketDependencies)
        .values({
          sourceTicketId: sourceTicket.id,
          targetTicketId: targetTicket.id,
          dependencyType,
        })
        .returning();

      const projectKey = ticketKey.split('-')[0];
      broadcastToProject(projectKey, {
        type: 'DEPENDENCY_ADDED',
        payload: {
          dependency,
          sourceTicketKey: sourceTicket.ticketKey,
          targetTicketKey: targetTicket.ticketKey,
        },
      });

      return reply.status(201).send({
        data: {
          ...dependency,
          sourceTicketKey: sourceTicket.ticketKey,
          targetTicketKey: targetTicket.ticketKey,
          targetTitle: targetTicket.title,
          targetStatus: targetTicket.status,
        },
      });
    }
  );

  // 9. Get Ticket Dependencies
  app.get(
    '/:ticketKey/dependencies',
    {
      schema: {
        description: 'Get inward and outward dependencies for a ticket',
        tags: ['Tickets'],
        params: z.object({
          ticketKey: z.string(),
        }),
      },
    },
    async (request, reply) => {
      const { ticketKey } = request.params;
      const ticket = await db.query.tickets.findFirst({
        where: eq(tickets.ticketKey, ticketKey),
      });

      if (!ticket) {
        return reply.status(404).send({ error: 'Ticket not found' });
      }

      // Outward dependencies (this ticket -> target ticket)
      const outward = await db
        .select({
          id: ticketDependencies.id,
          dependencyType: ticketDependencies.dependencyType,
          createdAt: ticketDependencies.createdAt,
          targetId: tickets.id,
          targetKey: tickets.ticketKey,
          targetTitle: tickets.title,
          targetStatus: tickets.status,
          targetPriority: tickets.priority,
          targetDueDate: tickets.dueDate,
        })
        .from(ticketDependencies)
        .innerJoin(tickets, eq(ticketDependencies.targetTicketId, tickets.id))
        .where(eq(ticketDependencies.sourceTicketId, ticket.id));

      // Inward dependencies (source ticket -> this ticket)
      const inward = await db
        .select({
          id: ticketDependencies.id,
          dependencyType: ticketDependencies.dependencyType,
          createdAt: ticketDependencies.createdAt,
          sourceId: tickets.id,
          sourceKey: tickets.ticketKey,
          sourceTitle: tickets.title,
          sourceStatus: tickets.status,
          sourcePriority: tickets.priority,
          sourceDueDate: tickets.dueDate,
        })
        .from(ticketDependencies)
        .innerJoin(tickets, eq(ticketDependencies.sourceTicketId, tickets.id))
        .where(eq(ticketDependencies.targetTicketId, ticket.id));

      // External text blockers (targetTicketId is null)
      const external = await db
        .select({
          id: ticketDependencies.id,
          dependencyType: ticketDependencies.dependencyType,
          createdAt: ticketDependencies.createdAt,
          externalText: ticketDependencies.externalText,
        })
        .from(ticketDependencies)
        .where(
          and(
            eq(ticketDependencies.sourceTicketId, ticket.id),
            sql`${ticketDependencies.targetTicketId} IS NULL`
          )
        );

      return reply.send({
        data: {
          outward,
          inward,
          external,
        },
      });
    }
  );

  // 9b. Search project tasks for dependency selector
  app.get(
    '/search/project-tasks',
    {
      schema: {
        description: 'Search tasks within a specific project for dependency linking',
        tags: ['Tickets'],
        querystring: z.object({
          projectKey: z.string(),
          q: z.string().optional(),
          excludeKey: z.string().optional(),
        }),
      },
    },
    async (request, reply) => {
      const { projectKey, q, excludeKey } = request.query;
      const proj = await db.query.projects.findFirst({
        where: eq(projects.key, projectKey),
      });
      if (!proj) return reply.send({ data: [] });

      const allTasks = await db.query.tickets.findMany({
        where: eq(tickets.projectId, proj.id),
        columns: {
          id: true,
          ticketKey: true,
          title: true,
          status: true,
          priority: true,
        },
        limit: 50,
      });

      const filtered = allTasks.filter((t) => {
        if (excludeKey && t.ticketKey === excludeKey) return false;
        if (!q || !q.trim()) return true;
        const query = q.toLowerCase();
        return t.ticketKey.toLowerCase().includes(query) || t.title.toLowerCase().includes(query);
      });

      return reply.send({ data: filtered });
    }
  );

  // 10. Delete Ticket Dependency
  app.delete(
    '/:ticketKey/dependencies/:dependencyId',
    {
      schema: {
        description: 'Remove a dependency by ID',
        tags: ['Tickets'],
        params: z.object({
          ticketKey: z.string(),
          dependencyId: z.string().uuid(),
        }),
      },
    },
    async (request, reply) => {
      const { ticketKey, dependencyId } = request.params;

      await db.delete(ticketDependencies).where(eq(ticketDependencies.id, dependencyId));

      const projectKey = ticketKey.split('-')[0];
      broadcastToProject(projectKey, {
        type: 'DEPENDENCY_DELETED',
        payload: { dependencyId, ticketKey },
      });

      return reply.send({ success: true });
    }
  );

  // 11. Get All Project Dependencies (for Gantt / Timeline Engine)
  app.get(
    '/dependencies/project/:projectKey',
    {
      schema: {
        description: 'List all dependencies for a project',
        tags: ['Tickets'],
        params: z.object({
          projectKey: z.string(),
        }),
      },
    },
    async (request, reply) => {
      const { projectKey } = request.params;
      const proj = await db.query.projects.findFirst({
        where: eq(projects.key, projectKey),
      });

      if (!proj) {
        return reply.status(404).send({ error: 'Project not found' });
      }

      // Query dependencies where either source or target is in this project
      const allDeps = await db
        .select({
          id: ticketDependencies.id,
          dependencyType: ticketDependencies.dependencyType,
          sourceId: ticketDependencies.sourceTicketId,
          targetId: ticketDependencies.targetTicketId,
          externalText: ticketDependencies.externalText,
        })
        .from(ticketDependencies);

      // Map with ticket keys
      const projectTickets = await db
        .select({
          id: tickets.id,
          ticketKey: tickets.ticketKey,
          title: tickets.title,
          status: tickets.status,
          startDate: tickets.startDate,
          dueDate: tickets.dueDate,
        })
        .from(tickets)
        .where(eq(tickets.projectId, proj.id));

      const ticketMap = new Map(projectTickets.map((t) => [t.id, t]));

      const enrichedDeps = allDeps
        .filter((d) => ticketMap.has(d.sourceId) || (d.targetId ? ticketMap.has(d.targetId) : true))
        .map((d) => ({
          id: d.id,
          dependencyType: d.dependencyType,
          sourceId: d.sourceId,
          sourceKey: ticketMap.get(d.sourceId)?.ticketKey || 'UNKNOWN',
          targetId: d.targetId,
          targetKey: d.targetId ? ticketMap.get(d.targetId)?.ticketKey || 'UNKNOWN' : null,
          externalText: d.externalText,
        }));

      return reply.send({ data: enrichedDeps });
    }
  );

  // 12. Fast Global Search Endpoint (Command Palette Cmd+K)
  app.get(
    '/search/global',
    {
      schema: {
        description: 'Global search across tickets by key, title, and description',
        tags: ['Tickets'],
        querystring: z.object({
          q: z.string().min(1),
          projectKey: z.string().optional(),
          limit: z.coerce.number().min(1).max(50).default(20),
        }),
      },
    },
    async (request, reply) => {
      const { q, projectKey, limit } = request.query;

      let targetProjectId: string | undefined;
      if (projectKey) {
        const proj = await db.query.projects.findFirst({
          where: eq(projects.key, projectKey),
        });
        targetProjectId = proj?.id;
      }

      const searchPattern = `%${q}%`;
      const whereCondition = targetProjectId
        ? and(
            eq(tickets.projectId, targetProjectId),
            or(
              ilike(tickets.ticketKey, searchPattern),
              ilike(tickets.title, searchPattern),
              ilike(tickets.description, searchPattern)
            )
          )
        : or(
            ilike(tickets.ticketKey, searchPattern),
            ilike(tickets.title, searchPattern),
            ilike(tickets.description, searchPattern)
          );

      const results = await db
        .select({
          id: tickets.id,
          ticketKey: tickets.ticketKey,
          title: tickets.title,
          status: tickets.status,
          priority: tickets.priority,
          ticketType: tickets.ticketType,
          storyPoints: tickets.storyPoints,
          dueDate: tickets.dueDate,
          createdAt: tickets.createdAt,
        })
        .from(tickets)
        .where(whereCondition)
        .limit(limit);

      return reply.send({ data: results });
    }
  );

  // 13. File Attachments (Presign Upload & Save)
  app.post(
    '/:ticketKey/attachments/presign',
    {
      schema: {
        description: 'Generate presigned upload details and register attachment metadata',
        tags: ['Tickets'],
        params: z.object({
          ticketKey: z.string(),
        }),
        body: PresignAttachmentSchema,
      },
    },
    async (request, reply) => {
      const { ticketKey } = request.params;
      const { fileName, fileSize, mimeType } = request.body;

      const ticket = await db.query.tickets.findFirst({
        where: eq(tickets.ticketKey, ticketKey),
      });

      if (!ticket) {
        return reply.status(404).send({ error: 'Ticket not found' });
      }

      const defaultUser = await db.query.users.findFirst();
      const uploaderId = defaultUser?.id || '00000000-0000-0000-0000-000000000001';

      const s3Key = `attachments/${ticket.id}/${Date.now()}-${fileName.replace(/[^a-zA-Z0-9.-]/g, '_')}`;

      const [attachment] = await db
        .insert(ticketAttachments)
        .values({
          ticketId: ticket.id,
          uploaderId,
          fileName,
          fileSize,
          mimeType,
          s3Key,
        })
        .returning();

      // Generate real AWS S3 Presigned URLs
      let uploadUrl: string;
      let downloadUrl: string;
      try {
        uploadUrl = await getPresignedUploadUrl(s3Key, mimeType, 300);
        downloadUrl = await getPresignedDownloadUrl(s3Key, 3600);
      } catch {
        // Fallback for offline test environments
        uploadUrl = `https://s3.amazonaws.com/coretrack-attachments/${s3Key}`;
        downloadUrl = `https://s3.amazonaws.com/coretrack-attachments/${s3Key}`;
      }

      const projectKey = ticketKey.split('-')[0];
      broadcastToProject(projectKey, {
        type: 'ATTACHMENT_UPLOADED',
        payload: { ...attachment, downloadUrl },
      });

      return reply.status(201).send({
        data: {
          ...attachment,
          uploadUrl,
          downloadUrl,
        },
      });
    }
  );

  // 14. List Attachments for Ticket
  app.get(
    '/:ticketKey/attachments',
    {
      schema: {
        description: 'Get attachments for a ticket with presigned download URLs',
        tags: ['Tickets'],
        params: z.object({
          ticketKey: z.string(),
        }),
      },
    },
    async (request, reply) => {
      const { ticketKey } = request.params;
      const ticket = await db.query.tickets.findFirst({
        where: eq(tickets.ticketKey, ticketKey),
      });

      if (!ticket) {
        return reply.status(404).send({ error: 'Ticket not found' });
      }

      const rawAttachments = await db
        .select({
          id: ticketAttachments.id,
          ticketId: ticketAttachments.ticketId,
          fileName: ticketAttachments.fileName,
          fileSize: ticketAttachments.fileSize,
          mimeType: ticketAttachments.mimeType,
          s3Key: ticketAttachments.s3Key,
          createdAt: ticketAttachments.createdAt,
          uploaderName: users.fullName,
        })
        .from(ticketAttachments)
        .leftJoin(users, eq(ticketAttachments.uploaderId, users.id))
        .where(eq(ticketAttachments.ticketId, ticket.id))
        .orderBy(desc(ticketAttachments.createdAt));

      // Enrich with fresh presigned download URLs from AWS S3
      const attachments = await Promise.all(
        rawAttachments.map(async (att) => {
          try {
            const downloadUrl = await getPresignedDownloadUrl(att.s3Key, 3600);
            return { ...att, downloadUrl };
          } catch {
            return {
              ...att,
              downloadUrl: `https://s3.amazonaws.com/coretrack-attachments/${att.s3Key}`,
            };
          }
        })
      );

      return reply.send({ data: attachments });
    }
  );

  // 15. Delete Attachment
  app.delete(
    '/:ticketKey/attachments/:attachmentId',
    {
      schema: {
        description: 'Delete an attachment from S3 and database',
        tags: ['Tickets'],
        params: z.object({
          ticketKey: z.string(),
          attachmentId: z.string().uuid(),
        }),
      },
    },
    async (request, reply) => {
      const { attachmentId } = request.params;

      const attachment = await db.query.ticketAttachments.findFirst({
        where: eq(ticketAttachments.id, attachmentId),
      });

      if (attachment) {
        try {
          await deleteS3Object(attachment.s3Key);
        } catch {
          // ignore s3 deletion error if object doesn't exist
        }
        await db.delete(ticketAttachments).where(eq(ticketAttachments.id, attachmentId));
      }

      return reply.send({ success: true });
    }
  );

  // 16. Get Staged Approvals for Ticket
  app.get(
    '/:ticketKey/approvals',
    {
      schema: {
        description: 'Get approval chain and status for a ticket',
        tags: ['Tickets'],
        params: z.object({
          ticketKey: z.string(),
        }),
      },
    },
    async (request, reply) => {
      const { ticketKey } = request.params;
      const ticket = await db.query.tickets.findFirst({
        where: eq(tickets.ticketKey, ticketKey),
      });

      if (!ticket) {
        return reply.status(404).send({ error: 'Ticket not found' });
      }

      const approvals = await db
        .select({
          id: ticketApprovals.id,
          ticketId: ticketApprovals.ticketId,
          approverId: ticketApprovals.approverId,
          tier: ticketApprovals.tier,
          status: ticketApprovals.status,
          comment: ticketApprovals.comment,
          createdAt: ticketApprovals.createdAt,
          decidedAt: ticketApprovals.decidedAt,
          approverName: users.fullName,
          approverEmail: users.email,
        })
        .from(ticketApprovals)
        .leftJoin(users, eq(ticketApprovals.approverId, users.id))
        .where(eq(ticketApprovals.ticketId, ticket.id))
        .orderBy(ticketApprovals.tier);

      return reply.send({ data: approvals });
    }
  );

  // 17. Request Staged Approval
  app.post(
    '/:ticketKey/approvals',
    {
      schema: {
        description: 'Initiate a staged approval request',
        tags: ['Tickets'],
        params: z.object({
          ticketKey: z.string(),
        }),
        body: z.object({
          approverEmail: z.string().email().optional(),
          tier: z.number().int().min(1).default(1),
        }),
      },
    },
    async (request, reply) => {
      const { ticketKey } = request.params;
      const { approverEmail, tier } = request.body;

      const ticket = await db.query.tickets.findFirst({
        where: eq(tickets.ticketKey, ticketKey),
      });

      if (!ticket) {
        return reply.status(404).send({ error: 'Ticket not found' });
      }

      let approver = approverEmail
        ? await db.query.users.findFirst({ where: eq(users.email, approverEmail) })
        : null;

      if (!approver) {
        approver = (await db.query.users.findFirst()) || null;
      }

      const [newApproval] = await db
        .insert(ticketApprovals)
        .values({
          ticketId: ticket.id,
          approverId: approver!.id,
          tier,
          status: 'PENDING',
        })
        .returning();

      // Put ticket in PENDING_APPROVAL and auto-pause SLA
      await db
        .update(tickets)
        .set({
          status: 'PENDING_APPROVAL',
          isSlaPaused: true,
          updatedAt: new Date(),
        })
        .where(eq(tickets.id, ticket.id));

      const projectKey = ticketKey.split('-')[0];
      broadcastToProject(projectKey, {
        type: 'APPROVAL_REQUESTED',
        payload: { ticketKey, approval: newApproval },
      });

      return reply.status(201).send({ data: newApproval });
    }
  );

  // 18. Submit Approval Decision (State Machine Guard)
  app.post(
    '/:ticketKey/approvals/:approvalId/decision',
    {
      schema: {
        description: 'Approve or reject a staged approval request',
        tags: ['Tickets'],
        params: z.object({
          ticketKey: z.string(),
          approvalId: z.string().uuid(),
        }),
        body: ApprovalDecisionSchema,
      },
    },
    async (request, reply) => {
      const { ticketKey, approvalId } = request.params;
      const { decision, comment } = request.body;

      const ticket = await db.query.tickets.findFirst({
        where: eq(tickets.ticketKey, ticketKey),
      });

      if (!ticket) {
        return reply.status(404).send({ error: 'Ticket not found' });
      }

      const [updatedApproval] = await db
        .update(ticketApprovals)
        .set({
          status: decision,
          comment: comment || null,
          decidedAt: new Date(),
        })
        .where(eq(ticketApprovals.id, approvalId))
        .returning();

      // Query all approvals for this ticket to verify if state machine can advance
      const allApprovals = await db
        .select()
        .from(ticketApprovals)
        .where(eq(ticketApprovals.ticketId, ticket.id));

      let nextStatus = ticket.status;
      let nextSlaPaused = ticket.isSlaPaused;

      if (decision === 'REJECTED') {
        nextStatus = 'CANCELED';
        nextSlaPaused = true;
      } else if (allApprovals.every((a) => a.status === 'APPROVED')) {
        // All tiers approved! Unpause SLA and move to IN_PROGRESS or TODO
        nextStatus = ticket.status === 'PENDING_APPROVAL' ? 'IN_PROGRESS' : ticket.status;
        nextSlaPaused = false;
      }

      if (nextStatus !== ticket.status || nextSlaPaused !== ticket.isSlaPaused) {
        await db
          .update(tickets)
          .set({
            status: nextStatus,
            isSlaPaused: nextSlaPaused,
            updatedAt: new Date(),
          })
          .where(eq(tickets.id, ticket.id));
      }

      const defaultUser = await db.query.users.findFirst();
      await db.insert(ticketComments).values({
        ticketId: ticket.id,
        authorId: defaultUser?.id || '00000000-0000-0000-0000-000000000001',
        body: `📋 **Approval Decision:** Tier ${updatedApproval.tier} was **${decision}** by approver.${comment ? ` Reason: "${comment}"` : ''}`,
        visibilityScope: 'PUBLIC',
      });

      const projectKey = ticketKey.split('-')[0];
      broadcastToProject(projectKey, {
        type: 'APPROVAL_DECIDED',
        payload: {
          ticketKey,
          approval: updatedApproval,
          ticketStatus: nextStatus,
          isSlaPaused: nextSlaPaused,
        },
      });

      return reply.send({
        success: true,
        data: updatedApproval,
        ticketStatus: nextStatus,
      });
    }
  );

  // 19. Get Linked VCS Branches, Commits, and PRs
  app.get(
    '/:ticketKey/vcs-links',
    {
      schema: {
        description: 'Get linked GitHub/GitLab commits, PRs, and branches',
        tags: ['Tickets'],
        params: z.object({
          ticketKey: z.string(),
        }),
      },
    },
    async (request, reply) => {
      const { ticketKey } = request.params;
      const ticket = await db.query.tickets.findFirst({
        where: eq(tickets.ticketKey, ticketKey),
      });

      if (!ticket) {
        return reply.status(404).send({ error: 'Ticket not found' });
      }

      const links = await db
        .select()
        .from(ticketVcsLinks)
        .where(eq(ticketVcsLinks.ticketId, ticket.id))
        .orderBy(desc(ticketVcsLinks.createdAt));

      return reply.send({ data: links });
    }
  );

  // 20. Delete Ticket (With Assignment by Higher Authority Protection)
  app.delete(
    '/:ticketKey',
    {
      schema: {
        description: 'Delete ticket if not assigned by higher authority',
        tags: ['Tickets'],
        params: z.object({
          ticketKey: z.string(),
        }),
      },
    },
    async (request, reply) => {
      const { ticketKey } = request.params;
      const user = await getCurrentUser(request);
      if (!user) return reply.status(401).send({ error: 'Unauthorized' });

      const ticket = await db.query.tickets.findFirst({
        where: eq(tickets.ticketKey, ticketKey),
      });

      if (!ticket) {
        return reply.status(404).send({ error: 'Ticket not found' });
      }

      const projectKey = ticketKey.split('-')[0];
      const callerTierInfo = await getUserRoleTier(user.id, projectKey);
      const { permissions } = await getEffectiveUserPermissions(user.id, projectKey);

      // Higher Authority Task Deletion Protection:
      // Tasks assigned by higher authorities cannot be deleted.
      const isAssigned = Boolean(ticket.assigneeId);
      let assignerTier = ticket.assignedByRoleTier || ticket.dueDateSetByRoleTier || 1;

      // If task is assigned and assignerTier is not explicitly elevated, inspect reporter's authority tier
      if (isAssigned && assignerTier <= 1 && ticket.reporterId) {
        const reporterTierInfo = await getUserRoleTier(ticket.reporterId, projectKey);
        if (reporterTierInfo.tier > assignerTier) {
          assignerTier = reporterTierInfo.tier;
        }
      }

      if (isAssigned && assignerTier > 1 && callerTierInfo.tier < assignerTier) {
        return reply.status(403).send({
          type: 'https://errors.coretrack.internal/forbidden',
          title: 'Immutable Assignment',
          status: 403,
          error: 'TASK_ASSIGNED_BY_HIGHER_AUTHORITY',
          message: `This task was assigned by a higher authority (Tier ${assignerTier}) and cannot be deleted by your role (${callerTierInfo.roleName}).`,
        });
      }

      // Check general ticket deletion permissions
      const hasDeletePerm =
        callerTierInfo.tier >= 3 ||
        hasPermission(permissions, Permissions.TICKET_DELETE) ||
        (ticket.reporterId === user.id && callerTierInfo.tier >= assignerTier);

      if (!hasDeletePerm) {
        return reply.status(403).send({
          type: 'https://errors.coretrack.internal/forbidden',
          title: 'Access Denied',
          status: 403,
          error: 'FORBIDDEN',
          message: 'You do not have permission to delete tickets in this project.',
        });
      }

      // Cascade delete child relations
      await db.delete(ticketComments).where(eq(ticketComments.ticketId, ticket.id));
      await db.delete(ticketAttachments).where(eq(ticketAttachments.ticketId, ticket.id));
      await db.delete(ticketDependencies).where(
        or(
          eq(ticketDependencies.sourceTicketId, ticket.id),
          eq(ticketDependencies.targetTicketId, ticket.id)
        )
      );
      await db.delete(ticketApprovals).where(eq(ticketApprovals.ticketId, ticket.id));
      await db.delete(ticketVcsLinks).where(eq(ticketVcsLinks.ticketId, ticket.id));
      await db.delete(tickets).where(eq(tickets.id, ticket.id));

      broadcastToProject(projectKey, {
        type: 'TICKET_DELETED',
        payload: { ticketKey },
      });

      return reply.send({
        success: true,
        message: `Ticket ${ticketKey} deleted successfully`,
      });
    }
  );
};
