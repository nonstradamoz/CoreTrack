import { FastifyPluginAsync } from 'fastify';
import { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import {
  db,
  dailyStandups,
  tickets,
  projects,
  users,
  ticketDependencies,
  eq,
  and,
  inArray,
  desc,
  gte,
  lte,
} from '@coretrack/db';
import { SaveDailyStandupSchema } from '@coretrack/shared';
import { broadcastToProject } from '../ws.js';

export const standupRoutes: FastifyPluginAsync = async (fastify) => {
  const app = fastify.withTypeProvider<ZodTypeProvider>();

  // 1. Get Today's Work & Auto-compiled Standup for current user
  app.get(
    '/today',
    {
      schema: {
        description: "Get today's compiled work activity and saved standup for the current user",
        tags: ['Standups'],
        querystring: z.object({
          projectKey: z.string().optional().default('CORE'),
        }),
      },
    },
    async (request, reply) => {
      const { projectKey } = request.query;

      // In production IAM, extracted from JWT session. Fallback to active mock user.
      const defaultUser = await db.query.users.findFirst();
      if (!defaultUser) {
        return reply.status(401).send({ error: 'No authenticated user available' });
      }

      const proj = await db.query.projects.findFirst({
        where: eq(projects.key, projectKey),
      });

      if (!proj) {
        return reply.status(404).send({ error: 'Project not found' });
      }

      const today = new Date();
      const todayDateStr = today.toISOString().split('T')[0];

      // Start and end of today in local/UTC
      const startOfDay = new Date();
      startOfDay.setHours(0, 0, 0, 0);

      // A. Query tasks completed today
      const completedTodayRaw = await db.query.tickets.findMany({
        where: and(
          eq(tickets.projectId, proj.id),
          eq(tickets.assigneeId, defaultUser.id),
          inArray(tickets.status, ['DONE', 'RESOLVED']),
          gte(tickets.updatedAt, startOfDay)
        ),
        orderBy: desc(tickets.updatedAt),
      });

      // B. Query tasks currently in progress
      const inProgressRaw = await db.query.tickets.findMany({
        where: and(
          eq(tickets.projectId, proj.id),
          eq(tickets.assigneeId, defaultUser.id),
          eq(tickets.status, 'IN_PROGRESS')
        ),
        orderBy: desc(tickets.updatedAt),
      });

      // C. Query blocked tasks
      const allMyOpenTickets = await db.query.tickets.findMany({
        where: and(
          eq(tickets.projectId, proj.id),
          eq(tickets.assigneeId, defaultUser.id),
          inArray(tickets.status, ['TODO', 'IN_PROGRESS', 'IN_REVIEW', 'PENDING_APPROVAL'])
        ),
      });

      const openTicketIds = allMyOpenTickets.map((t) => t.id);
      let blockedTickets: typeof allMyOpenTickets = [];
      if (openTicketIds.length > 0) {
        const blockingDeps = await db.query.ticketDependencies.findMany({
          where: and(
            inArray(ticketDependencies.targetTicketId, openTicketIds),
            eq(ticketDependencies.dependencyType, 'BLOCKS')
          ),
        });
        const blockedTargetIds = new Set(blockingDeps.map((d) => d.targetTicketId));
        blockedTickets = allMyOpenTickets.filter((t) => blockedTargetIds.has(t.id));
      }

      // Check if user already submitted a standup for today
      const savedStandup = await db.query.dailyStandups.findFirst({
        where: and(
          eq(dailyStandups.userId, defaultUser.id),
          eq(dailyStandups.projectId, proj.id),
          eq(dailyStandups.standupDate, todayDateStr)
        ),
      });

      // Generate clean markdown template
      const completedBullets =
        completedTodayRaw.length > 0
          ? completedTodayRaw
            .map((t) => `• [${t.ticketKey}] ${t.title}${t.storyPoints ? ` (${t.storyPoints} pts)` : ''}`)
            .join('\n')
          : '• None yet';

      const inProgressBullets =
        inProgressRaw.length > 0
          ? inProgressRaw
            .map((t) => `• [${t.ticketKey}] ${t.title}${t.storyPoints ? ` (${t.storyPoints} pts)` : ''}`)
            .join('\n')
          : '• None';

      const blockerBullets =
        blockedTickets.length > 0
          ? blockedTickets.map((t) => `• [${t.ticketKey}] ${t.title} (Blocked by dependency)`).join('\n')
          : savedStandup?.blockers || '• None';

      const generatedSummaryMarkdown = `*Daily Status Update — ${today.toLocaleDateString(undefined, {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      })}*

*Completed Today:*
${completedBullets}

⏳ *In Progress:*
${inProgressBullets}

🚫 *Blockers:*
${blockerBullets}`;

      return reply.send({
        data: {
          user: {
            id: defaultUser.id,
            fullName: defaultUser.fullName,
            email: defaultUser.email,
          },
          project: {
            id: proj.id,
            key: proj.key,
            name: proj.name,
          },
          date: todayDateStr,
          savedStandup: savedStandup || null,
          autoCompiled: {
            completed: completedTodayRaw.map((t) => ({
              key: t.ticketKey,
              title: t.title,
              status: t.status,
              priority: t.priority,
              storyPoints: t.storyPoints,
            })),
            inProgress: inProgressRaw.map((t) => ({
              key: t.ticketKey,
              title: t.title,
              status: t.status,
              priority: t.priority,
              storyPoints: t.storyPoints,
            })),
            blocked: blockedTickets.map((t) => ({
              key: t.ticketKey,
              title: t.title,
              status: t.status,
              priority: t.priority,
              storyPoints: t.storyPoints,
            })),
          },
          generatedSummaryMarkdown,
        },
      });
    }
  );

  // 2. Save or Update Daily Standup
  app.post(
    '/',
    {
      schema: {
        description: 'Save or update daily standup submission',
        tags: ['Standups'],
        body: SaveDailyStandupSchema,
      },
    },
    async (request, reply) => {
      const body = request.body;

      const defaultUser = await db.query.users.findFirst();
      if (!defaultUser) {
        return reply.status(401).send({ error: 'No authenticated user available' });
      }

      const proj = await db.query.projects.findFirst({
        where: eq(projects.id, body.projectId),
      });

      if (!proj) {
        return reply.status(404).send({ error: 'Project not found' });
      }

      // Check if already exists for upsert
      const existing = await db.query.dailyStandups.findFirst({
        where: and(
          eq(dailyStandups.userId, defaultUser.id),
          eq(dailyStandups.projectId, body.projectId),
          eq(dailyStandups.standupDate, body.standupDate)
        ),
      });

      let result;
      if (existing) {
        const [updated] = await db
          .update(dailyStandups)
          .set({
            completedTaskIds: body.completedTaskIds,
            inProgressTaskIds: body.inProgressTaskIds,
            blockers: body.blockers || '',
            customNotes: body.customNotes || '',
            summaryMarkdown: body.summaryMarkdown,
            updatedAt: new Date(),
          })
          .where(eq(dailyStandups.id, existing.id))
          .returning();
        result = updated;
      } else {
        const [inserted] = await db
          .insert(dailyStandups)
          .values({
            userId: defaultUser.id,
            projectId: body.projectId,
            standupDate: body.standupDate,
            completedTaskIds: body.completedTaskIds,
            inProgressTaskIds: body.inProgressTaskIds,
            blockers: body.blockers || '',
            customNotes: body.customNotes || '',
            summaryMarkdown: body.summaryMarkdown,
          })
          .returning();
        result = inserted;
      }

      // Broadcast WebSocket notification to project channel
      broadcastToProject(proj.key, {
        type: 'STANDUP_SUBMITTED',
        payload: {
          standupId: result.id,
          userId: defaultUser.id,
          userName: defaultUser.fullName,
          date: result.standupDate,
        },
      });

      return reply.status(200).send({ data: result });
    }
  );

  // 3. Get Team Standups for a specific date
  app.get(
    '/team',
    {
      schema: {
        description: 'Get all team standups for a given project and date',
        tags: ['Standups'],
        querystring: z.object({
          projectKey: z.string().default('CORE'),
          date: z.string().optional(),
        }),
      },
    },
    async (request, reply) => {
      const { projectKey, date } = request.query;

      const proj = await db.query.projects.findFirst({
        where: eq(projects.key, projectKey),
      });

      if (!proj) {
        return reply.status(404).send({ error: 'Project not found' });
      }

      const targetDate = date || new Date().toISOString().split('T')[0];

      const standups = await db.query.dailyStandups.findMany({
        where: and(
          eq(dailyStandups.projectId, proj.id),
          eq(dailyStandups.standupDate, targetDate)
        ),
        orderBy: desc(dailyStandups.createdAt),
        with: {
          user: true,
        },
      });

      return reply.send({
        data: {
          projectKey,
          date: targetDate,
          standups: standups.map((s) => ({
            id: s.id,
            standupDate: s.standupDate,
            user: {
              id: s.user.id,
              fullName: s.user.fullName,
              email: s.user.email,
            },
            completedTasks: s.completedTaskIds,
            inProgressTasks: s.inProgressTaskIds,
            blockers: s.blockers,
            customNotes: s.customNotes,
            summaryMarkdown: s.summaryMarkdown,
            createdAt: s.createdAt,
            updatedAt: s.updatedAt,
          })),
        },
      });
    }
  );
};
