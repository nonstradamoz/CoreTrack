import { FastifyPluginAsync } from 'fastify';
import { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import {
  db,
  users,
  teams,
  teamMembers,
  projects,
  projectTeams,
  projectMembers,
  tickets,
  ticketComments,
  ticketAttachments,
  ticketApprovals,
  roles,
  eq,
  and,
  or,
  isNull,
  inArray,
  desc,
} from '@coretrack/db';
import { Permissions, StandardRoleBitmasks } from '@coretrack/shared';
import {
  getCurrentUser,
  setMockUserEmail,
  clearMockUserSession,
  getEffectiveUserPermissions,
  getUserRoleTier,
} from '../auth/auth.js';
import { hashPassword, verifyPassword, validatePasswordPolicy } from '../auth/password.js';
import { signAuthToken } from '../auth/jwt.js';
import { sendDirectOrBroadcastEmail, getAppUrl } from '../services/email.js';

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function getRoleFromPermissions(perms: bigint): { roleName: string; roleTier: number } {
  if ((perms & Permissions.ORG_ADMIN) === Permissions.ORG_ADMIN) {
    return { roleName: 'Super Admin', roleTier: 5 };
  }
  if ((perms & Permissions.PROJECT_DELETE) === Permissions.PROJECT_DELETE) {
    return { roleName: 'Admin', roleTier: 4 };
  }
  if ((perms & Permissions.AUTOMATION_MANAGE) === Permissions.AUTOMATION_MANAGE || (perms & Permissions.PROJECT_ADMIN) === Permissions.PROJECT_ADMIN) {
    return { roleName: 'Manager', roleTier: 3 };
  }
  if ((perms & Permissions.SPRINT_MANAGE) === Permissions.SPRINT_MANAGE) {
    return { roleName: 'Team Lead', roleTier: 2 };
  }
  return { roleName: 'Employee', roleTier: 1 };
}

function getPermissionsFromRole(role: string): bigint {
  switch (role) {
    case 'SUPER_ADMIN':
      return StandardRoleBitmasks.SUPER_ADMIN;
    case 'ADMIN':
      return StandardRoleBitmasks.ADMIN;
    case 'MANAGER':
      return StandardRoleBitmasks.MANAGER;
    case 'TEAM_LEAD':
      return StandardRoleBitmasks.TEAM_LEAD;
    case 'EMPLOYEE':
    default:
      return StandardRoleBitmasks.EMPLOYEE;
  }
}

export const authRoutes: FastifyPluginAsync = async (fastify) => {
  const app = fastify.withTypeProvider<ZodTypeProvider>();

  // 1. Get Current Authenticated User Context & Permissions
  app.get(
    '/me',
    {
      schema: {
        description: 'Get active authenticated user profile and capability bitmask',
        tags: ['Authentication & IAM'],
        querystring: z.object({
          projectKey: z.string().optional(),
        }),
      },
    },
    async (request, reply) => {
      const user = await getCurrentUser(request);

      if (!user) {
        return reply.status(401).send({ error: 'Not authenticated' });
      }

      const projectKey = request.query.projectKey;
      const [{ permissions, roleName }, tierInfo, dbUserFlags] = await Promise.all([
        getEffectiveUserPermissions(user.id, projectKey),
        getUserRoleTier(user.id, projectKey),
        db.query.users.findFirst({
          where: eq(users.id, user.id),
          columns: { mustChangePassword: true, passwordHash: true },
        }),
      ]);

      return reply.send({
        data: {
          id: user.id,
          email: user.email,
          fullName: user.fullName,
          userType: user.userType,
          globalPermissions: user.globalPermissions.toString(),
          effectivePermissions: permissions.toString(),
          roleName: roleName || tierInfo.roleName || 'Member',
          roleTier: tierInfo.tier,
          mustChangePassword: Boolean(
            dbUserFlags?.mustChangePassword || !dbUserFlags?.passwordHash
          ),
        },
      });
    }
  );

  // 1b. Get Detailed Profile & Live Statuses for Current User
  app.get(
    '/me/profile',
    {
      schema: {
        description: 'Get full profile, teams, projects, and live task/SLA statuses for the current user',
        tags: ['Authentication & IAM'],
      },
    },
    async (request, reply) => {
      const caller = await getCurrentUser(request);
      if (!caller) {
        return reply.status(401).send({ error: 'Not authenticated' });
      }

      const [dbUser, tierInfo, myTeamRows, myProjMemberRows, myTickets] = await Promise.all([
        db.query.users.findFirst({
          where: eq(users.id, caller.id),
        }),
        getUserRoleTier(caller.id),
        db.query.teamMembers.findMany({
          where: eq(teamMembers.userId, caller.id),
          with: {
            team: {
              columns: { id: true, name: true, keyPrefix: true },
            },
          },
        }),
        db.query.projectMembers.findMany({
          where: eq(projectMembers.userId, caller.id),
          with: {
            project: {
              columns: { id: true, key: true, name: true, status: true },
            },
            role: {
              columns: { name: true },
            },
          },
        }),
        db.query.tickets.findMany({
          where: and(
            isNull(tickets.deletedAt),
            or(
              eq(tickets.assigneeId, caller.id),
              and(isNull(tickets.assigneeId), eq(tickets.reporterId, caller.id))
            )
          ),
          with: {
            project: {
              columns: { id: true, key: true, name: true },
            },
          },
          orderBy: desc(tickets.updatedAt),
        }),
      ]);

      if (!dbUser) {
        return reply.status(404).send({ error: 'User not found' });
      }

      const myTeamIds = myTeamRows.map((tm) => tm.teamId);
      const allProjects = await db.query.projects.findMany({
        with: {
          assignedTeams: true,
        },
      });

      const projectMap = new Map<
        string,
        { id: string; key: string; name: string; status: string; relation: string }
      >();

      for (const pm of myProjMemberRows) {
        if (pm.project) {
          projectMap.set(pm.project.id, {
            id: pm.project.id,
            key: pm.project.key,
            name: pm.project.name,
            status: pm.project.status,
            relation: pm.role?.name || 'Member',
          });
        }
      }

      for (const p of allProjects) {
        const isPm = p.projectManagerId === caller.id;
        const isReviewer = p.reviewerId === caller.id;
        const viaTeam =
          (p.primaryTeamId && myTeamIds.includes(p.primaryTeamId)) ||
          p.assignedTeams.some((at) => myTeamIds.includes(at.teamId));
        if ((isPm || isReviewer || viaTeam) && !projectMap.has(p.id)) {
          projectMap.set(p.id, {
            id: p.id,
            key: p.key,
            name: p.name,
            status: p.status,
            relation: isPm ? 'Project Manager' : isReviewer ? 'Reviewer' : 'Team Allocation',
          });
        }
      }

      const now = Date.now();
      const doneSet = new Set(['DONE', 'RESOLVED', 'CLOSED']);
      let completed = 0;
      let inProgress = 0;
      let inReview = 0;
      let pendingApproval = 0;
      let blocked = 0;
      let overdue = 0;
      let storyPointsTotal = 0;
      let slaTracked = 0;
      let slaBreached = 0;

      const taskItems = myTickets.map((t) => {
        const st = t.status.toUpperCase();
        const isDone = doneSet.has(st);
        const isOverdue = !isDone && st !== 'CANCELED' && t.dueDate ? new Date(t.dueDate).getTime() < now : false;

        if (isDone) completed++;
        if (st === 'IN_PROGRESS') inProgress++;
        if (st === 'IN_REVIEW') inReview++;
        if (st === 'PENDING_APPROVAL') pendingApproval++;
        if (st === 'BLOCKED') blocked++;
        if (isOverdue) overdue++;
        storyPointsTotal += t.storyPoints || 0;

        if (t.slaResolutionDueAt) {
          slaTracked++;
          const dueMs = new Date(t.slaResolutionDueAt).getTime();
          const checkMs = isDone ? new Date(t.updatedAt).getTime() : now;
          if (checkMs > dueMs) slaBreached++;
        }

        return {
          id: t.id,
          ticketKey: t.ticketKey,
          title: t.title,
          status: t.status,
          priority: t.priority,
          storyPoints: t.storyPoints ?? null,
          dueDate: t.dueDate ? t.dueDate.toISOString() : null,
          isOverdue,
          projectKey: t.project?.key || '',
          projectName: t.project?.name || '',
          updatedAt: t.updatedAt.toISOString(),
        };
      });

      const slaComplianceRate =
        slaTracked > 0 ? Math.round(((slaTracked - slaBreached) / slaTracked) * 100) : 100;

      return reply.send({
        data: {
          user: {
            id: dbUser.id,
            email: dbUser.email,
            fullName: dbUser.fullName,
            designation: dbUser.designation || null,
            userType: dbUser.userType,
            status: dbUser.status,
            roleName: tierInfo.roleName || 'Member',
            roleTier: tierInfo.tier,
            createdAt: dbUser.createdAt.toISOString(),
          },
          teams: myTeamRows.map((tm) => ({
            id: tm.team.id,
            name: tm.team.name,
            keyPrefix: tm.team.keyPrefix,
            role: tm.role,
          })),
          projects: Array.from(projectMap.values()),
          stats: {
            totalAssigned: taskItems.length,
            completed,
            inProgress,
            inReview,
            pendingApproval,
            blocked,
            overdue,
            storyPointsTotal,
            slaComplianceRate,
          },
          tasks: taskItems,
        },
      });
    }
  );

  // 2. List Available Users and Roles Directory
  app.get(
    '/users',
    {
      schema: {
        description: 'List available enterprise personas for testing and administration',
        tags: ['Authentication & IAM'],
      },
    },
    async (_request, reply) => {
      const allUsers = await db.select().from(users).orderBy(desc(users.createdAt));
      return reply.send({
        data: allUsers.map((u) => {
          const roleInfo = getRoleFromPermissions(u.globalPermissions);
          return {
            id: u.id,
            email: u.email,
            fullName: u.fullName,
            designation: u.designation || null,
            userType: u.userType,
            status: u.status,
            globalPermissions: u.globalPermissions.toString(),
            roleName: roleInfo.roleName,
            roleTier: roleInfo.roleTier,
            createdAt: u.createdAt.toISOString(),
          };
        }),
      });
    }
  );

  // 2b. Add / Create New User (Super Admin, Admin, or Project Manager with USER_INVITE)
  app.post(
    '/users',
    {
      schema: {
        description: 'Provision a new user account with role, department/team allocation, and optional invite email',
        tags: ['Authentication & IAM'],
        body: z.object({
          fullName: z.string().min(2).max(150),
          email: z.string().email(),
          password: z.string().min(8),
          designation: z.string().max(120).optional().nullable(),
          role: z.enum(['SUPER_ADMIN', 'ADMIN', 'MANAGER', 'TEAM_LEAD', 'EMPLOYEE']).default('EMPLOYEE'),
          userType: z.enum(['INTERNAL_EMPLOYEE', 'EXTERNAL_GUEST']).default('INTERNAL_EMPLOYEE'),
          status: z.enum(['ACTIVE', 'INACTIVE']).default('ACTIVE'),
          teamId: z.string().uuid().optional(),
          projectId: z.string().uuid().optional(),
          projectRoleId: z.string().uuid().optional(),
          sendInviteEmail: z.boolean().default(false),
        }),
      },
    },
    async (request, reply) => {
      const caller = await getCurrentUser(request);
      if (!caller) {
        return reply.status(401).send({ error: 'Authentication required' });
      }

      const isOrgAdmin = (caller.globalPermissions & Permissions.ORG_ADMIN) === Permissions.ORG_ADMIN;
      const callerTierInfo = await getUserRoleTier(caller.id);

      // Super Admin (5), Admin (4), Project Manager (3)
      if (!isOrgAdmin && callerTierInfo.tier < 3 && !((caller.globalPermissions & Permissions.USER_INVITE) === Permissions.USER_INVITE)) {
        return reply.status(403).send({ error: 'Access denied: User provisioning requires Executive or Manager permissions.' });
      }

      const {
        fullName,
        email,
        password,
        designation,
        role,
        userType,
        status,
        teamId,
        projectId,
        projectRoleId,
        sendInviteEmail,
      } = request.body;

      const policyError = validatePasswordPolicy(password);
      if (policyError) {
        return reply.status(400).send({ error: policyError });
      }

      const normalizedEmail = email.toLowerCase().trim();

      // Check for duplicate email
      const existingUser = await db.query.users.findFirst({
        where: eq(users.email, normalizedEmail),
      });

      if (existingUser) {
        return reply.status(409).send({
          error: `A user account with email "${normalizedEmail}" already exists.`,
        });
      }

      // Compute global permissions from selected role & hash password
      const globalPermissions = getPermissionsFromRole(role);
      const passwordHash = await hashPassword(password);

      const [newUser] = await db
        .insert(users)
        .values({
          fullName: fullName.trim(),
          email: normalizedEmail,
          designation: designation?.trim() || null,
          userType,
          status,
          passwordHash,
          mustChangePassword: true,
          globalPermissions,
        })
        .returning();

      // Optional team assignment
      if (teamId) {
        try {
          await db.insert(teamMembers).values({
            teamId,
            userId: newUser.id,
            role: role === 'TEAM_LEAD' ? 'LEAD' : 'MEMBER',
          });
        } catch (teamErr) {
          console.warn('Could not auto-assign team:', teamErr);
        }
      }

      // Optional project assignment
      if (projectId && projectRoleId) {
        try {
          await db.insert(projectMembers).values({
            projectId,
            userId: newUser.id,
            roleId: projectRoleId,
          });
        } catch (projErr) {
          console.warn('Could not auto-assign project:', projErr);
        }
      }

      // Optional welcome invitation email (non-blocking so user creation returns immediately)
      if (sendInviteEmail) {
        const roleDisplay = getRoleFromPermissions(globalPermissions).roleName;
        const loginUrl = `${getAppUrl()}/login`;
        void sendDirectOrBroadcastEmail({
          recipient: { email: newUser.email, fullName: newUser.fullName },
          subject: 'Welcome to CoreTrack Enterprise Workspace',
          category: 'Welcome Onboarding',
          categoryColor: '#2563eb',
          headline: `Welcome to CoreTrack, ${newUser.fullName}!`,
          greeting: `Hello ${newUser.fullName},`,
          content: `Your new CoreTrack account has been successfully provisioned with the <strong>${roleDisplay}</strong> role.<br/><br/><strong>Login Credentials:</strong><br/>Email: <code>${escapeHtml(newUser.email)}</code><br/>Temporary Password: <code>${escapeHtml(password)}</code><br/><br/>You will be prompted to set a new personal password after your first sign-in.`,
          sender: {
            fullName: caller.fullName,
            email: caller.email,
            roleName: callerTierInfo.roleName,
          },
          ctaText: 'Sign In to Workspace',
          ctaUrl: loginUrl,
          notificationType: 'DIRECT_MAIL',
        }).catch((mailErr) => {
          console.warn('Failed to send invitation email:', mailErr);
        });
      }

      const roleInfo = getRoleFromPermissions(newUser.globalPermissions);

      return reply.status(201).send({
        data: {
          id: newUser.id,
          email: newUser.email,
          fullName: newUser.fullName,
          userType: newUser.userType,
          status: newUser.status,
          globalPermissions: newUser.globalPermissions.toString(),
          roleName: roleInfo.roleName,
          roleTier: roleInfo.roleTier,
          createdAt: newUser.createdAt.toISOString(),
        },
      });
    }
  );

  // 2c. Update User Account
  app.patch(
    '/users/:id',
    {
      schema: {
        description: 'Update user account properties and role permissions',
        tags: ['Authentication & IAM'],
        params: z.object({
          id: z.string().uuid(),
        }),
        body: z.object({
          fullName: z.string().min(2).max(150).optional(),
          designation: z.string().max(120).optional().nullable(),
          role: z.enum(['SUPER_ADMIN', 'ADMIN', 'MANAGER', 'TEAM_LEAD', 'EMPLOYEE']).optional(),
          userType: z.enum(['INTERNAL_EMPLOYEE', 'EXTERNAL_GUEST']).optional(),
          status: z.enum(['ACTIVE', 'INACTIVE']).optional(),
          password: z.string().min(8).optional(),
        }),
      },
    },
    async (request, reply) => {
      const caller = await getCurrentUser(request);
      if (!caller) {
        return reply.status(401).send({ error: 'Authentication required' });
      }

      const isOrgAdmin = (caller.globalPermissions & Permissions.ORG_ADMIN) === Permissions.ORG_ADMIN;
      const callerTierInfo = await getUserRoleTier(caller.id);

      if (!isOrgAdmin && callerTierInfo.tier < 3 && !((caller.globalPermissions & Permissions.USER_INVITE) === Permissions.USER_INVITE)) {
        return reply.status(403).send({ error: 'Access denied: Modifying user accounts requires Executive permissions.' });
      }

      const targetUser = await db.query.users.findFirst({
        where: eq(users.id, request.params.id),
      });

      if (!targetUser) {
        return reply.status(404).send({ error: 'User not found' });
      }

      const { fullName, designation, role, userType, status, password } = request.body;
      const updates: Record<string, any> = {};

      if (fullName) updates.fullName = fullName.trim();
      if (designation !== undefined) updates.designation = designation?.trim() || null;
      if (userType) updates.userType = userType;
      if (status) updates.status = status;
      if (role) updates.globalPermissions = getPermissionsFromRole(role);
      if (password) {
        const policyError = validatePasswordPolicy(password);
        if (policyError) {
          return reply.status(400).send({ error: policyError });
        }
        updates.passwordHash = await hashPassword(password);
        updates.mustChangePassword = true;
      }

      const [updated] = await db
        .update(users)
        .set({
          ...updates,
          updatedAt: new Date(),
        })
        .where(eq(users.id, targetUser.id))
        .returning();

      const roleInfo = getRoleFromPermissions(updated.globalPermissions);

      return reply.send({
        data: {
          id: updated.id,
          email: updated.email,
          fullName: updated.fullName,
          designation: updated.designation || null,
          userType: updated.userType,
          status: updated.status,
          globalPermissions: updated.globalPermissions.toString(),
          roleName: roleInfo.roleName,
          roleTier: roleInfo.roleTier,
          updatedAt: updated.updatedAt.toISOString(),
        },
      });
    }
  );

  // 2d. Permanently Delete User Account
  app.delete(
    '/users/:id',
    {
      schema: {
        description: 'Permanently delete a user account',
        tags: ['Authentication & IAM'],
        params: z.object({
          id: z.string().uuid(),
        }),
      },
    },
    async (request, reply) => {
      const caller = await getCurrentUser(request);
      if (!caller) {
        return reply.status(401).send({ error: 'Authentication required' });
      }

      const isOrgAdmin = (caller.globalPermissions & Permissions.ORG_ADMIN) === Permissions.ORG_ADMIN;
      const callerTierInfo = await getUserRoleTier(caller.id);

      if (!isOrgAdmin && callerTierInfo.tier < 4) {
        return reply.status(403).send({ error: 'Access denied: Deleting users requires Administrator or Super Admin privileges.' });
      }

      const targetId = request.params.id;
      if (targetId === caller.id) {
        return reply.status(400).send({ error: 'You cannot delete your own active account.' });
      }

      const existing = await db.query.users.findFirst({ where: eq(users.id, targetId) });
      if (!existing) {
        return reply.status(404).send({ error: 'User not found' });
      }

      // Reassign restrict-constrained foreign keys to the admin performing the deletion
      await Promise.all([
        db.update(tickets).set({ reporterId: caller.id }).where(eq(tickets.reporterId, targetId)),
        db.update(ticketComments).set({ authorId: caller.id }).where(eq(ticketComments.authorId, targetId)),
        db.update(ticketAttachments).set({ uploaderId: caller.id }).where(eq(ticketAttachments.uploaderId, targetId)),
        db.update(ticketApprovals).set({ approverId: caller.id }).where(eq(ticketApprovals.approverId, targetId)),
      ]);

      await db.delete(users).where(eq(users.id, targetId));

      return reply.send({
        data: {
          message: `User ${existing.email} has been permanently deleted.`,
        },
      });
    }
  );

  // 3. Switch Mock User Persona
  app.post(
    '/switch-user',
    {
      schema: {
        description: 'Switch active user persona for local SSO testing',
        tags: ['Authentication & IAM'],
        body: z.object({
          email: z.string().email(),
        }),
      },
    },
    async (request, reply) => {
      const normalizedEmail = request.body.email.trim().toLowerCase();
      const targetUser = await db.query.users.findFirst({
        where: eq(users.email, normalizedEmail),
      });

      if (!targetUser) {
        return reply.status(404).send({ error: 'User not found' });
      }

      const token = signAuthToken({ sub: targetUser.id, email: targetUser.email });
      return reply.send({
        data: {
          message: `Switched active session to ${targetUser.email}`,
          token,
          user: {
            id: targetUser.id,
            email: targetUser.email,
            fullName: targetUser.fullName,
            userType: targetUser.userType,
            globalPermissions: targetUser.globalPermissions.toString(),
          },
        },
      });
    }
  );

  // 4. Authenticate / Login User (Email + Password)
  app.post(
    '/login',
    {
      schema: {
        description: 'Login with email and password for any active user account',
        tags: ['Authentication & IAM'],
        body: z.object({
          email: z.string().email(),
          password: z.string().optional(),
        }),
      },
    },
    async (request, reply) => {
      const normalizedEmail = request.body.email.trim().toLowerCase();
      const { password } = request.body;

      const user = await db.query.users.findFirst({
        where: eq(users.email, normalizedEmail),
      });

      if (!user) {
        return reply.status(401).send({
          error: 'Invalid email or password.',
        });
      }

      if (user.status && user.status !== 'ACTIVE') {
        return reply.status(403).send({
          error: 'This user account is inactive. Please contact an administrator.',
        });
      }

      if (!user.passwordHash) {
        return reply.status(403).send({
          error: 'Please set a password for your account before signing in.',
          code: 'PASSWORD_SETUP_REQUIRED',
        });
      }

      if (!password || !(await verifyPassword(password, user.passwordHash))) {
        return reply.status(401).send({
          error: 'Invalid email or password.',
        });
      }

      const token = signAuthToken({ sub: user.id, email: user.email });
      const roleInfo = getRoleFromPermissions(user.globalPermissions);

      return reply.send({
        data: {
          message: 'Login successful',
          token,
          user: {
            id: user.id,
            email: user.email,
            fullName: user.fullName,
            userType: user.userType,
            globalPermissions: user.globalPermissions.toString(),
            roleName: roleInfo.roleName,
            roleTier: roleInfo.roleTier,
            mustChangePassword: Boolean(user.mustChangePassword),
          },
        },
      });
    }
  );

  // 4b. First-Login Password Setup (for existing users with no passwordHash yet)
  app.post(
    '/setup-password',
    {
      schema: {
        description: 'Set initial password on first login for an existing user without a password',
        tags: ['Authentication & IAM'],
        body: z.object({
          email: z.string().email(),
          password: z.string().min(8),
        }),
      },
    },
    async (request, reply) => {
      const normalizedEmail = request.body.email.trim().toLowerCase();
      const { password } = request.body;

      const user = await db.query.users.findFirst({
        where: eq(users.email, normalizedEmail),
      });

      if (!user) {
        return reply.status(404).send({ error: 'User account not found.' });
      }

      if (user.status && user.status !== 'ACTIVE') {
        return reply.status(403).send({ error: 'This user account is inactive.' });
      }

      if (user.passwordHash) {
        return reply.status(400).send({ error: 'Password is already configured for this account.' });
      }

      const policyError = validatePasswordPolicy(password);
      if (policyError) {
        return reply.status(400).send({ error: policyError });
      }

      const passwordHash = await hashPassword(password);
      await db
        .update(users)
        .set({ passwordHash, mustChangePassword: false, updatedAt: new Date() })
        .where(eq(users.id, user.id));

      const token = signAuthToken({ sub: user.id, email: user.email });
      const roleInfo = getRoleFromPermissions(user.globalPermissions);

      return reply.send({
        data: {
          message: 'Password set and signed in successfully',
          token,
          user: {
            id: user.id,
            email: user.email,
            fullName: user.fullName,
            userType: user.userType,
            globalPermissions: user.globalPermissions.toString(),
            roleName: roleInfo.roleName,
            roleTier: roleInfo.roleTier,
            mustChangePassword: Boolean(user.mustChangePassword),
          },
        },
      });
    }
  );

  // 4c. Change Own Password (Authenticated User)
  app.post(
    '/change-password',
    {
      schema: {
        description: 'Change password for the currently signed-in user',
        tags: ['Authentication & IAM'],
        body: z.object({
          currentPassword: z.string().optional(),
          newPassword: z.string().min(8),
        }),
      },
    },
    async (request, reply) => {
      const caller = await getCurrentUser(request);
      if (!caller) {
        return reply.status(401).send({ error: 'Authentication required' });
      }

      const { currentPassword, newPassword } = request.body;
      const dbUser = await db.query.users.findFirst({
        where: eq(users.id, caller.id),
      });
      if (!dbUser) {
        return reply.status(404).send({ error: 'User not found' });
      }

      if (dbUser.passwordHash) {
        if (!currentPassword || !(await verifyPassword(currentPassword, dbUser.passwordHash))) {
          return reply.status(401).send({ error: 'Current password is incorrect.' });
        }
      }

      const policyError = validatePasswordPolicy(newPassword);
      if (policyError) {
        return reply.status(400).send({ error: policyError });
      }

      const passwordHash = await hashPassword(newPassword);
      await db
        .update(users)
        .set({ passwordHash, mustChangePassword: false, updatedAt: new Date() })
        .where(eq(users.id, caller.id));

      return reply.send({
        data: {
          message: 'Password updated successfully.',
        },
      });
    }
  );

  // 5. Logout
  app.post(
    '/logout',
    {
      schema: {
        description: 'Logout active user session',
        tags: ['Authentication & IAM'],
      },
    },
    async (_request, reply) => {
      clearMockUserSession();
      return reply.send({
        data: {
          message: 'Logged out successfully',
          loggedOut: true,
        },
      });
    }
  );
};
