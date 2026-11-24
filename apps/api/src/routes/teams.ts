import { FastifyPluginAsync } from 'fastify';
import { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import {
  db,
  teams,
  teamMembers,
  departments,
  users,
  projects,
  tickets,
  eq,
  and,
  inArray,
} from '@coretrack/db';
import { getCurrentUser } from '../auth/auth.js';
import { Permissions } from '@coretrack/shared';

export const teamRoutes: FastifyPluginAsync = async (fastify) => {
  const app = fastify.withTypeProvider<ZodTypeProvider>();

  // 1. List Teams with Department, Lead, Members, and Associated Projects
  app.get(
    '/',
    {
      schema: {
        description: 'List all teams with leads, member allocations, and workload',
        tags: ['Teams'],
      },
    },
    async (_request, reply) => {
      const allTeams = await db.query.teams.findMany({
        with: {
          department: true,
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
          projects: {
            columns: {
              id: true,
              key: true,
              name: true,
              status: true,
            },
          },
        },
      });

      // Get ticket counts for each team
      const teamsWithMetrics = await Promise.all(
        allTeams.map(async (t) => {
          const memberUserIds = t.members.map((m) => m.userId);
          let assignedTicketsCount = 0;
          if (memberUserIds.length > 0) {
            const memberTickets = await db
              .select({ id: tickets.id })
              .from(tickets)
              .where(inArray(tickets.assigneeId, memberUserIds));
            assignedTicketsCount = memberTickets.length;
          }

          return {
            ...t,
            memberCount: t.members.length,
            assignedTicketsCount,
          };
        })
      );

      return reply.send({ data: teamsWithMetrics });
    }
  );

  // 1b. List Departments
  app.get(
    '/departments',
    {
      schema: {
        description: 'List all departments',
        tags: ['Teams'],
      },
    },
    async (_request, reply) => {
      const allDepts = await db.query.departments.findMany();
      return reply.send({ data: allDepts });
    }
  );

  // 2. Get Team Details
  app.get(
    '/:id',
    {
      schema: {
        description: 'Get team details by ID',
        tags: ['Teams'],
        params: z.object({
          id: z.string().uuid(),
        }),
      },
    },
    async (request, reply) => {
      const { id } = request.params;
      const team = await db.query.teams.findFirst({
        where: eq(teams.id, id),
        with: {
          department: true,
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
          projects: true,
        },
      });

      if (!team) {
        return reply.status(404).send({ error: 'Team not found' });
      }

      return reply.send({ data: team });
    }
  );

  // 3. Create Team
  app.post(
    '/',
    {
      schema: {
        description: 'Create a new team (Admin / Super Admin)',
        tags: ['Teams'],
        body: z.object({
          name: z.string().min(2).max(100),
          keyPrefix: z.string().min(2).max(10).toUpperCase(),
          departmentId: z.string().uuid().optional().nullable(),
          description: z.string().optional(),
          leadId: z.string().uuid().optional().nullable(),
        }),
      },
    },
    async (request, reply) => {
      const user = await getCurrentUser(request);
      if (!user) return reply.status(401).send({ error: 'Unauthorized' });

      const { name, keyPrefix, departmentId, description, leadId } = request.body;

      let resolvedDeptId = departmentId;
      if (!resolvedDeptId) {
        const firstDept = await db.query.departments.findFirst();
        if (firstDept) {
          resolvedDeptId = firstDept.id;
        } else {
          const [createdDept] = await db
            .insert(departments)
            .values({ name: 'General', code: 'GEN' })
            .returning();
          resolvedDeptId = createdDept.id;
        }
      }

      const [newTeam] = await db
        .insert(teams)
        .values({
          name,
          keyPrefix,
          departmentId: resolvedDeptId,
          description: description || null,
          leadId: leadId || null,
        })
        .returning();

      // If lead is specified, automatically add to team_members as LEAD
      if (leadId) {
        await db
          .insert(teamMembers)
          .values({
            teamId: newTeam.id,
            userId: leadId,
            role: 'LEAD',
          })
          .onConflictDoNothing();
      }

      return reply.status(201).send({ data: newTeam });
    }
  );

  // 4. Update Team
  app.patch(
    '/:id',
    {
      schema: {
        description: 'Update team details or lead',
        tags: ['Teams'],
        params: z.object({
          id: z.string().uuid(),
        }),
        body: z.object({
          name: z.string().min(2).max(100).optional(),
          description: z.string().optional(),
          leadId: z.string().uuid().optional().nullable(),
          departmentId: z.string().uuid().optional(),
        }),
      },
    },
    async (request, reply) => {
      const { id } = request.params;
      const { name, description, leadId, departmentId } = request.body;

      const updateData: Record<string, unknown> = {
        updatedAt: new Date(),
      };
      if (name !== undefined) updateData.name = name;
      if (description !== undefined) updateData.description = description;
      if (leadId !== undefined) updateData.leadId = leadId;
      if (departmentId !== undefined) updateData.departmentId = departmentId;

      const [updatedTeam] = await db
        .update(teams)
        .set(updateData)
        .where(eq(teams.id, id))
        .returning();

      if (!updatedTeam) {
        return reply.status(404).send({ error: 'Team not found' });
      }

      if (leadId) {
        // Ensure lead is in teamMembers with 'LEAD' role
        const existingMember = await db.query.teamMembers.findFirst({
          where: and(eq(teamMembers.teamId, id), eq(teamMembers.userId, leadId)),
        });

        if (existingMember) {
          await db
            .update(teamMembers)
            .set({ role: 'LEAD' })
            .where(eq(teamMembers.id, existingMember.id));
        } else {
          await db
            .insert(teamMembers)
            .values({
              teamId: id,
              userId: leadId,
              role: 'LEAD',
            })
            .onConflictDoNothing();
        }
      }

      return reply.send({ data: updatedTeam });
    }
  );

  // 5. Delete Team
  app.delete(
    '/:id',
    {
      schema: {
        description: 'Delete team',
        tags: ['Teams'],
        params: z.object({
          id: z.string().uuid(),
        }),
      },
    },
    async (request, reply) => {
      const { id } = request.params;

      // Check if team has associated projects
      const linkedProjects = await db.query.projects.findMany({
        where: eq(projects.primaryTeamId, id),
      });

      if (linkedProjects.length > 0) {
        return reply.status(400).send({
          error: `Cannot delete team with active project allocations (${linkedProjects.map((p) => p.name).join(', ')})`,
        });
      }

      // Delete team members first
      await db.delete(teamMembers).where(eq(teamMembers.teamId, id));
      await db.delete(teams).where(eq(teams.id, id));

      return reply.send({ message: 'Team deleted successfully' });
    }
  );

  // 6. Add Member to Team
  app.post(
    '/:id/members',
    {
      schema: {
        description: 'Add an employee to team',
        tags: ['Teams'],
        params: z.object({
          id: z.string().uuid(),
        }),
        body: z.object({
          userId: z.string().uuid(),
          role: z.enum(['LEAD', 'MEMBER']).default('MEMBER'),
        }),
      },
    },
    async (request, reply) => {
      const { id } = request.params;
      const { userId, role } = request.body;

      const [member] = await db
        .insert(teamMembers)
        .values({
          teamId: id,
          userId,
          role,
        })
        .onConflictDoNothing()
        .returning();

      return reply.status(201).send({ data: member || { message: 'User already in team' } });
    }
  );

  // 7. Remove Member from Team
  app.delete(
    '/:id/members/:userId',
    {
      schema: {
        description: 'Remove employee from team',
        tags: ['Teams'],
        params: z.object({
          id: z.string().uuid(),
          userId: z.string().uuid(),
        }),
      },
    },
    async (request, reply) => {
      const { id, userId } = request.params;

      await db
        .delete(teamMembers)
        .where(and(eq(teamMembers.teamId, id), eq(teamMembers.userId, userId)));

      return reply.send({ message: 'Member removed from team' });
    }
  );

  // 8. Update Member Role in Team
  app.patch(
    '/:id/members/:userId',
    {
      schema: {
        description: 'Update employee role in team (LEAD or MEMBER)',
        tags: ['Teams'],
        params: z.object({
          id: z.string().uuid(),
          userId: z.string().uuid(),
        }),
        body: z.object({
          role: z.enum(['LEAD', 'MEMBER']),
        }),
      },
    },
    async (request, reply) => {
      const { id, userId } = request.params;
      const { role } = request.body;

      const [updated] = await db
        .update(teamMembers)
        .set({ role })
        .where(and(eq(teamMembers.teamId, id), eq(teamMembers.userId, userId)))
        .returning();

      return reply.send({ data: updated });
    }
  );
};
