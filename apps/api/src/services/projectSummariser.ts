import { db, projects, ticketDependencies, inArray, or, eq } from '@coretrack/db';
import { getUserRoleTier, getUserTeamIds } from '../auth/auth.js';

const COMPLETED_STATUSES = new Set(['DONE', 'RESOLVED', 'CLOSED']);

const PRIORITY_RANK: Record<string, number> = {
  CRITICAL: 0,
  URGENT: 0,
  HIGH: 1,
  MEDIUM: 2,
  LOW: 3,
};

export interface SummaryTaskItem {
  id: string;
  ticketKey: string;
  title: string;
  status: string;
  priority: string;
  dueDate: string | null;
  updatedAt: string;
  assigneeName: string | null;
  teamName: string | null;
}

export interface SummaryBlockerItem {
  id: string;
  ticketKey: string;
  title: string;
  status: string;
  priority: string;
  dueDate: string | null;
  assigneeName: string | null;
  teamName: string | null;
  blockerReasons: Array<'EXPLICIT_BLOCKED' | 'DEPENDENCY' | 'OVERDUE'>;
  blockerDetails: string[];
}

export interface SummaryMilestoneItem {
  id: string;
  title: string;
  status: string;
  dueDate: string | null;
}

export interface ProjectSummaryPayload {
  projectId: string;
  projectKey: string;
  projectName: string;
  projectStatus: string;
  deadline: string | null;
  generatedAt: string;
  healthStatus: 'ON_TRACK' | 'AT_RISK' | 'CRITICAL' | 'COMPLETED';
  headline: string;
  stats: {
    totalTasks: number;
    completedCount: number;
    inProgressCount: number;
    plannedCount: number;
    blockedCount: number;
    overdueCount: number;
    dependencyBlockerCount: number;
    completionPercentage: number;
  };
  completed: {
    totalCount: number;
    recentCount: number;
    recentHighlights: SummaryTaskItem[];
  };
  blockers: {
    totalCount: number;
    explicitBlockedCount: number;
    dependencyCount: number;
    overdueCount: number;
    items: SummaryBlockerItem[];
  };
  planned: {
    inProgressCount: number;
    todoCount: number;
    upcomingMilestones: SummaryMilestoneItem[];
    items: SummaryTaskItem[];
  };
  ai: {
    configured: boolean;
    narrative: string | null;
    provider: 'gemini' | 'openai' | null;
    generatedAt: string | null;
  };
}

interface CachedAiNarrative {
  narrative: string;
  provider: 'gemini' | 'openai';
  generatedAt: string;
  expiresAt: number;
  lastRequestedAt: number;
}

const AI_CACHE_TTL_MS = 30 * 60 * 1000; // 30 minutes
const AI_REGENERATE_COOLDOWN_MS = 20 * 1000; // 20 seconds
const aiNarrativeCache = new Map<string, CachedAiNarrative>();

export class RateLimitError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RateLimitError';
  }
}

function getConfiguredAiProvider(): 'gemini' | 'openai' | null {
  if (process.env.GEMINI_API_KEY?.trim()) return 'gemini';
  if (process.env.OPENAI_API_KEY?.trim()) return 'openai';
  return null;
}

