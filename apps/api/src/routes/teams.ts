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
import { getCurrentUser, getUserRoleTier } from '../auth/auth.js';
import { Permissions } from '@coretrack/shared';

export const teamRoutes: FastifyPluginAsync = async (fastify) => {
  const app = fastify.withTypeProvider<ZodTypeProvider>();

  async function isUserTeamLead(userId: string): Promise<boolean> {
    const tierInfo = await getUserRoleTier(userId);
    return tierInfo.tier === 2 || tierInfo.roleName.toLowerCase().includes('team lead');
  }

  // 1. List Teams with Department, Lead, Members, and Associated Projects
  app.get(
    '/',
    {
      schema: {
        description: 'List all teams with leads, member allocations, and workload',
        tags: ['Teams'],
      },
    },
    async (request, reply) => {
      const caller = await getCurrentUser(request);
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

      // Scope visible teams: non-admin users only see teams they are assigned to
      let visibleTeams = allTeams;
      if (caller) {
        const tierInfo = await getUserRoleTier(caller.id);
        if (tierInfo.tier < 4) {
          visibleTeams = allTeams.filter(
            (t) => t.leadId === caller.id || t.members.some((m) => m.userId === caller.id)
          );
        }
      }

      // Get ticket counts for each team
      const teamsWithMetrics = await Promise.all(
        visibleTeams.map(async (t) => {
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

      if (leadId && !(await isUserTeamLead(leadId))) {
        return reply.status(400).send({
          error: 'Only users with the Team Lead role can be assigned as a Team Lead.',
        });
      }

      // Check duplicate keyPrefix
      const existingPrefix = await db.query.teams.findFirst({
        where: eq(teams.keyPrefix, keyPrefix),
      });
      if (existingPrefix) {
        return reply.status(400).send({
          error: `A team with prefix '${keyPrefix}' already exists. Please use a different prefix.`,
        });
      }

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

      if (leadId && !(await isUserTeamLead(leadId))) {
        return reply.status(400).send({
          error: 'Only users with the Team Lead role can be assigned as a Team Lead.',
        });
      }

      const existingTeam = await db.query.teams.findFirst({
        where: eq(teams.id, id),
      });
      if (!existingTeam) {
        return reply.status(404).send({ error: 'Team not found' });
      }

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

      // If primary lead was changed or cleared, demote the previous primary lead in teamMembers
      if (leadId !== undefined && existingTeam.leadId && existingTeam.leadId !== leadId) {
        await db
          .update(teamMembers)
          .set({ role: 'MEMBER' })
          .where(and(eq(teamMembers.teamId, id), eq(teamMembers.userId, existingTeam.leadId)));
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

      if (role === 'LEAD' && !(await isUserTeamLead(userId))) {
        return reply.status(400).send({
          error: 'Only users with the Team Lead role can be assigned the LEAD role in a team.',
        });
      }

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

      // If the removed user was the team's primary lead, clear teams.leadId
      await db
        .update(teams)
        .set({ leadId: null, updatedAt: new Date() })
        .where(and(eq(teams.id, id), eq(teams.leadId, userId)));

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

      if (role === 'LEAD' && !(await isUserTeamLead(userId))) {
        return reply.status(400).send({
          error: 'Only users with the Team Lead role can be promoted to Team Lead.',
        });
      }

      const [updated] = await db
        .update(teamMembers)
        .set({ role })
        .where(and(eq(teamMembers.teamId, id), eq(teamMembers.userId, userId)))
        .returning();

      if (!updated) {
        return reply.status(404).send({ error: 'Team member not found' });
      }

      // Sync teams.leadId when demoting the primary lead or promoting when no primary lead is set
      if (role === 'MEMBER') {
        await db
          .update(teams)
          .set({ leadId: null, updatedAt: new Date() })
          .where(and(eq(teams.id, id), eq(teams.leadId, userId)));
      } else if (role === 'LEAD') {
        const team = await db.query.teams.findFirst({ where: eq(teams.id, id) });
        if (team && !team.leadId) {
          await db
            .update(teams)
            .set({ leadId: userId, updatedAt: new Date() })
            .where(eq(teams.id, id));
        }
      }

      return reply.send({ data: updated });
    }
  );
};
