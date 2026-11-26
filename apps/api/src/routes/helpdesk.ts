import { FastifyPluginAsync } from 'fastify';
import { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import {
  db,
  helpdeskTickets,
  helpdeskComments,
  eq,
  and,
  desc,
  asc,
  sql,
} from '@coretrack/db';
import { calculateSLADueDates, Permissions, hasPermission } from '@coretrack/shared';
import { getCurrentUser, getUserRoleTier, getEffectiveUserPermissions } from '../auth/auth.js';

export const helpdeskRoutes: FastifyPluginAsync = async (fastify) => {
  const app = fastify.withTypeProvider<ZodTypeProvider>();

  async function isSupportAgent(userId: string): Promise<boolean> {
    const tierInfo = await getUserRoleTier(userId);
    if (tierInfo.tier >= 3) return true;
    const { permissions } = await getEffectiveUserPermissions(userId);
    return hasPermission(permissions, Permissions.TICKET_ASSIGN);
  }

  // 1. List Helpdesk Tickets (mine or all for agents)
  app.get(
    '/tickets',
    {
      schema: {
        description: 'List helpdesk portal tickets (requester own or full agent queue)',
        tags: ['Helpdesk'],
        querystring: z.object({
          scope: z.enum(['mine', 'all']).default('mine'),
          status: z.string().optional(),
        }),
      },
    },
    async (request, reply) => {
      const user = await getCurrentUser(request);
      if (!user) return reply.status(401).send({ error: 'Unauthorized' });

      const { scope, status } = request.query;
      const agent = await isSupportAgent(user.id);

      if (scope === 'all' && !agent) {
        return reply.status(403).send({
          error: 'Only support agents, managers, or admins can view the full agent queue.',
        });
      }

      const conditions = [];
      if (scope === 'mine') {
        conditions.push(eq(helpdeskTickets.requesterId, user.id));
      }
      if (status && status !== 'ALL') {
        conditions.push(eq(helpdeskTickets.status, status));
      }

      const rows = await db.query.helpdeskTickets.findMany({
        where: conditions.length > 0 ? and(...conditions) : undefined,
        with: {
          requester: { columns: { id: true, fullName: true, email: true } },
          assignee: { columns: { id: true, fullName: true, email: true } },
        },
        orderBy: desc(helpdeskTickets.createdAt),
      });

      return reply.send({ data: rows });
    }
  );

  // 2. Submit a New Helpdesk Request (no Project required)
  app.post(
    '/tickets',
    {
      schema: {
        description: 'Submit a new standalone helpdesk ticket',
        tags: ['Helpdesk'],
        body: z.object({
          category: z.string().min(1).max(80),
          requestType: z.enum(['SERVICE_REQUEST', 'INCIDENT']).default('SERVICE_REQUEST'),
          title: z.string().min(2).max(255),
          description: z.string().default(''),
          department: z.string().max(80).default('Engineering'),
          priority: z.enum(['URGENT', 'HIGH', 'MEDIUM', 'LOW']).default('MEDIUM'),
        }),
      },
    },
    async (request, reply) => {
      const user = await getCurrentUser(request);
      if (!user) return reply.status(401).send({ error: 'Unauthorized' });

      const { category, requestType, title, description, department, priority } = request.body;

      // Generate next HD-N ticket number
      const maxRow = await db
        .select({ maxNum: sql<number>`coalesce(max(${helpdeskTickets.ticketNumber}), 0)::int` })
        .from(helpdeskTickets);
      const nextNum = (maxRow[0]?.maxNum || 0) + 1;
      const ticketKey = `HD-${nextNum}`;

      const { responseDueAt, resolutionDueAt } = calculateSLADueDates(priority);

      const [created] = await db
        .insert(helpdeskTickets)
        .values({
          ticketKey,
          ticketNumber: nextNum,
          category,
          requestType,
          title: title.trim(),
          description: description.trim(),
          department,
          priority,
          status: 'OPEN',
          requesterId: user.id,
          slaResponseDueAt: responseDueAt,
          slaResolutionDueAt: resolutionDueAt,
          isSlaPaused: false,
        })
        .returning();

      const hydrated = await db.query.helpdeskTickets.findFirst({
        where: eq(helpdeskTickets.id, created.id),
        with: {
          requester: { columns: { id: true, fullName: true, email: true } },
          assignee: { columns: { id: true, fullName: true, email: true } },
        },
      });

      return reply.status(201).send({ data: hydrated || created });
    }
  );

  // 3. Update Helpdesk Ticket (status, priority, assignee)
  app.patch(
    '/tickets/:ticketKey',
    {
      schema: {
        description: 'Update a helpdesk ticket status, priority, or assignee',
        tags: ['Helpdesk'],
        params: z.object({ ticketKey: z.string() }),
        body: z.object({
          status: z.enum(['OPEN', 'IN_PROGRESS', 'WAITING_ON_USER', 'RESOLVED', 'CLOSED']).optional(),
          priority: z.enum(['URGENT', 'HIGH', 'MEDIUM', 'LOW']).optional(),
          assigneeId: z.string().uuid().nullable().optional(),
        }),
      },
    },
    async (request, reply) => {
      const user = await getCurrentUser(request);
      if (!user) return reply.status(401).send({ error: 'Unauthorized' });

      const { ticketKey } = request.params;
      const existing = await db.query.helpdeskTickets.findFirst({
        where: eq(helpdeskTickets.ticketKey, ticketKey),
      });
      if (!existing) return reply.status(404).send({ error: 'Helpdesk ticket not found' });

      const agent = await isSupportAgent(user.id);
      const isRequester = existing.requesterId === user.id;
      const callerTierInfo = await getUserRoleTier(user.id);

      if (!agent) {
        if (!isRequester) {
          return reply.status(403).send({ error: 'Access denied to this ticket' });
        }
        // Requesters can only close or reopen their own ticket
        if (
          request.body.priority !== undefined ||
          request.body.assigneeId !== undefined ||
          (request.body.status && !['CLOSED', 'OPEN'].includes(request.body.status))
        ) {
          return reply.status(403).send({
            error: 'Only support agents can assign or triage tickets.',
          });
        }
      }

      // Higher-Authority Lock: Status
      if (request.body.status !== undefined && request.body.status !== existing.status) {
        const currentStatusTier = existing.statusSetByRoleTier || 1;
        if (callerTierInfo.tier < currentStatusTier) {
          return reply.status(403).send({
            error: 'IMMUTABLE_STATUS',
            message: `Status is locked: This status was set by a higher authority and cannot be modified by your role (${callerTierInfo.roleName}).`,
          });
        }
      }

      // Higher-Authority Lock: Assigned Agent
      if (request.body.assigneeId !== undefined && request.body.assigneeId !== existing.assigneeId) {
        const currentAssigneeTier = existing.assigneeSetByRoleTier || 1;
        if (callerTierInfo.tier < currentAssigneeTier) {
          return reply.status(403).send({
            error: 'IMMUTABLE_ASSIGNEE',
            message: `Assigned agent is locked: This agent was assigned by a higher authority and cannot be modified by your role (${callerTierInfo.roleName}).`,
          });
        }
      }

      const updates: Record<string, unknown> = {
        updatedAt: new Date(),
      };
      if (request.body.priority !== undefined) {
        updates.priority = request.body.priority;
        if (request.body.priority !== existing.priority) {
          const recalculated = calculateSLADueDates(request.body.priority, existing.createdAt);
          updates.slaResponseDueAt = recalculated.responseDueAt;
          updates.slaResolutionDueAt = recalculated.resolutionDueAt;
        }
      }
      if (request.body.assigneeId !== undefined) {
        updates.assigneeId = request.body.assigneeId;
        if (request.body.assigneeId !== existing.assigneeId) {
          updates.assigneeSetByRoleTier = callerTierInfo.tier;
        }
      }
      if (request.body.status !== undefined) {
        updates.status = request.body.status;
        if (request.body.status !== existing.status) {
          updates.statusSetByRoleTier = callerTierInfo.tier;
        }
        updates.isSlaPaused = ['WAITING_ON_USER', 'RESOLVED', 'CLOSED'].includes(request.body.status);
        if (['RESOLVED', 'CLOSED'].includes(request.body.status)) {
          updates.resolvedAt = new Date();
        } else {
          updates.resolvedAt = null;
        }
      }

      await db
        .update(helpdeskTickets)
        .set(updates)
        .where(eq(helpdeskTickets.id, existing.id));

      const hydrated = await db.query.helpdeskTickets.findFirst({
        where: eq(helpdeskTickets.id, existing.id),
        with: {
          requester: { columns: { id: true, fullName: true, email: true } },
          assignee: { columns: { id: true, fullName: true, email: true } },
        },
      });

      return reply.send({ data: hydrated });
    }
  );

  // 4. List Comments on a Helpdesk Ticket
  app.get(
    '/tickets/:ticketKey/comments',
    {
      schema: {
        description: 'List comments on a helpdesk ticket (internal notes hidden from requesters)',
        tags: ['Helpdesk'],
        params: z.object({ ticketKey: z.string() }),
      },
    },
    async (request, reply) => {
      const user = await getCurrentUser(request);
      if (!user) return reply.status(401).send({ error: 'Unauthorized' });

      const { ticketKey } = request.params;
      const ticket = await db.query.helpdeskTickets.findFirst({
        where: eq(helpdeskTickets.ticketKey, ticketKey),
      });
      if (!ticket) return reply.status(404).send({ error: 'Helpdesk ticket not found' });

      const agent = await isSupportAgent(user.id);
      if (!agent && ticket.requesterId !== user.id) {
        return reply.status(403).send({ error: 'Access denied' });
      }

      const rows = await db.query.helpdeskComments.findMany({
        where: agent
          ? eq(helpdeskComments.ticketId, ticket.id)
          : and(eq(helpdeskComments.ticketId, ticket.id), eq(helpdeskComments.isInternal, false)),
        with: {
          author: { columns: { id: true, fullName: true, email: true } },
        },
        orderBy: asc(helpdeskComments.createdAt),
      });

      return reply.send({ data: rows });
    }
  );

  // 5. Post a Public Reply or Internal Agent Note
  app.post(
    '/tickets/:ticketKey/comments',
    {
      schema: {
        description: 'Add a public reply or internal agent note to a helpdesk ticket',
        tags: ['Helpdesk'],
        params: z.object({ ticketKey: z.string() }),
        body: z.object({
          body: z.string().min(1).max(4000),
          isInternal: z.boolean().default(false),
        }),
      },
    },
    async (request, reply) => {
      const user = await getCurrentUser(request);
      if (!user) return reply.status(401).send({ error: 'Unauthorized' });

      const { ticketKey } = request.params;
      const ticket = await db.query.helpdeskTickets.findFirst({
        where: eq(helpdeskTickets.ticketKey, ticketKey),
      });
      if (!ticket) return reply.status(404).send({ error: 'Helpdesk ticket not found' });

      const agent = await isSupportAgent(user.id);
      if (!agent && ticket.requesterId !== user.id) {
        return reply.status(403).send({ error: 'Access denied' });
      }

      const isInternal = agent ? request.body.isInternal : false;

      const [created] = await db
        .insert(helpdeskComments)
        .values({
          ticketId: ticket.id,
          authorId: user.id,
          body: request.body.body.trim(),
          isInternal,
        })
        .returning();

      await db
        .update(helpdeskTickets)
        .set({ updatedAt: new Date() })
        .where(eq(helpdeskTickets.id, ticket.id));

      return reply.status(201).send({
        data: {
          ...created,
          author: { id: user.id, fullName: user.fullName, email: user.email },
        },
      });
    }
  );
};