function buildAiPrompt(summary: Omit<ProjectSummaryPayload, 'ai'>): string {
  const completedLines =
    summary.completed.recentHighlights
      .slice(0, 5)
      .map((t) => `- [${t.ticketKey}] ${t.title} (${t.priority})`)
      .join('\n') || 'None in the last 7 days.';

  const blockerLines =
    summary.blockers.items
      .slice(0, 6)
      .map((b) => `- [${b.ticketKey}] ${b.title}: ${b.blockerDetails.join('; ')}`)
      .join('\n') || 'None.';

  const plannedLines =
    summary.planned.items
      .slice(0, 6)
      .map(
        (t) =>
          `- [${t.ticketKey}] ${t.title} (${t.status}, ${t.priority}${t.dueDate ? `, due ${t.dueDate.slice(0, 10)}` : ''})`
      )
      .join('\n') || 'None.';

  return [
    `Summarize the current state of project "${summary.projectName}" (${summary.projectKey}) in 3-4 concise sentences for a stakeholder checking in.`,
    `Cover: (1) progress & completed work, (2) active blockers/risks, and (3) what is planned next. Be direct, factual, and avoid fluff.`,
    ``,
    `Metrics: ${summary.stats.completedCount}/${summary.stats.totalTasks} tasks completed (${summary.stats.completionPercentage}%), ${summary.stats.inProgressCount} in progress, ${summary.stats.plannedCount} planned, ${summary.blockers.totalCount} blockers (${summary.blockers.explicitBlockedCount} blocked, ${summary.blockers.dependencyCount} dependency-blocked, ${summary.blockers.overdueCount} overdue). Health: ${summary.healthStatus}.`,
    ``,
    `Recently Completed (last 7 days):`,
    completedLines,
    ``,
    `Blockers Present:`,
    blockerLines,
    ``,
    `Planned / Next Up:`,
    plannedLines,
  ].join('\n');
}

async function generateAiNarrative(
  summary: Omit<ProjectSummaryPayload, 'ai'>,
  provider: 'gemini' | 'openai'
): Promise<string | null> {
  const prompt = buildAiPrompt(summary);

  try {
    if (provider === 'gemini') {
      const apiKey = process.env.GEMINI_API_KEY!.trim();
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${encodeURIComponent(apiKey)}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: { temperature: 0.3, maxOutputTokens: 260 },
          }),
        }
      );
      if (!res.ok) return null;
      const data = (await res.json()) as {
        candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
      };
      const text = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
      return text || null;
    }

    const apiKey = process.env.OPENAI_API_KEY!.trim();
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content: 'You write concise, factual project status summaries based strictly on the provided metrics and tasks.',
          },
          { role: 'user', content: prompt },
        ],
        temperature: 0.3,
        max_tokens: 260,
      }),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const text = data.choices?.[0]?.message?.content?.trim();
    return text || null;
  } catch {
    return null;
  }
}

function buildDeterministicHeadline(
  stats: ProjectSummaryPayload['stats'],
  blockers: ProjectSummaryPayload['blockers']
): string {
  if (stats.totalTasks === 0) {
    return 'No tasks have been created for this project yet.';
  }

  const parts: string[] = [
    `${stats.completionPercentage}% complete (${stats.completedCount}/${stats.totalTasks} tasks done)`,
  ];

  if (blockers.totalCount > 0) {
    parts.push(
      `${blockers.totalCount} ${blockers.totalCount === 1 ? 'blocker needs' : 'blockers need'} attention`
    );
  } else {
    parts.push('no active blockers');
  }

  const openTotal = stats.inProgressCount + stats.plannedCount;
  if (openTotal > 0) {
    parts.push(`${stats.inProgressCount} in progress and ${stats.plannedCount} planned`);
  }

  return `${parts.join(' · ')}.`;
}

