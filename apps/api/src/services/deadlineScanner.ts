import {
  db,
  tickets,
  ticketComments,
  projects,
  sprints,
  users,
  teams,
  teamMembers,
  projectMembers,
  roles,
  eq,
  and,
  or,
  isNull,
  notInArray,
  lte,
  gte,
  lt,
  sql,
} from '@coretrack/db';
import { Permissions, hasPermission } from '@coretrack/shared';
import {
  sendSprintPromotedNotification,
  sendTaskOverdueEscalationNotification,
  sendProjectOverdueEscalationNotification,
} from './email.js';
import { broadcastToProject } from '../ws.js';

export interface DeadlineScanSummary {
  timestamp: string;
  tasksPromotedToSprint: number;
  overdueTasksEscalated: number;
  overdueProjectsEscalated: number;
  totalEmailsDispatched: number;
  details: {
    promotedTickets: string[];
    escalatedTickets: string[];
    escalatedProjects: string[];
  };
}

/**
 * Runs the automated deadline & escalation scanner.
 * 1. Backlog tasks with deadline approaching (<= 3 days) -> auto-promoted into active/planning sprint + notification to assignee, PM, TL.
 * 2. Overdue unfinished tasks -> escalated to PM and TL (with 24h cooldown).
 * 3. Overdue unfinished projects -> escalated to PM, Reviewer, and Org Admins (with 24h cooldown).
 */
