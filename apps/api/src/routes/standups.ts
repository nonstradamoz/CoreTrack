import { FastifyPluginAsync } from 'fastify';
import { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import {
  db,
  dailyStandups,
  tickets,
  projects,
  teamMembers,
  eq,
  and,
  or,
  isNull,
  inArray,
  desc,
  gte,
  lt,
} from '@coretrack/db';
import { SaveDailyStandupSchema } from '@coretrack/shared';
import { broadcastToProject } from '../ws.js';
import { getCurrentUser, getUserRoleTier, getUserTeamIds } from '../auth/auth.js';

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
          tzOffset: z.coerce.number().optional(),
        }),
      },
    },
    async (request, reply) => {
      const { projectKey, tzOffset } = request.query;
      const normalizedKey = projectKey.toUpperCase();

      const currentUser = await getCurrentUser(request);
      if (!currentUser) {
        return reply.status(401).send({ error: 'No authenticated user available' });
      }

      const proj = await db.query.projects.findFirst({
        where: eq(projects.key, normalizedKey),
      });

      if (!proj) {
        return reply.status(404).send({ error: 'Project not found' });
      }

      const now = new Date();
      // Compute user's local today if tzOffset (minutes from UTC, e.g. -330 for IST) is provided
      const offsetMs = typeof tzOffset === 'number' ? tzOffset * 60 * 1000 : 0;
      const localNow = new Date(now.getTime() - offsetMs);
      const todayDateStr = localNow.toISOString().split('T')[0];

      const startOfDay = new Date(localNow);
      startOfDay.setUTCHours(0, 0, 0, 0);
      const startOfDayUtc = new Date(startOfDay.getTime() + offsetMs);

      const userOwnershipFilter = or(
        eq(tickets.assigneeId, currentUser.id),
        and(isNull(tickets.assigneeId), eq(tickets.reporterId, currentUser.id))
      );

      // A. Query live tasks for the current user in parallel: Completed Today, In Progress, Blocked
      const [completedTodayRaw, inProgressRaw, blockedRaw, savedStandup] = await Promise.all([
        db.query.tickets.findMany({
          where: and(
            eq(tickets.projectId, proj.id),
            isNull(tickets.deletedAt),
            userOwnershipFilter,
            inArray(tickets.status, ['DONE', 'RESOLVED']),
            gte(tickets.updatedAt, startOfDayUtc)
          ),
          orderBy: desc(tickets.updatedAt),
        }),
        db.query.tickets.findMany({
          where: and(
            eq(tickets.projectId, proj.id),
            isNull(tickets.deletedAt),
            userOwnershipFilter,
            inArray(tickets.status, ['IN_PROGRESS', 'IN_REVIEW'])
          ),
          orderBy: desc(tickets.updatedAt),
        }),
        db.query.tickets.findMany({
          where: and(
            eq(tickets.projectId, proj.id),
            isNull(tickets.deletedAt),
            userOwnershipFilter,
            eq(tickets.status, 'BLOCKED')
          ),
          orderBy: desc(tickets.updatedAt),
        }),
        db.query.dailyStandups.findFirst({
          where: and(
            eq(dailyStandups.userId, currentUser.id),
            eq(dailyStandups.projectId, proj.id),
            eq(dailyStandups.standupDate, todayDateStr)
          ),
        }),
      ]);

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

      const blockedBullets =
        blockedRaw.length > 0
          ? blockedRaw.map((t) => `• [${t.ticketKey}] ${t.title}`).join('\n')
          : '';

      const generatedSummaryMarkdown = `*Daily Status Update — ${localNow.toLocaleDateString(undefined, {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      })}*

*Completed Today:*
${completedBullets}

*In Progress:*
${inProgressBullets}${blockedBullets ? `\n\n*Blockers:*\n${blockedBullets}` : ''}`;

      const mapTask = (t: (typeof completedTodayRaw)[number]) => ({
        key: t.ticketKey,
        title: t.title,
        status: t.status,
        priority: t.priority,
        storyPoints: t.storyPoints,
      });

      return reply.send({
        data: {
          user: {
            id: currentUser.id,
            fullName: currentUser.fullName,
            email: currentUser.email,
          },
          project: {
            id: proj.id,
            key: proj.key,
            name: proj.name,
          },
          date: todayDateStr,
          savedStandup: savedStandup || null,
          autoCompiled: {
            completed: completedTodayRaw.map(mapTask),
            inProgress: inProgressRaw.map(mapTask),
            blocked: blockedRaw.map(mapTask),
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

      const currentUser = await getCurrentUser(request);
      if (!currentUser) {
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
          eq(dailyStandups.userId, currentUser.id),
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
            userId: currentUser.id,
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
          userId: currentUser.id,
          userName: currentUser.fullName,
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
      const normalizedKey = projectKey.toUpperCase();
      const caller = await getCurrentUser(request);

      const proj = await db.query.projects.findFirst({
        where: eq(projects.key, normalizedKey),
        with: {
          assignedTeams: true,
        },
      });

      if (!proj) {
        return reply.status(404).send({ error: 'Project not found' });
      }

      const now = new Date();
      const localToday = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
      const targetDate = date || localToday;

      // Determine team-level visibility for Team Feed
      let callerTeamIds: string[] = [];
      let isAuthority = false;
      if (caller) {
        callerTeamIds = await getUserTeamIds(caller.id);
        const tierInfo = await getUserRoleTier(caller.id, normalizedKey);
        isAuthority =
          tierInfo.tier >= 3 ||
          proj.projectManagerId === caller.id ||
          proj.reviewerId === caller.id;
      }

      const projectAssignedTeamIds = new Set<string>(
        proj.assignedTeams.map((at) => at.teamId)
      );
      if (proj.primaryTeamId) {
        projectAssignedTeamIds.add(proj.primaryTeamId);
      }

      let allowedTeamUserIds: Set<string> | null = null;
      if (!isAuthority && caller) {
        allowedTeamUserIds = new Set<string>([caller.id]);
        if (callerTeamIds.length > 0) {
          const teammates = await db
            .select({ userId: teamMembers.userId })
            .from(teamMembers)
            .where(inArray(teamMembers.teamId, callerTeamIds));
          for (const tm of teammates) {
            allowedTeamUserIds.add(tm.userId);
          }
        }
      }

      const allStandups = await db.query.dailyStandups.findMany({
        where: and(
          eq(dailyStandups.projectId, proj.id),
          eq(dailyStandups.standupDate, targetDate)
        ),
        orderBy: desc(dailyStandups.createdAt),
        with: {
          user: true,
        },
      });

      const standups = allowedTeamUserIds
        ? allStandups.filter((s) => allowedTeamUserIds!.has(s.userId))
        : allStandups;

      // Also surface live completed tasks on targetDate scoped strictly to the respective assigned teams
      const [y, m, d] = targetDate.split('-').map(Number);
      const dayStart = new Date(y, (m || 1) - 1, d || 1, 0, 0, 0, 0);
      const dayEnd = new Date(y, (m || 1) - 1, d || 1, 23, 59, 59, 999);

      const completedOnDateRaw = await db.query.tickets.findMany({
        where: and(
          eq(tickets.projectId, proj.id),
          inArray(tickets.status, ['DONE', 'RESOLVED']),
          gte(tickets.updatedAt, dayStart),
          lt(tickets.updatedAt, dayEnd)
        ),
        with: {
          assignee: {
            columns: { id: true, fullName: true, email: true },
          },
          reporter: {
            columns: { id: true, fullName: true, email: true },
          },
        },
        orderBy: desc(tickets.updatedAt),
      });

      const completedOnDate = completedOnDateRaw.filter((t) => {
        if (!t.teamId) return false;
        if (!isAuthority) {
          return callerTeamIds.includes(t.teamId);
        }
        return projectAssignedTeamIds.size > 0 ? projectAssignedTeamIds.has(t.teamId) : true;
      });

      const submittedUserIds = new Set(standups.map((s) => s.userId));
      const activityByUser = new Map<
        string,
        {
          user: { id: string; fullName: string; email: string };
          completedTasks: Array<{
            key: string;
            title: string;
            status: string;
            priority: string;
            storyPoints: number | null;
          }>;
        }
      >();

      for (const t of completedOnDate) {
        const owner = t.assignee ?? t.reporter;
        if (!owner || submittedUserIds.has(owner.id)) continue;

        let bucket = activityByUser.get(owner.id);
        if (!bucket) {
          bucket = {
            user: {
              id: owner.id,
              fullName: owner.fullName,
              email: owner.email,
            },
            completedTasks: [],
          };
          activityByUser.set(owner.id, bucket);
        }
        bucket.completedTasks.push({
          key: t.ticketKey,
          title: t.title,
          status: t.status,
          priority: t.priority,
          storyPoints: t.storyPoints,
        });
      }

      return reply.send({
        data: {
          projectKey: normalizedKey,
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
          unsubmittedActivity: Array.from(activityByUser.values()),
        },
      });
    }
  );
};