export async function getProjectSummary(
  projectKey: string,
  callerId?: string | null,
  options: { regenerate?: boolean } = {}
): Promise<ProjectSummaryPayload | null> {
  const normalizedKey = projectKey.toUpperCase();

  const project = await db.query.projects.findFirst({
    where: eq(projects.key, normalizedKey),
    with: {
      milestones: {
        orderBy: (m, { asc }) => [asc(m.dueDate)],
      },
      tickets: {
        where: (t, { isNull }) => isNull(t.deletedAt),
        columns: {
          id: true,
          ticketKey: true,
          title: true,
          status: true,
          priority: true,
          assigneeId: true,
          teamId: true,
          dueDate: true,
          createdAt: true,
          updatedAt: true,
        },
        with: {
          assignee: {
            columns: {
              id: true,
              fullName: true,
            },
          },
          team: {
            columns: {
              id: true,
              name: true,
            },
          },
        },
      },
    },
  });

  if (!project) return null;

  // Enforce the same team-level task isolation as GET /projects/:key
  let visibleTickets = project.tickets;
  if (callerId) {
    const callerTierInfo = await getUserRoleTier(callerId, normalizedKey);
    const isProjectAuthority =
      callerTierInfo.tier >= 3 ||
      project.projectManagerId === callerId ||
      project.reviewerId === callerId;

    if (!isProjectAuthority) {
      const userTeamIds = await getUserTeamIds(callerId);
      visibleTickets = project.tickets.filter(
        (t) => !t.teamId || userTeamIds.includes(t.teamId)
      );
    }
  }

  const now = Date.now();
  const sevenDaysAgo = now - 7 * 24 * 60 * 60 * 1000;

  const ticketMap = new Map(visibleTickets.map((t) => [t.id, t]));
  const visibleTicketIds = visibleTickets.map((t) => t.id);

  // Fetch dependencies involving visible project tickets
  const deps =
    visibleTicketIds.length > 0
      ? await db
          .select()
          .from(ticketDependencies)
          .where(
            or(
              inArray(ticketDependencies.sourceTicketId, visibleTicketIds),
              inArray(ticketDependencies.targetTicketId, visibleTicketIds)
            )
          )
      : [];

  const completedTickets: typeof visibleTickets = [];
  const inProgressTickets: typeof visibleTickets = [];
  const plannedOnlyTickets: typeof visibleTickets = [];
  const blockerMap = new Map<string, SummaryBlockerItem>();

  const ensureBlockerEntry = (t: (typeof visibleTickets)[number]): SummaryBlockerItem => {
    let existing = blockerMap.get(t.id);
    if (!existing) {
      existing = {
        id: t.id,
        ticketKey: t.ticketKey,
        title: t.title,
        status: t.status,
        priority: t.priority,
        dueDate: t.dueDate ? t.dueDate.toISOString() : null,
        assigneeName: t.assignee?.fullName ?? null,
        teamName: t.team?.name ?? null,
        blockerReasons: [],
        blockerDetails: [],
      };
      blockerMap.set(t.id, existing);
    }
    return existing;
  };

  let explicitBlockedCount = 0;
  let overdueCount = 0;

  for (const t of visibleTickets) {
    const status = t.status.toUpperCase();
    if (status === 'CANCELED' || status === 'CANCELLED') {
      continue;
    }

    const isCompleted = COMPLETED_STATUSES.has(status);

    if (isCompleted) {
      completedTickets.push(t);
      continue;
    }

    if (status === 'BLOCKED') {
      explicitBlockedCount++;
      const entry = ensureBlockerEntry(t);
      if (!entry.blockerReasons.includes('EXPLICIT_BLOCKED')) {
        entry.blockerReasons.push('EXPLICIT_BLOCKED');
        entry.blockerDetails.push('Marked as BLOCKED');
      }
    } else if (status === 'IN_PROGRESS' || status === 'IN_REVIEW') {
      inProgressTickets.push(t);
    } else {
      plannedOnlyTickets.push(t);
    }

    if (t.dueDate && new Date(t.dueDate).getTime() < now) {
      overdueCount++;
      const entry = ensureBlockerEntry(t);
      if (!entry.blockerReasons.includes('OVERDUE')) {
        entry.blockerReasons.push('OVERDUE');
        const daysOverdue = Math.max(
          1,
          Math.ceil((now - new Date(t.dueDate).getTime()) / (1000 * 60 * 60 * 24))
        );
        entry.blockerDetails.push(`Overdue by ${daysOverdue}d`);
      }
    }
  }

  // Evaluate unresolved dependency blockers
  const dependencyBlockedTicketIds = new Set<string>();
  for (const dep of deps) {
    if (dep.dependencyType === 'BLOCKS' && dep.targetTicketId && ticketMap.has(dep.targetTicketId)) {
      const target = ticketMap.get(dep.targetTicketId)!;
      if (!COMPLETED_STATUSES.has(target.status.toUpperCase())) {
        const source = ticketMap.get(dep.sourceTicketId);
        if (!source || !COMPLETED_STATUSES.has(source.status.toUpperCase())) {
          dependencyBlockedTicketIds.add(target.id);
          const entry = ensureBlockerEntry(target);
          if (!entry.blockerReasons.includes('DEPENDENCY')) {
            entry.blockerReasons.push('DEPENDENCY');
          }
          entry.blockerDetails.push(
            source
              ? `Blocked by ${source.ticketKey}`
              : dep.externalText
                ? `Blocked by: ${dep.externalText}`
                : 'Blocked by external dependency'
          );
        }
      }
    } else if (dep.dependencyType === 'BLOCKED_BY' && ticketMap.has(dep.sourceTicketId)) {
      const blocked = ticketMap.get(dep.sourceTicketId)!;
      if (!COMPLETED_STATUSES.has(blocked.status.toUpperCase())) {
        const blocker = dep.targetTicketId ? ticketMap.get(dep.targetTicketId) : null;
        if (!blocker || !COMPLETED_STATUSES.has(blocker.status.toUpperCase())) {
          dependencyBlockedTicketIds.add(blocked.id);
          const entry = ensureBlockerEntry(blocked);
          if (!entry.blockerReasons.includes('DEPENDENCY')) {
            entry.blockerReasons.push('DEPENDENCY');
          }
          entry.blockerDetails.push(
            blocker
              ? `Blocked by ${blocker.ticketKey}`
              : dep.externalText
                ? `Blocked by: ${dep.externalText}`
                : 'Blocked by external dependency'
          );
        }
      }
    }
  }

  const toSummaryTaskItem = (t: (typeof visibleTickets)[number]): SummaryTaskItem => ({
    id: t.id,
    ticketKey: t.ticketKey,
    title: t.title,
    status: t.status,
    priority: t.priority,
    dueDate: t.dueDate ? t.dueDate.toISOString() : null,
    updatedAt: t.updatedAt.toISOString(),
    assigneeName: t.assignee?.fullName ?? null,
    teamName: t.team?.name ?? null,
  });

  // Recently completed (last 7 days), fallback to latest completed if none in last 7d
  const recentlyCompleted = completedTickets
    .filter((t) => new Date(t.updatedAt).getTime() >= sevenDaysAgo)
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());

  const recentHighlights = (
    recentlyCompleted.length > 0
      ? recentlyCompleted
      : [...completedTickets].sort(
          (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
        )
  )
    .slice(0, 8)
    .map(toSummaryTaskItem);

  // Blockers sorted by severity: explicit blocked > dependency > overdue, then priority
  const blockerItems = Array.from(blockerMap.values()).sort((a, b) => {
    const score = (item: SummaryBlockerItem) =>
      (item.blockerReasons.includes('EXPLICIT_BLOCKED') ? 0 : 10) +
      (item.blockerReasons.includes('DEPENDENCY') ? 0 : 5) +
      (PRIORITY_RANK[item.priority.toUpperCase()] ?? 4);
    return score(a) - score(b);
  });

  // Planned & In-Progress sorted by status (IN_PROGRESS first), dueDate asc, priority
  const plannedItems = [...inProgressTickets, ...plannedOnlyTickets]
    .sort((a, b) => {
      const aInProg = a.status.toUpperCase() === 'IN_PROGRESS' ? 0 : 1;
      const bInProg = b.status.toUpperCase() === 'IN_PROGRESS' ? 0 : 1;
      if (aInProg !== bInProg) return aInProg - bInProg;

      const aDue = a.dueDate ? new Date(a.dueDate).getTime() : Number.MAX_SAFE_INTEGER;
      const bDue = b.dueDate ? new Date(b.dueDate).getTime() : Number.MAX_SAFE_INTEGER;
      if (aDue !== bDue) return aDue - bDue;

      return (
        (PRIORITY_RANK[a.priority.toUpperCase()] ?? 4) -
        (PRIORITY_RANK[b.priority.toUpperCase()] ?? 4)
      );
    })
    .slice(0, 10)
    .map(toSummaryTaskItem);

  const upcomingMilestones: SummaryMilestoneItem[] = project.milestones
    .filter((m) => m.status.toUpperCase() !== 'COMPLETED')
    .slice(0, 5)
    .map((m) => ({
      id: m.id,
      title: m.title,
      status: m.status,
      dueDate: m.dueDate ? m.dueDate.toISOString() : null,
    }));

  const totalTasks = visibleTickets.length;
  const completedCount = completedTickets.length;
  const completionPercentage = totalTasks > 0 ? Math.round((completedCount / totalTasks) * 100) : 0;

  const stats: ProjectSummaryPayload['stats'] = {
    totalTasks,
    completedCount,
    inProgressCount: inProgressTickets.length,
    plannedCount: plannedOnlyTickets.length,
    blockedCount: explicitBlockedCount,
    overdueCount,
    dependencyBlockerCount: dependencyBlockedTicketIds.size,
    completionPercentage,
  };

  const blockersSection: ProjectSummaryPayload['blockers'] = {
    totalCount: blockerItems.length,
    explicitBlockedCount,
    dependencyCount: dependencyBlockedTicketIds.size,
    overdueCount,
    items: blockerItems,
  };

  const computedProjectStatus =
    project.status !== 'COMPLETED' && project.deadline && new Date(project.deadline).getTime() < now
      ? 'OVERDUE'
      : project.status;

  let healthStatus: ProjectSummaryPayload['healthStatus'] = 'ON_TRACK';
  if (computedProjectStatus === 'COMPLETED' || (totalTasks > 0 && completedCount === totalTasks)) {
    healthStatus = 'COMPLETED';
  } else if (computedProjectStatus === 'OVERDUE' || explicitBlockedCount > 0 || overdueCount >= 3) {
    healthStatus = 'CRITICAL';
  } else if (blockerItems.length > 0) {
    healthStatus = 'AT_RISK';
  }

  const baseSummary: Omit<ProjectSummaryPayload, 'ai'> = {
    projectId: project.id,
    projectKey: project.key,
    projectName: project.name,
    projectStatus: computedProjectStatus,
    deadline: project.deadline ? project.deadline.toISOString() : null,
    generatedAt: new Date().toISOString(),
    healthStatus,
    headline: buildDeterministicHeadline(stats, blockersSection),
    stats,
    completed: {
      totalCount: completedCount,
      recentCount: recentlyCompleted.length,
      recentHighlights,
    },
    blockers: blockersSection,
    planned: {
      inProgressCount: inProgressTickets.length,
      todoCount: plannedOnlyTickets.length,
      upcomingMilestones,
      items: plannedItems,
    },
  };

  const provider = getConfiguredAiProvider();
  let ai: ProjectSummaryPayload['ai'] = {
    configured: Boolean(provider),
    narrative: null,
    provider,
    generatedAt: null,
  };

  if (provider) {
    const cacheKey = `${project.id}:${callerId ?? 'anon'}`;
    const cached = aiNarrativeCache.get(cacheKey);

    if (options.regenerate && cached && now - cached.lastRequestedAt < AI_REGENERATE_COOLDOWN_MS) {
      throw new RateLimitError('Please wait a few seconds before regenerating the AI summary.');
    }

    if (!options.regenerate && cached && cached.expiresAt > now) {
      ai = {
        configured: true,
        narrative: cached.narrative,
        provider: cached.provider,
        generatedAt: cached.generatedAt,
      };
    } else {
      const narrative = await generateAiNarrative(baseSummary, provider);
      if (narrative) {
        const entry: CachedAiNarrative = {
          narrative,
          provider,
          generatedAt: new Date().toISOString(),
          expiresAt: now + AI_CACHE_TTL_MS,
          lastRequestedAt: now,
        };
        aiNarrativeCache.set(cacheKey, entry);
        ai = {
          configured: true,
          narrative: entry.narrative,
          provider: entry.provider,
          generatedAt: entry.generatedAt,
        };
      } else if (cached) {
        ai = {
          configured: true,
          narrative: cached.narrative,
          provider: cached.provider,
          generatedAt: cached.generatedAt,
        };
      }
    }
  }

  return {
    ...baseSummary,
    ai,
  };
}
