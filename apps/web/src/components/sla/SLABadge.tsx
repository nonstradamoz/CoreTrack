'use client';

import React, { useState, useEffect } from 'react';
import { Clock, AlertTriangle, Flame, PauseCircle, CheckCircle } from 'lucide-react';

interface SLABadgeProps {
  dueAt: string | null | undefined;
  isPaused?: boolean;
  label?: string;
  isResolved?: boolean;
  compact?: boolean;
}

export function SLABadge({
  dueAt,
  isPaused = false,
  label = 'SLA',
  isResolved = false,
  compact = false,
}: SLABadgeProps) {
  const [, setTick] = useState(0);

  // Re-evaluate every 30 seconds for live countdown
  useEffect(() => {
    if (!dueAt || isPaused || isResolved) return;
    const timer = setInterval(() => setTick((t) => t + 1), 30000);
    return () => clearInterval(timer);
  }, [dueAt, isPaused, isResolved]);

  if (isResolved) {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-800/80 text-[10px] font-mono font-medium text-emerald-800 dark:text-emerald-300">
        <CheckCircle className="h-3 w-3 text-emerald-600 dark:text-emerald-400" />
        <span>SLA Met</span>
      </span>
    );
  }

  if (isPaused) {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-zinc-100 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 text-[10px] font-mono font-medium text-zinc-700 dark:text-zinc-300">
        <PauseCircle className="h-3 w-3 text-zinc-500" />
        <span>{compact ? 'Paused' : 'Clock Paused'}</span>
      </span>
    );
  }

  if (!dueAt) {
    return null;
  }

  const now = Date.now();
  const dueTime = new Date(dueAt).getTime();
  const diffMs = dueTime - now;
  const remainingMinutes = Math.floor(diffMs / (60 * 1000));

  if (diffMs <= 0) {
    const overtimeMins = Math.abs(remainingMinutes);
    const hours = Math.floor(overtimeMins / 60);
    const mins = overtimeMins % 60;
    const timeStr = hours > 0 ? `-${hours}h ${mins}m` : `-${mins}m`;

    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-rose-50 dark:bg-rose-950/60 border border-rose-200 dark:border-rose-800 text-[10px] font-mono font-semibold text-rose-800 dark:text-rose-300 animate-pulse">
        <Flame className="h-3 w-3 text-rose-600 dark:text-rose-400" />
        <span>{compact ? timeStr : `${label} ${timeStr} overdue`}</span>
      </span>
    );
  }

  // Warning state if under 30 minutes
  if (remainingMinutes < 30) {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-amber-50 dark:bg-amber-950/60 border border-amber-200 dark:border-amber-800 text-[10px] font-mono font-semibold text-amber-800 dark:text-amber-300">
        <AlertTriangle className="h-3 w-3 text-amber-600 dark:text-amber-400" />
        <span>{compact ? `${remainingMinutes}m` : `${label} ${remainingMinutes}m left`}</span>
      </span>
    );
  }

  // Healthy countdown
  const hours = Math.floor(remainingMinutes / 60);
  const mins = remainingMinutes % 60;
  const formatted = hours > 0 ? `${hours}h ${mins}m` : `${mins}m`;

  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-[10px] font-mono font-medium text-slate-700 dark:text-slate-300">
      <Clock className="h-3 w-3 text-slate-500" />
      <span>{compact ? formatted : `${label} ${formatted}`}</span>
    </span>
  );
}
