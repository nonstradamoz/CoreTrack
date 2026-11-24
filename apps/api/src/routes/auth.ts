import { FastifyPluginAsync } from 'fastify';
import { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import {
  db,
  users,
  teams,
  teamMembers,
  projects,
  projectMembers,
  roles,
  eq,
  desc,
} from '@coretrack/db';
import { Permissions, StandardRoleBitmasks } from '@coretrack/shared';
import {
  getCurrentUser,
  setMockUserEmail,
  getEffectiveUserPermissions,
  getUserRoleTier,
} from '../auth/auth.js';
import { sendDirectOrBroadcastEmail } from '../services/email.js';

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
      const { permissions, roleName } = await getEffectiveUserPermissions(user.id, projectKey);
      const tierInfo = await getUserRoleTier(user.id, projectKey);

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
        role,
        userType,
        status,
        teamId,
        projectId,
        projectRoleId,
        sendInviteEmail,
      } = request.body;

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

      // Compute global permissions from selected role
      const globalPermissions = getPermissionsFromRole(role);

      const [newUser] = await db
        .insert(users)
        .values({
          fullName: fullName.trim(),
          email: normalizedEmail,
          userType,
          status,
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

      // Optional welcome invitation email
      if (sendInviteEmail) {
        try {
          const roleDisplay = getRoleFromPermissions(globalPermissions).roleName;
          await sendDirectOrBroadcastEmail({
            recipient: { email: newUser.email, fullName: newUser.fullName },
            subject: 'Welcome to CoreTrack Enterprise Workspace',
            category: 'Welcome Onboarding',
            categoryColor: '#2563eb',
            headline: `Welcome to CoreTrack, ${newUser.fullName}!`,
            greeting: `Hello ${newUser.fullName},`,
            content: `Your new CoreTrack account has been successfully provisioned with the <strong>${roleDisplay}</strong> role.<br/><br/>You now have access to collaborative project boards, sprint management, and enterprise workflows.`,
            sender: {
              fullName: caller.fullName,
              email: caller.email,
              roleName: callerTierInfo.roleName,
            },
            ctaText: 'Access Workspace',
            ctaUrl: process.env.APP_URL || 'http://localhost:3000',
            notificationType: 'DIRECT_MAIL',
          });
        } catch (mailErr) {
          console.warn('Failed to send invitation email:', mailErr);
        }
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
          role: z.enum(['SUPER_ADMIN', 'ADMIN', 'MANAGER', 'TEAM_LEAD', 'EMPLOYEE']).optional(),
          userType: z.enum(['INTERNAL_EMPLOYEE', 'EXTERNAL_GUEST']).optional(),
          status: z.enum(['ACTIVE', 'INACTIVE']).optional(),
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

      const { fullName, role, userType, status } = request.body;
      const updates: Record<string, any> = {};

      if (fullName) updates.fullName = fullName.trim();
      if (userType) updates.userType = userType;
      if (status) updates.status = status;
      if (role) updates.globalPermissions = getPermissionsFromRole(role);

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

  // 2d. Deactivate User Account
  app.delete(
    '/users/:id',
    {
      schema: {
        description: 'Soft-deactivate a user account',
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
        return reply.status(403).send({ error: 'Access denied: Deactivating users requires Administrator or Super Admin privileges.' });
      }

      const [updated] = await db
        .update(users)
        .set({
          status: 'INACTIVE',
          updatedAt: new Date(),
        })
        .where(eq(users.id, request.params.id))
        .returning();

      if (!updated) {
        return reply.status(404).send({ error: 'User not found' });
      }

      return reply.send({
        data: {
          message: `User ${updated.email} has been deactivated.`,
          user: updated,
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
      const { email } = request.body;
      setMockUserEmail(email);

      const user = await getCurrentUser(request);
      return reply.send({
        data: {
          message: `Switched active session to ${email}`,
          user: user
            ? {
                ...user,
                globalPermissions: user.globalPermissions.toString(),
              }
            : null,
        },
      });
    }
  );

  // 4. Authenticate / Login User (Credentials or Test Persona)
  app.post(
    '/login',
    {
      schema: {
        description: 'Login with email and optional test password',
        tags: ['Authentication & IAM'],
        body: z.object({
          email: z.string().email(),
          password: z.string().optional(),
        }),
      },
    },
    async (request, reply) => {
      const { email } = request.body;
      const user = await db.query.users.findFirst({
        where: eq(users.email, email),
      });

      if (!user) {
        return reply.status(401).send({
          error: 'Invalid test account email. Please select or enter a valid test user.',
        });
      }

      setMockUserEmail(email);

      return reply.send({
        data: {
          message: 'Login successful',
          user: {
            id: user.id,
            email: user.email,
            fullName: user.fullName,
            userType: user.userType,
            globalPermissions: user.globalPermissions.toString(),
          },
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
      return reply.send({
        data: {
          message: 'Logged out successfully',
        },
      });
    }
  );
};
