'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  fetchProjectSummary,
  regenerateProjectSummary,
  ProjectSummary,
} from '../../lib/api';
import {
  CheckCircle2,
  AlertOctagon,
  ListTodo,
  Sparkles,
  RefreshCw,
  Clock,
  Calendar,
  Flag,
  X,
  ArrowUpRight,
} from 'lucide-react';

interface ProjectSummaryCardProps {
  projectKey: string;
  compact?: boolean;
}

const HEALTH_BADGE: Record<
  ProjectSummary['healthStatus'],
  { label: string; classes: string }
> = {
  ON_TRACK: {
    label: 'On Track',
    classes:
      'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/60 dark:text-emerald-300 dark:border-emerald-800/80',
  },
  AT_RISK: {
    label: 'At Risk',
    classes:
      'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/60 dark:text-amber-300 dark:border-amber-800/80',
  },
  CRITICAL: {
    label: 'Needs Attention',
    classes:
      'bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/60 dark:text-rose-300 dark:border-rose-800/80',
  },
  COMPLETED: {
    label: 'Completed',
    classes:
      'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/60 dark:text-blue-300 dark:border-blue-800/80',
  },
};

export function ProjectSummaryCard({ projectKey, compact = false }: ProjectSummaryCardProps) {
  const queryClient = useQueryClient();
  const [regenError, setRegenError] = useState<string | null>(null);

  const {
    data: summary,
    isLoading,
    isError,
    error,
    refetch,
    isFetching,
  } = useQuery({
    queryKey: ['projectSummary', projectKey],
    queryFn: () => fetchProjectSummary(projectKey),
    enabled: Boolean(projectKey),
  });

  const regenerateMutation = useMutation({
    mutationFn: () => regenerateProjectSummary(projectKey),
    onSuccess: (updated) => {
      setRegenError(null);
      queryClient.setQueryData(['projectSummary', projectKey], updated);
    },
    onError: (err: Error) => {
      setRegenError(err.message || 'Could not regenerate summary');
    },
  });

  if (isLoading) {
    return (
      <div className="rounded-2xl border border-slate-200/80 dark:border-slate-800/80 bg-white dark:bg-slate-900 p-5 shadow-2xs animate-pulse space-y-4">
        <div className="h-5 w-48 rounded bg-slate-200 dark:bg-slate-800" />
        <div className="h-12 w-full rounded-xl bg-slate-100 dark:bg-slate-800/60" />
        <div className={`grid gap-4 ${compact ? 'grid-cols-1' : 'grid-cols-1 lg:grid-cols-3'}`}>
          <div className="h-36 rounded-xl bg-slate-100 dark:bg-slate-800/60" />
          <div className="h-36 rounded-xl bg-slate-100 dark:bg-slate-800/60" />
          <div className="h-36 rounded-xl bg-slate-100 dark:bg-slate-800/60" />
        </div>
      </div>
    );
  }

  if (isError || !summary) {
    return (
      <div className="rounded-2xl border border-rose-200 dark:border-rose-900/60 bg-rose-50/50 dark:bg-rose-950/20 p-5 text-xs text-rose-700 dark:text-rose-300 flex items-center justify-between gap-3">
        <span>{(error as Error)?.message || 'Unable to load project summary.'}</span>
        <button
          type="button"
          onClick={() => refetch()}
          className="px-3 py-1.5 rounded-lg bg-white dark:bg-slate-900 border border-rose-200 dark:border-rose-800 font-semibold hover:bg-rose-50 transition cursor-pointer"
        >
          Retry
        </button>
      </div>
    );
  }

  const health = HEALTH_BADGE[summary.healthStatus];

  const handleRefresh = () => {
    setRegenError(null);
    if (summary.ai.configured) {
      regenerateMutation.mutate();
    } else {
      refetch();
    }
  };

  const isRefreshing = isFetching || regenerateMutation.isPending;

  return (
    <div className="rounded-2xl border border-slate-200/80 dark:border-slate-800/80 bg-white dark:bg-slate-900 p-5 shadow-2xs space-y-5">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100 flex items-center gap-1.5">
              <Sparkles className="h-4 w-4 text-blue-600 dark:text-blue-400" />
              <span>Project Summary</span>
            </h3>
            <span
              className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold border ${health.classes}`}
            >
              {health.label}
            </span>
            <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">
              {summary.stats.completionPercentage}% complete ({summary.stats.completedCount}/{summary.stats.totalTasks})
            </span>
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400">{summary.headline}</p>
        </div>

        <button
          type="button"
          onClick={handleRefresh}
          disabled={isRefreshing}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs font-semibold transition cursor-pointer disabled:opacity-50"
          title={summary.ai.configured ? 'Regenerate AI narrative & refresh metrics' : 'Refresh live summary'}
        >
          <RefreshCw className={`h-3.5 w-3.5 ${isRefreshing ? 'animate-spin' : ''}`} />
          <span>{summary.ai.configured ? 'Regenerate' : 'Refresh'}</span>
        </button>
      </div>

      {/* Progress Bar */}
      <div className="w-full h-2 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
        <div
          className="h-full rounded-full bg-gradient-to-r from-blue-600 to-emerald-500 transition-all duration-300"
          style={{ width: `${summary.stats.completionPercentage}%` }}
        />
      </div>

      {/* Optional AI Narrative */}
      {summary.ai.narrative && (
        <div className="rounded-xl border border-blue-200/70 dark:border-blue-900/60 bg-blue-50/60 dark:bg-blue-950/30 p-3.5 space-y-1">
          <div className="flex items-center justify-between text-[11px] font-semibold text-blue-700 dark:text-blue-300">
            <span className="inline-flex items-center gap-1">
              <Sparkles className="h-3 w-3" />
              Executive AI Brief
            </span>
            {summary.ai.generatedAt && (
              <span className="text-blue-500/80 dark:text-blue-400/70 font-normal">
                Updated {new Date(summary.ai.generatedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </span>
            )}
          </div>
          <p className="text-xs leading-relaxed text-slate-700 dark:text-slate-200">
            {summary.ai.narrative}
          </p>
        </div>
      )}

      {regenError && (
        <div className="text-[11px] text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/70 rounded-lg px-3 py-2">
          {regenError}
        </div>
      )}

      {/* 3-Column Breakdown: Completed | Blockers | Planned */}
      <div className={`grid gap-4 ${compact ? 'grid-cols-1' : 'grid-cols-1 lg:grid-cols-3'}`}>
        {/* 1. Tasks Completed */}
        <div className="rounded-xl border border-emerald-200/70 dark:border-emerald-900/50 bg-emerald-50/30 dark:bg-emerald-950/15 p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-xs font-bold text-emerald-800 dark:text-emerald-300">
              <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
              <span>Tasks Completed</span>
            </div>
            <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-900/60 text-emerald-700 dark:text-emerald-300">
              {summary.completed.totalCount} total · {summary.completed.recentCount} (7d)
            </span>
          </div>

          {summary.completed.recentHighlights.length === 0 ? (
            <p className="text-xs text-slate-400 italic">No completed tasks yet.</p>
          ) : (
            <ul className="space-y-2">
              {summary.completed.recentHighlights.slice(0, compact ? 4 : 6).map((t) => (
                <li
                  key={t.id}
                  className="text-xs bg-white/80 dark:bg-slate-900/70 border border-emerald-100 dark:border-emerald-900/40 rounded-lg px-2.5 py-2"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-mono text-[10px] font-bold text-emerald-700 dark:text-emerald-400">
                      {t.ticketKey}
                    </span>
                    {t.assigneeName && (
                      <span className="text-[10px] text-slate-400 truncate">{t.assigneeName}</span>
                    )}
                  </div>
                  <div className="font-medium text-slate-800 dark:text-slate-200 truncate mt-0.5">
                    {t.title}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* 2. Blockers Present */}
        <div className="rounded-xl border border-rose-200/70 dark:border-rose-900/50 bg-rose-50/30 dark:bg-rose-950/15 p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-xs font-bold text-rose-800 dark:text-rose-300">
              <AlertOctagon className="h-4 w-4 text-rose-600 dark:text-rose-400" />
              <span>Blockers Present</span>
            </div>
            <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-rose-100 dark:bg-rose-900/60 text-rose-700 dark:text-rose-300">
              {summary.blockers.totalCount} active
            </span>
          </div>

          {summary.blockers.items.length === 0 ? (
            <p className="text-xs text-emerald-700 dark:text-emerald-400 font-medium">
              No blockers, dependency holds, or overdue tasks.
            </p>
          ) : (
            <ul className="space-y-2">
              {summary.blockers.items.slice(0, compact ? 4 : 6).map((b) => (
                <li
                  key={b.id}
                  className="text-xs bg-white/80 dark:bg-slate-900/70 border border-rose-100 dark:border-rose-900/40 rounded-lg px-2.5 py-2 space-y-1"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-mono text-[10px] font-bold text-rose-700 dark:text-rose-400">
                      {b.ticketKey}
                    </span>
                    <span className="text-[10px] font-semibold uppercase text-slate-400">
                      {b.priority}
                    </span>
                  </div>
                  <div className="font-medium text-slate-800 dark:text-slate-200 truncate">
                    {b.title}
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {b.blockerDetails.map((detail, idx) => (
                      <span
                        key={idx}
                        className="inline-block text-[10px] px-1.5 py-0.5 rounded bg-rose-100/80 dark:bg-rose-950 text-rose-700 dark:text-rose-300 font-medium"
                      >
                        {detail}
                      </span>
                    ))}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* 3. Tasks Planned */}
        <div className="rounded-xl border border-blue-200/70 dark:border-blue-900/50 bg-blue-50/30 dark:bg-blue-950/15 p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-xs font-bold text-blue-800 dark:text-blue-300">
              <ListTodo className="h-4 w-4 text-blue-600 dark:text-blue-400" />
              <span>Tasks Planned</span>
            </div>
            <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-blue-100 dark:bg-blue-900/60 text-blue-700 dark:text-blue-300">
              {summary.planned.inProgressCount} active · {summary.planned.todoCount} queued
            </span>
          </div>

          {summary.planned.items.length === 0 ? (
            <p className="text-xs text-slate-400 italic">No remaining planned tasks.</p>
          ) : (
            <ul className="space-y-2">
              {summary.planned.items.slice(0, compact ? 4 : 6).map((t) => (
                <li
                  key={t.id}
                  className="text-xs bg-white/80 dark:bg-slate-900/70 border border-blue-100 dark:border-blue-900/40 rounded-lg px-2.5 py-2"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-mono text-[10px] font-bold text-blue-700 dark:text-blue-400">
                      {t.ticketKey}
                    </span>
                    <span className="text-[10px] font-semibold text-slate-500 dark:text-slate-400">
                      {t.status.replace('_', ' ')}
                    </span>
                  </div>
                  <div className="font-medium text-slate-800 dark:text-slate-200 truncate mt-0.5">
                    {t.title}
                  </div>
                  <div className="flex items-center justify-between text-[10px] text-slate-400 mt-1">
                    <span>{t.assigneeName || 'Unassigned'}</span>
                    {t.dueDate && (
                      <span className="inline-flex items-center gap-1">
                        <Calendar className="h-2.5 w-2.5" />
                        {new Date(t.dueDate).toLocaleDateString()}
                      </span>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}

          {summary.planned.upcomingMilestones.length > 0 && (
            <div className="pt-2 border-t border-blue-200/60 dark:border-blue-900/50 space-y-1.5">
              <div className="text-[10px] font-bold uppercase tracking-wider text-blue-700 dark:text-blue-400 flex items-center gap-1">
                <Flag className="h-3 w-3" />
                <span>Upcoming Milestones</span>
              </div>
              {summary.planned.upcomingMilestones.slice(0, 2).map((m) => (
                <div key={m.id} className="flex items-center justify-between text-[11px] text-slate-600 dark:text-slate-300">
                  <span className="truncate">{m.title}</span>
                  {m.dueDate && (
                    <span className="text-[10px] text-slate-400 shrink-0 ml-2 inline-flex items-center gap-1">
                      <Clock className="h-2.5 w-2.5" />
                      {new Date(m.dueDate).toLocaleDateString()}
                    </span>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

interface ProjectSummaryDrawerProps {
  projectKey: string | null;
  projectName?: string;
  onClose: () => void;
}

export function ProjectSummaryDrawer({
  projectKey,
  projectName,
  onClose,
}: ProjectSummaryDrawerProps) {
  if (!projectKey) return null;

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-slate-950/40 backdrop-blur-[2px]">
      <div className="fixed inset-0" onClick={onClose} aria-hidden="true" />
      <div className="relative z-10 w-full max-w-2xl h-full bg-slate-50 dark:bg-slate-950 border-l border-slate-200 dark:border-slate-800 shadow-2xl flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800">
          <div className="min-w-0">
            <div className="text-[11px] font-mono font-bold text-blue-600 dark:text-blue-400">
              {projectKey}
            </div>
            <h2 className="text-base font-bold text-slate-900 dark:text-slate-100 truncate">
              {projectName || 'Project Summary'}
            </h2>
          </div>
          <div className="flex items-center gap-2">
            <Link
              href={`/projects/${projectKey}`}
              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-700 transition"
            >
              <span>Open Project</span>
              <ArrowUpRight className="h-3.5 w-3.5" />
            </Link>
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition cursor-pointer"
              aria-label="Close summary drawer"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          <ProjectSummaryCard projectKey={projectKey} compact />
        </div>
      </div>
    </div>
  );
}
