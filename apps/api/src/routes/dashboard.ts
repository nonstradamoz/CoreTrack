import { FastifyPluginAsync } from 'fastify';
import {
  db,
  projects,
  tickets,
  sprints,
  ticketDependencies,
  ticketApprovals,
  users,
  eq,
  desc,
  sql,
} from '@coretrack/db';

export const dashboardRoutes: FastifyPluginAsync = async (fastify) => {
  // GET /api/v1/dashboard/portfolio
  fastify.get('/portfolio', async (_request, reply) => {
    // 1. Fetch All Projects
    const allProjects = await db.select().from(projects).orderBy(projects.name);

    // 2. Fetch All Tickets
    const allTickets = await db.select().from(tickets);

    // 3. Fetch All Sprints
    const allSprints = await db.select().from(sprints);

    // 4. Fetch All Dependencies
    const allDeps = await db.select().from(ticketDependencies);

    // 5. Fetch All Users
    const allUsers = await db.select().from(users);

    // Compute Summary KPIs
    const totalProjects = allProjects.length;
    const totalTicketsCount = allTickets.length;
    const completedTicketsCount = allTickets.filter(
      (t) => t.status === 'DONE' || t.status === 'RESOLVED'
    ).length;
    const totalStoryPoints = allTickets.reduce((sum, t) => sum + (t.storyPoints || 0), 0);
    const completedStoryPoints = allTickets
      .filter((t) => t.status === 'DONE' || t.status === 'RESOLVED')
      .reduce((sum, t) => sum + (t.storyPoints || 0), 0);

    const now = new Date();
    const fourHoursFromNow = new Date(now.getTime() + 4 * 3600 * 1000);

    const slaAtRiskTickets = allTickets.filter((t) => {
      if (t.status === 'DONE' || t.status === 'RESOLVED' || t.status === 'CANCELED') return false;
      if (!t.slaResolutionDueAt) return false;
      const dueDate = new Date(t.slaResolutionDueAt);
      return dueDate <= fourHoursFromNow;
    });

    const pendingApprovalsCount = allTickets.filter(
      (t) => t.status === 'PENDING_APPROVAL'
    ).length;

    // Build Project Health Cards
    const projectsHealth = allProjects.map((proj) => {
      const projTickets = allTickets.filter((t) => t.projectId === proj.id);
      const projCompleted = projTickets.filter(
        (t) => t.status === 'DONE' || t.status === 'RESOLVED'
      );
      const completionPercentage =
        projTickets.length > 0
          ? Math.round((projCompleted.length / projTickets.length) * 100)
          : 0;

      const activeSprint = allSprints.find(
        (s) => s.projectId === proj.id && s.status === 'ACTIVE'
      );

      const projSlaBreached = projTickets.some((t) => {
        if (t.status === 'DONE' || t.status === 'RESOLVED') return false;
        return t.slaResolutionDueAt && new Date(t.slaResolutionDueAt) < now;
      });

      const healthStatus = projSlaBreached
        ? 'AT_RISK'
        : completionPercentage >= 70 || projTickets.length === 0
          ? 'ON_TRACK'
          : 'IN_PROGRESS';

      return {
        id: proj.id,
        key: proj.key,
        name: proj.name,
        description: proj.description,
        projectType: proj.projectType,
        privacyTier: proj.privacyTier,
        totalTickets: projTickets.length,
        completedTickets: projCompleted.length,
        completionPercentage,
        activeSprint: activeSprint
          ? {
              id: activeSprint.id,
              name: activeSprint.name,
              status: activeSprint.status,
            }
          : null,
        healthStatus,
      };
    });

    // Cross-Project Dependencies (source and target belong to different projects)
    const ticketIdMap = new Map(allTickets.map((t) => [t.id, t]));
    const crossProjectBlockers = allDeps
      .map((dep) => {
        const sourceTicket = ticketIdMap.get(dep.sourceTicketId);
        const targetTicket = dep.targetTicketId ? ticketIdMap.get(dep.targetTicketId) : null;
        if (!sourceTicket || !targetTicket) return null;

        const sourceProjectKey = sourceTicket.ticketKey.split('-')[0];
        const targetProjectKey = targetTicket.ticketKey.split('-')[0];

        return {
          id: dep.id,
          dependencyType: dep.dependencyType,
          isCrossProject: sourceProjectKey !== targetProjectKey,
          source: {
            ticketKey: sourceTicket.ticketKey,
            title: sourceTicket.title,
            status: sourceTicket.status,
            projectKey: sourceProjectKey,
          },
          target: {
            ticketKey: targetTicket.ticketKey,
            title: targetTicket.title,
            status: targetTicket.status,
            projectKey: targetProjectKey,
          },
        };
      })
      .filter((dep): dep is NonNullable<typeof dep> => dep !== null)
      .filter((dep) => dep.dependencyType === 'BLOCKS');

    // Critical Risk Tickets (SLA at risk or pending approval)
    const criticalRiskTickets = allTickets
      .filter((t) => {
        if (t.status === 'DONE' || t.status === 'RESOLVED' || t.status === 'CANCELED') return false;
        const isSlaRisk =
          t.slaResolutionDueAt && new Date(t.slaResolutionDueAt) <= fourHoursFromNow;
        const isApprovalPending = t.status === 'PENDING_APPROVAL';
        return isSlaRisk || isApprovalPending;
      })
      .slice(0, 10)
      .map((t) => ({
        id: t.id,
        ticketKey: t.ticketKey,
        title: t.title,
        status: t.status,
        priority: t.priority,
        ticketType: t.ticketType,
        slaResolutionDueAt: t.slaResolutionDueAt,
        isSlaPaused: t.isSlaPaused,
      }));

    // Team Workload Distribution
    const teamWorkload = allUsers.map((user) => {
      const userTickets = allTickets.filter((t) => t.assigneeId === user.id);
      const openTickets = userTickets.filter(
        (t) => t.status !== 'DONE' && t.status !== 'RESOLVED' && t.status !== 'CANCELED'
      );
      const points = userTickets.reduce((sum, t) => sum + (t.storyPoints || 0), 0);

      return {
        userId: user.id,
        fullName: user.fullName,
        email: user.email,
        totalAssigned: userTickets.length,
        openAssigned: openTickets.length,
        allocatedPoints: points,
      };
    });

    return reply.send({
      data: {
        summary: {
          totalProjects,
          totalTicketsCount,
          completedTicketsCount,
          completionRate:
            totalTicketsCount > 0
              ? Math.round((completedTicketsCount / totalTicketsCount) * 100)
              : 0,
          totalStoryPoints,
          completedStoryPoints,
          slaAtRiskCount: slaAtRiskTickets.length,
          pendingApprovalsCount,
        },
        projectsHealth,
        crossProjectBlockers,
        criticalRiskTickets,
        teamWorkload,
      },
    });
  });
};