export async function runDeadlineAndEscalationScan(): Promise<DeadlineScanSummary> {
  const now = new Date();
  const threeDaysFromNow = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000);
  const twentyFourHoursAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

  const summary: DeadlineScanSummary = {
    timestamp: now.toISOString(),
    tasksPromotedToSprint: 0,
    overdueTasksEscalated: 0,
    overdueProjectsEscalated: 0,
    totalEmailsDispatched: 0,
    details: {
      promotedTickets: [],
      escalatedTickets: [],
      escalatedProjects: [],
    },
  };

  // =========================================================================
  // 1. AUTO-SPRINT PROMOTION: Backlog tasks with deadline <= 3 days (72 hours)
  // =========================================================================
  const approachingBacklogTickets = await db.query.tickets.findMany({
    where: and(
      isNull(tickets.sprintId),
      notInArray(tickets.status, ['DONE', 'CANCELED', 'RESOLVED']),
      sql`${tickets.dueDate} IS NOT NULL`,
      lte(tickets.dueDate, threeDaysFromNow),
      gte(tickets.dueDate, now),
      or(
        isNull(tickets.lastApproachingNotifiedAt),
        lt(tickets.lastApproachingNotifiedAt, twentyFourHoursAgo)
      )
    ),
    with: {
      project: true,
      assignee: true,
    },
  });

  for (const ticket of approachingBacklogTickets) {
    const project = ticket.project;
    if (!project) continue;

    // A. Find currently ACTIVE sprint
    let targetSprint = await db.query.sprints.findFirst({
      where: and(eq(sprints.projectId, project.id), eq(sprints.status, 'ACTIVE')),
      orderBy: (s, { desc }) => [desc(s.createdAt)],
    });

    // B. Fallback to latest PLANNING sprint
    if (!targetSprint) {
      targetSprint = await db.query.sprints.findFirst({
        where: and(eq(sprints.projectId, project.id), eq(sprints.status, 'PLANNING')),
        orderBy: (s, { desc }) => [desc(s.createdAt)],
      });
    }

    // C. Fallback: Auto-create a rapid deadline focus sprint if none exists
    if (!targetSprint) {
      const sprintEndDate = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000);
      const [newSprint] = await db
        .insert(sprints)
        .values({
          projectId: project.id,
          name: `Sprint - Deadline Focus`,
          goal: 'Automated iteration activated for approaching backlog deadlines',
          status: 'ACTIVE',
          startDate: now,
          endDate: sprintEndDate,
        })
        .returning();
      targetSprint = newSprint;
    }

    // Move ticket into sprint
    const newStatus = ticket.status === 'BACKLOG' ? 'TODO' : ticket.status;
    await db
      .update(tickets)
      .set({
        sprintId: targetSprint.id,
        status: newStatus,
        lastApproachingNotifiedAt: now,
        updatedAt: now,
      })
      .where(eq(tickets.id, ticket.id));

    summary.tasksPromotedToSprint++;
    summary.details.promotedTickets.push(ticket.ticketKey);

    // Calculate remaining days
    const msDiff = new Date(ticket.dueDate!).getTime() - now.getTime();
    const daysRemaining = Math.max(1, Math.ceil(msDiff / (1000 * 60 * 60 * 24)));

    // Gather recipients: Task Assignee + Project Manager + Team Leads
    const recipientMap = new Map<string, { email: string; fullName: string }>();

    if (ticket.assignee) {
      recipientMap.set(ticket.assignee.id, { email: ticket.assignee.email, fullName: ticket.assignee.fullName });
    }

    if (project.projectManagerId) {
      const pm = await db.query.users.findFirst({ where: eq(users.id, project.projectManagerId) });
      if (pm) recipientMap.set(pm.id, { email: pm.email, fullName: pm.fullName });
    }

    // Find Team Leads for project
    if (project.primaryTeamId) {
      const team = await db.query.teams.findFirst({
        where: eq(teams.id, project.primaryTeamId),
        with: { lead: true },
      });
      if (team?.lead) {
        recipientMap.set(team.lead.id, { email: team.lead.email, fullName: team.lead.fullName });
      }
    }

    for (const recipient of recipientMap.values()) {
      await sendSprintPromotedNotification({
        recipient,
        ticket: {
          id: ticket.id,
          ticketKey: ticket.ticketKey,
          title: ticket.title,
          dueDate: ticket.dueDate!,
        },
        project: {
          id: project.id,
          key: project.key,
          name: project.name,
        },
        sprintName: targetSprint.name,
        daysRemaining,
      });
      summary.totalEmailsDispatched++;
    }
  }

  // =========================================================================
  // 2. OVERDUE TASK & SLA BREACH ESCALATION: Unfinished tasks past dueDate or SLA (24h cooldown)
  // =========================================================================
  const overdueTickets = await db.query.tickets.findMany({
    where: and(
      notInArray(tickets.status, ['DONE', 'CANCELED', 'RESOLVED']),
      or(
        and(sql`${tickets.dueDate} IS NOT NULL`, lt(tickets.dueDate, now)),
        and(
          eq(tickets.isSlaPaused, false),
          sql`${tickets.slaResolutionDueAt} IS NOT NULL`,
          lt(tickets.slaResolutionDueAt, now)
        )
      ),
      or(
        isNull(tickets.lastOverdueNotifiedAt),
        lt(tickets.lastOverdueNotifiedAt, twentyFourHoursAgo)
      )
    ),
    with: {
      project: true,
      assignee: true,
    },
  });

  for (const ticket of overdueTickets) {
    const project = ticket.project;
    if (!project) continue;

    // 1. Full Escalation: Auto-bump priority to URGENT
    await db
      .update(tickets)
      .set({
        priority: 'URGENT',
        lastOverdueNotifiedAt: now,
        updatedAt: now,
      })
      .where(eq(tickets.id, ticket.id));

    summary.overdueTasksEscalated++;
    summary.details.escalatedTickets.push(ticket.ticketKey);

    // 2. Post automated internal audit comment
    const targetDeadline = ticket.dueDate || ticket.slaResolutionDueAt || now;
    const msOverdue = now.getTime() - new Date(targetDeadline).getTime();
    const daysOverdue = Math.max(1, Math.ceil(msOverdue / (1000 * 60 * 60 * 24)));
    const systemAuthor =
      (await db.query.users.findFirst({
        where: (u, { eq: eqU }) => eqU(u.email, 'admin@coretrack.internal'),
      })) || (await db.query.users.findFirst());

    if (systemAuthor) {
      await db.insert(ticketComments).values({
        ticketId: ticket.id,
        authorId: systemAuthor.id,
        visibilityScope: 'INTERNAL_ONLY',
        body: `⚠️ **Automated Escalation**: This task is overdue by ${daysOverdue} day${daysOverdue > 1 ? 's' : ''}. Priority auto-escalated to **URGENT** and notification dispatched to Project Manager & Assignee.`,
      });
    }

    // 3. Broadcast real-time WebSocket update
    broadcastToProject(project.key, {
      type: 'TICKET_UPDATED',
      payload: {
        id: ticket.id,
        ticketKey: ticket.ticketKey,
        priority: 'URGENT',
        status: ticket.status,
        lastOverdueNotifiedAt: now,
      },
    });

    // Hierarchical Escalation: PM + Team Leads
    const recipientMap = new Map<string, { email: string; fullName: string }>();

    if (project.projectManagerId) {
      const pm = await db.query.users.findFirst({ where: eq(users.id, project.projectManagerId) });
      if (pm) recipientMap.set(pm.id, { email: pm.email, fullName: pm.fullName });
    }

    if (project.primaryTeamId) {
      const team = await db.query.teams.findFirst({
        where: eq(teams.id, project.primaryTeamId),
        with: { lead: true },
      });
      if (team?.lead) {
        recipientMap.set(team.lead.id, { email: team.lead.email, fullName: team.lead.fullName });
      }
    }

    // Also include task assignee in notification so they know it has escalated
    if (ticket.assignee) {
      recipientMap.set(ticket.assignee.id, { email: ticket.assignee.email, fullName: ticket.assignee.fullName });
    }

    for (const recipient of recipientMap.values()) {
      await sendTaskOverdueEscalationNotification({
        recipient,
        ticket: {
          id: ticket.id,
          ticketKey: ticket.ticketKey,
          title: ticket.title,
          status: ticket.status,
          priority: ticket.priority,
          dueDate: targetDeadline,
        },
        project: {
          id: project.id,
          key: project.key,
          name: project.name,
        },
        assigneeName: ticket.assignee?.fullName || 'Unassigned',
      });
      summary.totalEmailsDispatched++;
    }
  }

  // =========================================================================
  // 3. OVERDUE PROJECT ESCALATION: Unfinished projects past deadline (24h cooldown)
  // =========================================================================
  const overdueProjects = await db.query.projects.findMany({
    where: and(
      notInArray(projects.status, ['COMPLETED', 'ARCHIVED']),
      sql`${projects.deadline} IS NOT NULL`,
      lt(projects.deadline, now),
      or(
        isNull(projects.lastOverdueNotifiedAt),
        lt(projects.lastOverdueNotifiedAt, twentyFourHoursAgo)
      )
    ),
    with: {
      projectManager: true,
      reviewer: true,
    },
  });

  if (overdueProjects.length > 0) {
    // Find all Organization Admins & Super Admins
    const allUsers = await db.select().from(users);
    const orgAdmins = allUsers.filter((u) => hasPermission(u.globalPermissions, Permissions.ORG_ADMIN));

    for (const project of overdueProjects) {
      await db
        .update(projects)
        .set({
          status: 'OVERDUE',
          lastOverdueNotifiedAt: now,
          updatedAt: now,
        })
        .where(eq(projects.id, project.id));

      summary.overdueProjectsEscalated++;
      summary.details.escalatedProjects.push(project.key);

      // Count unfinished tickets in project
      const unfinishedTickets = await db.query.tickets.findMany({
        where: and(
          eq(tickets.projectId, project.id),
          notInArray(tickets.status, ['DONE', 'CANCELED', 'RESOLVED'])
        ),
      });

      // Hierarchical Escalation: PM + Reviewer + Org Admins
      const recipientMap = new Map<string, { email: string; fullName: string }>();

      if (project.projectManager) {
        recipientMap.set(project.projectManager.id, {
          email: project.projectManager.email,
          fullName: project.projectManager.fullName,
        });
      }

      if (project.reviewer) {
        recipientMap.set(project.reviewer.id, {
          email: project.reviewer.email,
          fullName: project.reviewer.fullName,
        });
      }

      for (const admin of orgAdmins) {
        recipientMap.set(admin.id, {
          email: admin.email,
          fullName: admin.fullName,
        });
      }

      for (const recipient of recipientMap.values()) {
        await sendProjectOverdueEscalationNotification({
          recipient,
          project: {
            id: project.id,
            key: project.key,
            name: project.name,
            deadline: project.deadline!,
          },
          pmName: project.projectManager?.fullName || undefined,
          unfinishedTicketsCount: unfinishedTickets.length,
        });
        summary.totalEmailsDispatched++;
      }
    }
  }

  schedulerState.lastRunAt = now.toISOString();
  schedulerState.lastSummary = summary;
  if (schedulerState.isActive) {
    schedulerState.nextRunAt = new Date(Date.now() + schedulerState.intervalMinutes * 60 * 1000).toISOString();
  }

  return summary;
}

