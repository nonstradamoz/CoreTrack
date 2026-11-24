import { FastifyPluginAsync } from 'fastify';
import { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { db, sprints, projects, tickets, eq, desc } from '@coretrack/db';
import { broadcastToProject } from '../ws.js';

export const sprintRoutes: FastifyPluginAsync = async (fastify) => {
  const app = fastify.withTypeProvider<ZodTypeProvider>();

  // 1. List Sprints for a Project
  app.get(
    '/projects/:key/sprints',
    {
      schema: {
        description: 'List sprints for a given project key',
        tags: ['Sprints'],
        params: z.object({
          key: z.string(),
        }),
      },
    },
    async (request, reply) => {
      const { key } = request.params;
      const project = await db.query.projects.findFirst({
        where: eq(projects.key, key),
      });

      if (!project) {
        return reply.status(404).send({ error: 'Project not found' });
      }

      const projectSprints = await db
        .select()
        .from(sprints)
        .where(eq(sprints.projectId, project.id))
        .orderBy(desc(sprints.createdAt));

      // Calculate story points and ticket counts per sprint
      const sprintsWithMetrics = await Promise.all(
        projectSprints.map(async (sprint) => {
          const sprintTickets = await db
            .select()
            .from(tickets)
            .where(eq(tickets.sprintId, sprint.id));

          const totalPoints = sprintTickets.reduce((acc, t) => acc + (t.storyPoints || 0), 0);
          const completedPoints = sprintTickets
            .filter((t) => t.status === 'DONE')
            .reduce((acc, t) => acc + (t.storyPoints || 0), 0);

          return {
            ...sprint,
            ticketCount: sprintTickets.length,
            totalPoints,
            completedPoints,
          };
        })
      );

      return reply.send({ data: sprintsWithMetrics });
    }
  );

  // 2. Create a Sprint
  app.post(
    '/projects/:key/sprints',
    {
      schema: {
        description: 'Create a new sprint for planning',
        tags: ['Sprints'],
        params: z.object({
          key: z.string(),
        }),
        body: z.object({
          name: z.string().min(1).max(100),
          goal: z.string().optional(),
          startDate: z.string().datetime().optional(),
          endDate: z.string().datetime().optional(),
        }),
      },
    },
    async (request, reply) => {
      const { key } = request.params;
      const { name, goal, startDate, endDate } = request.body;

      const project = await db.query.projects.findFirst({
        where: eq(projects.key, key),
      });

      if (!project) {
        return reply.status(404).send({ error: 'Project not found' });
      }

      const [newSprint] = await db
        .insert(sprints)
        .values({
          projectId: project.id,
          name,
          goal,
          status: 'PLANNING',
          startDate: startDate ? new Date(startDate) : undefined,
          endDate: endDate ? new Date(endDate) : undefined,
        })
        .returning();

      broadcastToProject(key, {
        type: 'SPRINT_CREATED',
        payload: newSprint,
      });

      return reply.status(201).send({ data: newSprint });
    }
  );

  // 3. Update Sprint Status (Start / Complete Sprint)
  app.patch(
    '/sprints/:id',
    {
      schema: {
        description: 'Update sprint status (PLANNING -> ACTIVE -> CLOSED)',
        tags: ['Sprints'],
        params: z.object({
          id: z.string().uuid(),
        }),
        body: z.object({
          status: z.enum(['PLANNING', 'ACTIVE', 'CLOSED']).optional(),
          name: z.string().optional(),
          goal: z.string().optional(),
        }),
      },
    },
    async (request, reply) => {
      const { id } = request.params;
      const updates = request.body;

      const [updatedSprint] = await db
        .update(sprints)
        .set({
          ...updates,
        })
        .where(eq(sprints.id, id))
        .returning();

      if (!updatedSprint) {
        return reply.status(404).send({ error: 'Sprint not found' });
      }

      // If sprint is closed, rollover incomplete tickets to backlog
      if (updates.status === 'CLOSED') {
        const incompleteTickets = await db
          .select()
          .from(tickets)
          .where(eq(tickets.sprintId, id));

        for (const t of incompleteTickets) {
          if (t.status !== 'DONE') {
            await db
              .update(tickets)
              .set({ sprintId: null })
              .where(eq(tickets.id, t.id));
          }
        }
      }

      return reply.send({ data: updatedSprint });
    }
  );

  // 4. Assign Ticket to Sprint (or Backlog)
  app.patch(
    '/tickets/:ticketKey/sprint',
    {
      schema: {
        description: 'Assign or remove ticket from a sprint',
        tags: ['Sprints'],
        params: z.object({
          ticketKey: z.string(),
        }),
        body: z.object({
          sprintId: z.string().uuid().nullable(),
        }),
      },
    },
    async (request, reply) => {
      const { ticketKey } = request.params;
      const { sprintId } = request.body;

      const [updatedTicket] = await db
        .update(tickets)
        .set({
          sprintId,
          updatedAt: new Date(),
        })
        .where(eq(tickets.ticketKey, ticketKey))
        .returning();

      if (!updatedTicket) {
        return reply.status(404).send({ error: 'Ticket not found' });
      }

      const projectKey = ticketKey.split('-')[0];
      broadcastToProject(projectKey, {
        type: 'TICKET_UPDATED',
        payload: updatedTicket,
      });

      return reply.send({ data: updatedTicket });
    }
  );
};
