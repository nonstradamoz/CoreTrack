import { FastifyPluginAsync } from 'fastify';
import { db, sprints, tickets, projects, eq, desc } from '@coretrack/db';
import { getCurrentUser, getUserRoleTier, getUserTeamIds } from '../auth/auth.js';

export const reportRoutes: FastifyPluginAsync = async (fastify) => {
  // 1. Sprint Burndown Chart Data
  fastify.get('/burndown', async (request, reply) => {
    const { sprintId } = request.query as { sprintId?: string };

    if (!sprintId) {
      return reply.status(400).send({ error: 'sprintId query parameter is required' });
    }

    const sprint = await db.query.sprints.findFirst({
      where: eq(sprints.id, sprintId),
    });

    if (!sprint) {
      return reply.status(404).send({ error: 'Sprint not found' });
    }

    const sprintTickets = await db
      .select({
        id: tickets.id,
        ticketKey: tickets.ticketKey,
        status: tickets.status,
        storyPoints: tickets.storyPoints,
        createdAt: tickets.createdAt,
        updatedAt: tickets.updatedAt,
      })
      .from(tickets)
      .where(eq(tickets.sprintId, sprint.id));

    const totalPoints = sprintTickets.reduce((acc, t) => acc + (t.storyPoints || 0), 0);
    const completedPoints = sprintTickets
      .filter((t) => t.status === 'DONE' || t.status === 'RESOLVED')
      .reduce((acc, t) => acc + (t.storyPoints || 0), 0);

    const startDate = sprint.startDate ? new Date(sprint.startDate) : new Date(sprint.createdAt);
    const endDate = sprint.endDate ? new Date(sprint.endDate) : new Date(startDate.getTime() + 14 * 86400000);
    const durationDays = Math.max(1, Math.round((endDate.getTime() - startDate.getTime()) / 86400000));

    // Generate daily ideal vs actual burndown series
    const dataPoints: { day: string; idealPoints: number; remainingPoints: number }[] = [];
    for (let i = 0; i <= durationDays; i++) {
      const dayDate = new Date(startDate.getTime() + i * 86400000);
      const idealPoints = Math.max(0, Math.round(totalPoints - (totalPoints / durationDays) * i));

      // In real telemetry, remainingPoints queries daily point snapshots.
      // For active sprints, interpolate current remaining points to date:
      const dayProgress = Math.min(1, i / durationDays);
      const estimatedBurned = completedPoints * dayProgress;
      const remainingPoints = Math.max(0, Math.round(totalPoints - estimatedBurned));

      dataPoints.push({
        day: dayDate.toLocaleDateString([], { month: 'short', day: 'numeric' }),
        idealPoints,
        remainingPoints,
      });
    }

    return reply.send({
      data: {
        sprint: {
          id: sprint.id,
          name: sprint.name,
          status: sprint.status,
          totalPoints,
          completedPoints,
          remainingPoints: totalPoints - completedPoints,
        },
        dataPoints,
      },
    });
  });

  // 2. Team Historical Velocity Chart Data
  fastify.get('/velocity', async (request, reply) => {
    const { projectKey } = request.query as { projectKey?: string };

    const targetProject = await db.query.projects.findFirst({
      where: projectKey ? eq(projects.key, projectKey) : undefined,
    });

    if (!targetProject) {
      return reply.status(404).send({ error: 'Project not found' });
    }

    const allSprints = await db
      .select()
      .from(sprints)
      .where(eq(sprints.projectId, targetProject.id))
      .orderBy(desc(sprints.createdAt))
      .limit(6);

    const velocityData: {
      sprintId: string;
      sprintName: string;
      status: string;
      committedPoints: number;
      completedPoints: number;
    }[] = [];

    for (const s of allSprints) {
      const sTickets = await db
        .select({
          storyPoints: tickets.storyPoints,
          status: tickets.status,
        })
        .from(tickets)
        .where(eq(tickets.sprintId, s.id));

      const committed = sTickets.reduce((acc, t) => acc + (t.storyPoints || 0), 0);
      const completed = sTickets
        .filter((t) => t.status === 'DONE' || t.status === 'RESOLVED')
        .reduce((acc, t) => acc + (t.storyPoints || 0), 0);

      velocityData.push({
        sprintId: s.id,
        sprintName: s.name,
        status: s.status,
        committedPoints: committed,
        completedPoints: completed,
      });
    }

    // Average velocity
    const completedList = velocityData.map((v) => v.completedPoints);
    const averageVelocity =
      completedList.length > 0
        ? Math.round(completedList.reduce((a, b) => a + b, 0) / completedList.length)
        : 0;

    return reply.send({
      data: {
        projectKey: targetProject.key,
        averageVelocity,
        velocityHistory: velocityData.reverse(),
      },
    });
  });

  // 3. Project Overview, Workload & SLA Compliance Report
  fastify.get('/overview', async (request, reply) => {
    const { projectKey } = request.query as { projectKey?: string };

    const targetProject = await db.query.projects.findFirst({
      where: projectKey ? eq(projects.key, projectKey) : undefined,
    });

    if (!targetProject) {
      return reply.status(404).send({ error: 'Project not found' });
    }

    const allTickets = await db.query.tickets.findMany({
      where: eq(tickets.projectId, targetProject.id),
      with: {
        assignee: { columns: { id: true, fullName: true, email: true } },
        team: { columns: { id: true, name: true, keyPrefix: true } },
      },
    });

    // Respect team task isolation for non-authority users
    let visibleTickets = allTickets;
    const caller = await getCurrentUser(request);
    if (caller) {
      const callerTierInfo = await getUserRoleTier(caller.id, targetProject.key);
      const isProjectAuthority =
        callerTierInfo.tier >= 3 ||
        targetProject.projectManagerId === caller.id ||
        targetProject.reviewerId === caller.id;
      if (!isProjectAuthority) {
        const userTeamIds = await getUserTeamIds(caller.id);
        visibleTickets = allTickets.filter((t) => !t.teamId || userTeamIds.includes(t.teamId));
      }
    }

    const now = Date.now();
    const doneStatuses = new Set(['DONE', 'RESOLVED', 'CLOSED']);
    const totalTickets = visibleTickets.length;
    let completedTickets = 0;
    let inProgressTickets = 0;
    let overdueTickets = 0;
    let breachedSlaCount = 0;
    let slaTrackedCount = 0;

    const statusMap = new Map<string, number>();
    const priorityMap = new Map<string, number>();
    const assigneeMap = new Map<
      string,
      {
        userId: string;
        fullName: string;
        email: string;
        total: number;
        completed: number;
        inProgress: number;
        inReview: number;
        blocked: number;
        overdue: number;
        storyPoints: number;
        slaTracked: number;
        slaBreached: number;
        slaComplianceRate: number;
        tickets: Array<{
          id: string;
          ticketKey: string;
          title: string;
          status: string;
          priority: string;
          storyPoints: number | null;
          dueDate: string | null;
          slaResolutionDueAt: string | null;
          isOverdue: boolean;
          isSlaBreached: boolean;
          updatedAt: string;
        }>;
      }
    >();
    const teamMap = new Map<
      string,
      { teamId: string; name: string; keyPrefix: string; total: number; completed: number; inProgress: number }
    >();

    for (const t of visibleTickets) {
      const st = t.status.toUpperCase();
      const pr = t.priority.toUpperCase();
      const isDone = doneStatuses.has(st);
      const isOverdue = !isDone && t.dueDate ? new Date(t.dueDate).getTime() < now : false;

      if (isDone) completedTickets++;
      if (st === 'IN_PROGRESS' || st === 'IN_REVIEW') inProgressTickets++;
      if (isOverdue) overdueTickets++;

      let isTicketSlaTracked = false;
      let isTicketSlaBreached = false;
      if (t.slaResolutionDueAt) {
        isTicketSlaTracked = true;
        slaTrackedCount++;
        const slaDue = new Date(t.slaResolutionDueAt).getTime();
        const resolvedOrNow = isDone ? new Date(t.updatedAt).getTime() : now;
        if (resolvedOrNow > slaDue) {
          isTicketSlaBreached = true;
          breachedSlaCount++;
        }
      }

      statusMap.set(st, (statusMap.get(st) || 0) + 1);
      priorityMap.set(pr, (priorityMap.get(pr) || 0) + 1);

      const assigneeKey = t.assignee?.id || 'UNASSIGNED';
      if (!assigneeMap.has(assigneeKey)) {
        assigneeMap.set(assigneeKey, {
          userId: assigneeKey,
          fullName: t.assignee?.fullName || 'Unassigned',
          email: t.assignee?.email || '',
          total: 0,
          completed: 0,
          inProgress: 0,
          inReview: 0,
          blocked: 0,
          overdue: 0,
          storyPoints: 0,
          slaTracked: 0,
          slaBreached: 0,
          slaComplianceRate: 100,
          tickets: [],
        });
      }
      const aEntry = assigneeMap.get(assigneeKey)!;
      aEntry.total++;
      if (isDone) aEntry.completed++;
      if (st === 'IN_PROGRESS' || st === 'IN_REVIEW') aEntry.inProgress++;
      if (st === 'IN_REVIEW' || st === 'PENDING_APPROVAL') aEntry.inReview++;
      if (st === 'BLOCKED') aEntry.blocked++;
      if (isOverdue) aEntry.overdue++;
      aEntry.storyPoints += t.storyPoints || 0;
      if (isTicketSlaTracked) {
        aEntry.slaTracked++;
        if (isTicketSlaBreached) aEntry.slaBreached++;
      }
      aEntry.tickets.push({
        id: t.id,
        ticketKey: t.ticketKey,
        title: t.title,
        status: t.status,
        priority: t.priority,
        storyPoints: t.storyPoints ?? null,
        dueDate: t.dueDate ? new Date(t.dueDate).toISOString() : null,
        slaResolutionDueAt: t.slaResolutionDueAt ? new Date(t.slaResolutionDueAt).toISOString() : null,
        isOverdue,
        isSlaBreached: isTicketSlaBreached,
        updatedAt: new Date(t.updatedAt).toISOString(),
      });

      if (t.team) {
        if (!teamMap.has(t.team.id)) {
          teamMap.set(t.team.id, {
            teamId: t.team.id,
            name: t.team.name,
            keyPrefix: t.team.keyPrefix,
            total: 0,
            completed: 0,
            inProgress: 0,
          });
        }
        const tmEntry = teamMap.get(t.team.id)!;
        tmEntry.total++;
        if (isDone) tmEntry.completed++;
        if (st === 'IN_PROGRESS' || st === 'IN_REVIEW') tmEntry.inProgress++;
      }
    }

    const completionRate = totalTickets > 0 ? Math.round((completedTickets / totalTickets) * 100) : 0;
    const slaComplianceRate =
      slaTrackedCount > 0
        ? Math.round(((slaTrackedCount - breachedSlaCount) / slaTrackedCount) * 100)
        : 100;

    const workloadByAssignee = Array.from(assigneeMap.values())
      .map((a) => ({
        ...a,
        slaComplianceRate:
          a.slaTracked > 0 ? Math.round(((a.slaTracked - a.slaBreached) / a.slaTracked) * 100) : 100,
      }))
      .sort((a, b) => b.total - a.total);

    return reply.send({
      data: {
        project: { id: targetProject.id, key: targetProject.key, name: targetProject.name },
        summary: {
          totalTickets,
          completedTickets,
          inProgressTickets,
          overdueTickets,
          completionRate,
          slaComplianceRate,
          breachedSlaCount,
        },
        statusBreakdown: Array.from(statusMap.entries()).map(([status, count]) => ({ status, count })),
        priorityBreakdown: Array.from(priorityMap.entries()).map(([priority, count]) => ({ priority, count })),
        workloadByAssignee,
        teamBreakdown: Array.from(teamMap.values()).sort((a, b) => b.total - a.total),
      },
    });
  });
};