export interface SchedulerState {
  isActive: boolean;
  intervalMinutes: number;
  lastRunAt: string | null;
  nextRunAt: string | null;
  lastSummary: DeadlineScanSummary | null;
}

let schedulerState: SchedulerState = {
  isActive: false,
  intervalMinutes: 60,
  lastRunAt: null,
  nextRunAt: null,
  lastSummary: null,
};

// Background recurring timer handle
let scannerIntervalHandle: NodeJS.Timeout | null = null;

export function getSchedulerStatus(): SchedulerState {
  return { ...schedulerState };
}

export function startDeadlineScheduler(intervalMs = 60 * 60 * 1000) {
  if (scannerIntervalHandle) {
    clearInterval(scannerIntervalHandle);
    scannerIntervalHandle = null;
  }
  const intervalMinutes = Math.max(1, Math.round(intervalMs / (60 * 1000)));
  schedulerState.isActive = true;
  schedulerState.intervalMinutes = intervalMinutes;
  schedulerState.nextRunAt = new Date(Date.now() + intervalMs).toISOString();

  console.log(`[Deadline Scheduler] Starting recurring background deadline scanner (every ${intervalMinutes}m)`);
  scannerIntervalHandle = setInterval(async () => {
    try {
      const summary = await runDeadlineAndEscalationScan();
      schedulerState.lastRunAt = new Date().toISOString();
      schedulerState.lastSummary = summary;
      schedulerState.nextRunAt = new Date(Date.now() + intervalMs).toISOString();
    } catch (err) {
      console.error('[Deadline Scheduler] Scan error:', err);
    }
  }, intervalMs);
}

