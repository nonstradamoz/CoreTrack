import { FastifyPluginAsync } from 'fastify';
import { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { db, roles, projectMembers, projects, users, eq, and, sql } from '@coretrack/db';
import { Permissions, PERMISSION_DEFINITIONS, hasPermission } from '@coretrack/shared';
import { getCurrentUser, getEffectiveUserPermissions, getUserRoleTier } from '../auth/auth.js';
import { sendProjectAssignedNotification } from '../services/email.js';

export const roleRoutes: FastifyPluginAsync = async (fastify) => {
  const app = fastify.withTypeProvider<ZodTypeProvider>();

  // 1. List Permission Definitions (Metadata)
  app.get(
    '/permissions/definitions',
    {
      schema: {
        description: 'Get all granular permission definitions grouped by category',
        tags: ['Role-Based Access Control'],
      },
    },
    async (_request, reply) => {
      return reply.send({
        data: PERMISSION_DEFINITIONS.map((p) => ({
          ...p,
          bit: p.bit.toString(),
        })),
      });
    }
  );

  // 2. List Roles (Global + Project Scoped)
  app.get(
    '/roles',
    {
      schema: {
        description: 'List roles available globally and within project',
        tags: ['Role-Based Access Control'],
        querystring: z.object({
          projectKey: z.string().optional(),
        }),
      },
    },
    async (request, reply) => {
      const { projectKey } = request.query;
      let project: { id: string } | undefined;

      if (projectKey) {
        project = await db.query.projects.findFirst({
          where: eq(projects.key, projectKey),
        });
      }

      // Fetch global roles (projectId is null) and project-specific roles
      const allRoles = await db.query.roles.findMany({
        where: (r, { or, eq: eqOp, isNull }) =>
          project ? or(isNull(r.projectId), eqOp(r.projectId, project.id)) : isNull(r.projectId),
        orderBy: (r, { desc }) => [desc(r.isSystem), desc(r.createdAt)],
      });

      // Fetch member count per role
      const memberCounts = await db
        .select({
          roleId: projectMembers.roleId,
          count: sql<number>`count(*)::int`,
        })
        .from(projectMembers)
        .groupBy(projectMembers.roleId);

      const countMap = new Map(memberCounts.map((m) => [m.roleId, m.count]));

      return reply.send({
        data: allRoles.map((r) => ({
          id: r.id,
          name: r.name,
          description: r.description,
          color: r.color,
          isSystem: r.isSystem,
          projectId: r.projectId,
          permissions: r.permissions.toString(),
          memberCount: countMap.get(r.id) || 0,
          createdAt: r.createdAt.toISOString(),
          updatedAt: r.updatedAt.toISOString(),
        })),
      });
    }
  );

  // 3. Create a Custom Dynamic Role
  app.post(
    '/roles',
    {
      schema: {
        description: 'Create a custom dynamic role with custom permission bitmask',
        tags: ['Role-Based Access Control'],
        body: z.object({
          name: z.string().min(2).max(100),
          description: z.string().max(500).default(''),
          color: z.string().default('#4F46E5'),
          permissions: z.string(), // BigInt serialized as string
          projectKey: z.string().optional(),
        }),
      },
    },
    async (request, reply) => {
      const user = await getCurrentUser(request);
      if (!user) return reply.status(401).send({ error: 'Unauthorized' });

      const { name, description, color, permissions: permStr, projectKey } = request.body;
      const permBigInt = BigInt(permStr || '0');

      let targetProjectId: string | null = null;
      if (projectKey) {
        const proj = await db.query.projects.findFirst({
          where: eq(projects.key, projectKey),
        });
        if (!proj) return reply.status(404).send({ error: 'Project not found' });
        targetProjectId = proj.id;
      }

      // Check permission: Org Admin or Member Manage in project
      const { permissions } = await getEffectiveUserPermissions(user.id, projectKey);
      if (!hasPermission(permissions, Permissions.MEMBER_MANAGE) && !hasPermission(permissions, Permissions.ORG_ADMIN)) {
        return reply.status(403).send({ error: 'Requires Member & Role Management permission' });
      }

      const [newRole] = await db
        .insert(roles)
        .values({
          name,
          description,
          color,
          isSystem: false,
          permissions: permBigInt,
          projectId: targetProjectId,
        })
        .returning();

      return reply.status(201).send({
        data: {
          ...newRole,
          permissions: newRole.permissions.toString(),
          createdAt: newRole.createdAt.toISOString(),
          updatedAt: newRole.updatedAt.toISOString(),
        },
      });
    }
  );

  // 4. Update a Custom Role
  app.patch(
    '/roles/:roleId',
    {
      schema: {
        description: 'Update a role bitmask or metadata',
        tags: ['Role-Based Access Control'],
        params: z.object({
          roleId: z.string().uuid(),
        }),
        body: z.object({
          name: z.string().min(2).max(100).optional(),
          description: z.string().max(500).optional(),
          color: z.string().optional(),
          permissions: z.string().optional(),
        }),
      },
    },
    async (request, reply) => {
      const user = await getCurrentUser(request);
      if (!user) return reply.status(401).send({ error: 'Unauthorized' });

      const { roleId } = request.params;
      const existing = await db.query.roles.findFirst({
        where: eq(roles.id, roleId),
      });

      if (!existing) return reply.status(404).send({ error: 'Role not found' });

      const updateData: Partial<typeof roles.$inferInsert> = {
        updatedAt: new Date(),
      };

      if (request.body.name) {
        updateData.name = request.body.name;
      }
      if (request.body.description !== undefined) {
        updateData.description = request.body.description;
      }
      if (request.body.color) {
        updateData.color = request.body.color;
      }
      if (request.body.permissions !== undefined) {
        updateData.permissions = BigInt(request.body.permissions);
      }

      const [updated] = await db
        .update(roles)
        .set(updateData)
        .where(eq(roles.id, roleId))
        .returning();

      return reply.send({
        data: {
          ...updated,
          permissions: updated.permissions.toString(),
          createdAt: updated.createdAt.toISOString(),
          updatedAt: updated.updatedAt.toISOString(),
        },
      });
    }
  );

  // 5. Delete a Custom Role
  app.delete(
    '/roles/:roleId',
    {
      schema: {
        description: 'Delete a custom role',
        tags: ['Role-Based Access Control'],
        params: z.object({
          roleId: z.string().uuid(),
        }),
      },
    },
    async (request, reply) => {
      const user = await getCurrentUser(request);
      if (!user) return reply.status(401).send({ error: 'Unauthorized' });

      const { roleId } = request.params;
      const existing = await db.query.roles.findFirst({
        where: eq(roles.id, roleId),
      });

      if (!existing) return reply.status(404).send({ error: 'Role not found' });

      // Cleanly remove any project member associations before deleting role
      await db.delete(projectMembers).where(eq(projectMembers.roleId, roleId));
      await db.delete(roles).where(eq(roles.id, roleId));
      return reply.send({ success: true });
    }
  );

  // 6. List Project Members
  app.get(
    '/projects/:projectKey/members',
    {
      schema: {
        description: 'List team members and their assigned roles for a project',
        tags: ['Role-Based Access Control'],
        params: z.object({
          projectKey: z.string(),
        }),
      },
    },
    async (request, reply) => {
      const { projectKey } = request.params;
      const project = await db.query.projects.findFirst({
        where: eq(projects.key, projectKey),
      });

      if (!project) return reply.status(404).send({ error: 'Project not found' });

      const members = await db.query.projectMembers.findMany({
        where: eq(projectMembers.projectId, project.id),
        with: {
          user: true,
          role: true,
        },
        orderBy: (m, { asc }) => [asc(m.createdAt)],
      });

      return reply.send({
        data: members.map((m) => ({
          id: m.id,
          userId: m.user.id,
          email: m.user.email,
          fullName: m.user.fullName,
          avatarUrl: m.user.avatarUrl,
          userType: m.user.userType,
          role: {
            id: m.role.id,
            name: m.role.name,
            color: m.role.color,
            isSystem: m.role.isSystem,
            permissions: m.role.permissions.toString(),
          },
          createdAt: m.createdAt.toISOString(),
        })),
      });
    }
  );

  // 7. Assign or Update Member Role in Project
  app.post(
    '/projects/:projectKey/members',
    {
      schema: {
        description: 'Assign or update a member role in project',
        tags: ['Role-Based Access Control'],
        params: z.object({
          projectKey: z.string(),
        }),
        body: z.object({
          userId: z.string().uuid(),
          roleId: z.string().uuid(),
        }),
      },
    },
    async (request, reply) => {
      const user = await getCurrentUser(request);
      if (!user) return reply.status(401).send({ error: 'Unauthorized' });

      const { projectKey } = request.params;
      const callerTierInfo = await getUserRoleTier(user.id, projectKey);
      if (callerTierInfo.tier < 3) {
        return reply.status(403).send({
          type: 'https://errors.coretrack.internal/forbidden',
          title: 'Access Denied',
          status: 403,
          error: 'FORBIDDEN',
          message: 'Employees and Team Leads are not authorized to assign project member roles.',
        });
      }

      const { userId, roleId } = request.body;

      const project = await db.query.projects.findFirst({
        where: eq(projects.key, projectKey),
      });
      if (!project) return reply.status(404).send({ error: 'Project not found' });

      const targetRole = await db.query.roles.findFirst({
        where: eq(roles.id, roleId),
      });
      if (!targetRole) return reply.status(404).send({ error: 'Role not found' });

      // Upsert membership
      const [assigned] = await db
        .insert(projectMembers)
        .values({
          projectId: project.id,
          userId,
          roleId,
          updatedAt: new Date(),
        })
        .onConflictDoUpdate({
          target: [projectMembers.projectId, projectMembers.userId],
          set: {
            roleId,
            updatedAt: new Date(),
          },
        })
        .returning();

      const callerUser = await getCurrentUser(request);

      // Notification Email: Dispatch project allocation email to member
      db.query.users
        .findFirst({ where: eq(users.id, userId) })
        .then((memberUser) => {
          if (memberUser) {
            sendProjectAssignedNotification({
              recipient: { email: memberUser.email, fullName: memberUser.fullName },
              project: {
                id: project.id,
                key: project.key,
                name: project.name,
                description: project.description,
                deadline: project.deadline,
              },
              roleName: targetRole.name,
              assignedByName: callerUser?.fullName || 'Administrator',
            }).catch((err) => console.warn('[Email] Project allocation notification error:', err));
          }
        })
        .catch(() => {});

      return reply.status(200).send({
        data: assigned,
      });
    }
  );

  // 8. Remove Member from Project
  app.delete(
    '/projects/:projectKey/members/:userId',
    {
      schema: {
        description: 'Remove a member from project',
        tags: ['Role-Based Access Control'],
        params: z.object({
          projectKey: z.string(),
          userId: z.string().uuid(),
        }),
      },
    },
    async (request, reply) => {
      const user = await getCurrentUser(request);
      if (!user) return reply.status(401).send({ error: 'Unauthorized' });

      const { projectKey, userId } = request.params;
      const callerTierInfo = await getUserRoleTier(user.id, projectKey);
      if (callerTierInfo.tier < 3) {
        return reply.status(403).send({
          type: 'https://errors.coretrack.internal/forbidden',
          title: 'Access Denied',
          status: 403,
          error: 'FORBIDDEN',
          message: 'Employees and Team Leads are not authorized to remove project members.',
        });
      }

      const project = await db.query.projects.findFirst({
        where: eq(projects.key, projectKey),
      });
      if (!project) return reply.status(404).send({ error: 'Project not found' });

      await db
        .delete(projectMembers)
        .where(and(eq(projectMembers.projectId, project.id), eq(projectMembers.userId, userId)));

      return reply.send({ success: true });
    }
  );
};