export function stopDeadlineScheduler() {
  if (scannerIntervalHandle) {
    clearInterval(scannerIntervalHandle);
    scannerIntervalHandle = null;
  }
  schedulerState.isActive = false;
  schedulerState.nextRunAt = null;
  console.log('[Deadline Scheduler] Background recurring deadline scanner paused.');
}

export async function updateSchedulerConfig(config: {
  isActive?: boolean;
  intervalMinutes?: number;
  runImmediately?: boolean;
}): Promise<SchedulerState> {
  if (config.intervalMinutes !== undefined && config.intervalMinutes >= 1) {
    schedulerState.intervalMinutes = config.intervalMinutes;
  }

  if (config.isActive !== undefined) {
    if (config.isActive) {
      stopDeadlineScheduler();
      startDeadlineScheduler(schedulerState.intervalMinutes * 60 * 1000);
    } else {
      stopDeadlineScheduler();
    }
  } else if (schedulerState.isActive) {
    // Restart active timer with updated interval
    stopDeadlineScheduler();
    startDeadlineScheduler(schedulerState.intervalMinutes * 60 * 1000);
  }

  if (config.runImmediately) {
    const summary = await runDeadlineAndEscalationScan();
    schedulerState.lastRunAt = new Date().toISOString();
    schedulerState.lastSummary = summary;
  }

  return getSchedulerStatus();
}
