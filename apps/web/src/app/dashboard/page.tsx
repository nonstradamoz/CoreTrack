'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { useProject } from '../../context/ProjectContext';
import { usePermissions } from '../../hooks/usePermissions';
import {
  fetchPortfolioDashboard,
  fetchTicket,
  fetchProjectMetrics,
  fetchTeams,
  fetchCurrentUser,
  PortfolioDashboardData,
  Ticket,
  Team,
} from '../../lib/api';
import { TicketDetailModal } from '../../components/kanban/TicketDetailModal';
import {
  FolderGit2,
  CheckCircle2,
  AlertTriangle,
  Flame,
  Clock,
  Layers,
  ArrowRight,
  Users,
  Calendar,
  Plus,
  MoreHorizontal,
  ChevronRight,
  Sparkles,
  Star,
} from 'lucide-react';

export default function PortfolioDashboardPage() {
  const router = useRouter();
  const { projects, setSelectedProjectKey } = useProject();
  const { isOrgAdmin, roleTier } = usePermissions();
  const canCreateProject = isOrgAdmin || roleTier >= 3;

  const [selectedTicket, setSelectedTicket] = useState<Ticket | null>(null);
  const [activeTab, setActiveTab] = useState<'CALENDAR' | 'TEAMS' | 'FAVORITE'>('CALENDAR');
  const [favoriteKeys, setFavoriteKeys] = useState<string[]>([]);

  const { data: currentUser } = useQuery({
    queryKey: ['currentUser'],
    queryFn: fetchCurrentUser,
  });

  const favStorageKey = `coretrack_favorites_${currentUser?.email || 'default'}`;

  useEffect(() => {
    try {
      const raw = localStorage.getItem(favStorageKey);
      setFavoriteKeys(raw ? JSON.parse(raw) : []);
    } catch {
      setFavoriteKeys([]);
    }
  }, [favStorageKey]);

  const toggleFavorite = (key: string) => {
    setFavoriteKeys((prev) => {
      const next = prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key];
      try {
        localStorage.setItem(favStorageKey, JSON.stringify(next));
      } catch {
        // ignore
      }
      return next;
    });
  };

  const { data: dashboard, isLoading } = useQuery<PortfolioDashboardData>({
    queryKey: ['portfolioDashboard'],
    queryFn: fetchPortfolioDashboard,
    refetchInterval: 15000,
  });

  const { data: metrics } = useQuery({
    queryKey: ['projectMetrics'],
    queryFn: fetchProjectMetrics,
  });

  const { data: teamsList = [] } = useQuery<Team[]>({
    queryKey: ['teams'],
    queryFn: fetchTeams,
  });

  const handleOpenTicketByKey = async (key: string) => {
    try {
      const ticket = await fetchTicket(key);
      setSelectedTicket(ticket);
    } catch {
      // ignore
    }
  };

  const handleNavigateProject = (projectKey: string, view: 'board' | 'backlog') => {
    setSelectedProjectKey(projectKey);
    if (view === 'board') {
      router.push('/');
    } else {
      router.push('/backlog');
    }
  };

  const summary = dashboard?.summary;
  const projectsHealth = dashboard?.projectsHealth || [];
  const crossProjectBlockers = dashboard?.crossProjectBlockers || [];
  const criticalRiskTickets = dashboard?.criticalRiskTickets || [];
  const teamWorkload = dashboard?.teamWorkload || [];

  // Dynamic Calendar calculations
  const today = new Date();
  const currentMonthYear = new Intl.DateTimeFormat('en-US', {
    month: 'long',
    year: 'numeric',
  }).format(today);

  // Generate 7 days centered on today
  const calendarDays = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(today);
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() - 3 + i);
    const isToday = d.toDateString() === today.toDateString();
    return {
      date: d,
      day: String(d.getDate()),
      label: new Intl.DateTimeFormat('en-US', { weekday: 'short' }).format(d),
      active: isToday,
      time: isToday
        ? new Intl.DateTimeFormat('en-US', {
          hour: '2-digit',
          minute: '2-digit',
          hour12: false,
        }).format(today)
        : undefined,
    };
  });

  const windowStartMs = calendarDays[0].date.getTime();
  const windowEndMs = calendarDays[6].date.getTime() + 86400000 - 1;
  const windowSpanMs = windowEndMs - windowStartMs;

  const computeBarSpan = (startIso?: string | null, endIso?: string | null) => {
    if (!startIso && !endIso) return null;
    const rawStart = startIso ? new Date(startIso).setHours(0, 0, 0, 0) : new Date(endIso!).setHours(0, 0, 0, 0);
    const rawEnd = endIso ? new Date(endIso).setHours(23, 59, 59, 999) : rawStart + 86400000 - 1;
    if (rawEnd < windowStartMs || rawStart > windowEndMs) return null;
    const clampedStart = Math.max(windowStartMs, rawStart);
    const clampedEnd = Math.min(windowEndMs, rawEnd);
    const leftPct = Math.max(0, Math.min(96, ((clampedStart - windowStartMs) / windowSpanMs) * 100));
    const widthPct = Math.max(12, Math.min(100 - leftPct, ((clampedEnd - clampedStart) / windowSpanMs) * 100));
    return { leftPct, widthPct };
  };

  const scheduleItems = [
    ...projects
      .filter((p) => p.startDate || p.deadline)
      .map((p) => {
        const span = computeBarSpan(p.startDate, p.deadline);
        const startLabel = p.startDate ? new Date(p.startDate).toLocaleDateString([], { month: 'short', day: 'numeric' }) : null;
        const endLabel = p.deadline ? new Date(p.deadline).toLocaleDateString([], { month: 'short', day: 'numeric' }) : null;
        return {
          id: p.id,
          key: p.key,
          title: p.name,
          dueTime: startLabel && endLabel ? `${startLabel} → ${endLabel}` : endLabel ? `Due ${endLabel}` : `Starts ${startLabel}`,
          color: 'purple',
          type: 'PROJECT' as const,
          span,
        };
      })
      .filter((item) => item.span !== null),
    ...criticalRiskTickets
      .map((t) => {
        const span = computeBarSpan(null, t.slaResolutionDueAt);
        return {
          id: t.id,
          key: t.ticketKey,
          title: t.title,
          dueTime: t.slaResolutionDueAt
            ? new Date(t.slaResolutionDueAt).toLocaleDateString([], { month: 'short', day: 'numeric' })
            : 'Due Soon',
          color: t.priority === 'URGENT' ? 'rose' : 'blue',
          type: 'TICKET' as const,
          span,
        };
      })
      .filter((item) => item.span !== null),
  ];

  const upcomingDeadlines = metrics?.upcomingDeadlines || [];

  // Project card gradients matching reference image
  const cardThemes = [
    {
      bg: 'bg-gradient-to-br from-blue-600 via-blue-700 to-indigo-800 text-white shadow-lg shadow-blue-500/20',
      accent: 'bg-white/20',
      pill: 'bg-white/20 text-white',
    },
    {
      bg: 'bg-gradient-to-br from-[#121418] via-[#1A1F26] to-[#252B36] text-white shadow-lg shadow-slate-900/20',
      accent: 'bg-white/10',
      pill: 'bg-white/10 text-white',
    },
    {
      bg: 'bg-gradient-to-br from-amber-600 via-orange-600 to-rose-600 text-white shadow-lg shadow-orange-500/20',
      accent: 'bg-white/20',
      pill: 'bg-white/20 text-white',
    },
  ];

  return (
    <div className="flex-1 flex flex-col min-w-0 space-y-8">
      {/* 1. TOP SECTION: PROJECTS HEADER & CARDS CAROUSEL MATCHING REFERENCE */}
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl md:text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
              Projects
            </h1>
            <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5 font-medium">
              You have {projectsHealth.length} Projects
            </p>
          </div>

          {canCreateProject && (
            <button
              onClick={() => router.push('/projects')}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold shadow-2xs transition active:scale-[0.98] cursor-pointer"
            >
              <Plus className="h-3.5 w-3.5" />
              <span>Add</span>
            </button>
          )}
        </div>

        {/* Project Cards Row */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {projectsHealth.length === 0 ? (
            <div className="col-span-full py-12 px-6 rounded-3xl border border-dashed border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-center flex flex-col items-center justify-center">
              <div className="w-12 h-12 rounded-2xl bg-blue-50 dark:bg-blue-950/60 text-blue-600 flex items-center justify-center mb-3">
                <FolderGit2 className="h-6 w-6" />
              </div>
              <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100 mb-1">No Projects Found</h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 max-w-sm mb-4">
                Your workspace is completely clean. {canCreateProject ? 'Create your first project to start tracking sprints, tasks, and project deliverables.' : 'Projects assigned to your team will appear here.'}
              </p>
              {canCreateProject && (
                <button
                  onClick={() => router.push('/projects')}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold shadow-2xs transition active:scale-95 cursor-pointer"
                >
                  <Plus className="h-3.5 w-3.5" />
                  <span>Create Project</span>
                </button>
              )}
            </div>
          ) : (
            projectsHealth.slice(0, 3).map((proj, idx) => {
              const theme = cardThemes[idx % cardThemes.length];
              const pct = proj.completionPercentage || 0;
              const isFav = favoriteKeys.includes(proj.key);
              const fullProj = projects.find((p) => p.key === proj.key);
              const deadlineLabel = fullProj?.deadline
                ? new Date(fullProj.deadline).toLocaleDateString([], { month: 'short', day: 'numeric' })
                : 'No deadline';

              return (
                <div
                  key={proj.id}
                  onClick={() => handleNavigateProject(proj.key, 'board')}
                  className={`relative p-5 rounded-3xl ${theme.bg} transition-transform hover:-translate-y-1 duration-200 cursor-pointer flex flex-col justify-between min-h-[175px] overflow-hidden group select-none`}
                >
                  {/* Subtle Wavy Vector in background */}
                  <svg
                    className="absolute right-0 bottom-0 opacity-15 pointer-events-none w-48 h-32"
                    viewBox="0 0 200 120"
                    fill="none"
                  >
                    <path
                      d="M0 60C50 20 150 100 200 40V120H0V60Z"
                      fill="currentColor"
                    />
                  </svg>

                  {/* Top: Title & Options */}
                  <div className="flex items-start justify-between gap-2 z-10">
                    <div className="min-w-0 flex-1">
                      <h3 className="text-base font-bold text-white truncate leading-snug">
                        {proj.name}
                      </h3>
                      <span className="text-[10px] uppercase font-mono font-bold tracking-wider opacity-75">
                        {proj.key}
                      </span>
                    </div>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleFavorite(proj.key);
                      }}
                      title={isFav ? 'Remove from Favorites' : 'Pin to Favorites'}
                      className="p-1.5 rounded-full hover:bg-white/20 text-white transition cursor-pointer"
                    >
                      <Star className={`h-4 w-4 ${isFav ? 'fill-amber-300 text-amber-300' : 'text-white/80'}`} />
                    </button>
                  </div>

                  {/* Middle: Progress Segmented Bar */}
                  <div className="my-4 space-y-1.5 z-10">
                    <div className="flex items-center justify-between text-xs text-white/90">
                      <span className="text-[11px] font-medium opacity-80">Progress</span>
                      <span className="text-xs font-bold">{pct}%</span>
                    </div>
                    {/* Segmented bar with 5 rounded segments */}
                    <div className="flex items-center gap-1.5 w-full">
                      {[1, 2, 3, 4, 5].map((seg) => {
                        const filled = (seg * 20) <= pct || (seg * 20 - 10) <= pct;
                        return (
                          <div
                            key={seg}
                            className={`h-1.5 flex-1 rounded-full transition-all ${filled ? 'bg-white' : 'bg-white/25'
                              }`}
                          />
                        );
                      })}
                    </div>
                  </div>

                  {/* Bottom Row: Avatar Cluster & Due Date */}
                  <div className="flex items-center justify-between z-10 pt-1">
                    <div className="flex items-center -space-x-2">
                      <div className="h-6 w-6 rounded-full bg-white/90 text-slate-900 text-[10px] font-bold flex items-center justify-center border-2 border-white shadow-xs">
                        JM
                      </div>
                      <div className="h-6 w-6 rounded-full bg-slate-900 text-white text-[10px] font-bold flex items-center justify-center border-2 border-white shadow-xs">
                        AK
                      </div>
                      <div className="h-6 w-6 rounded-full bg-white/30 text-white text-[9px] font-bold flex items-center justify-center border-2 border-white backdrop-blur-xs">
                        +1
                      </div>
                    </div>

                    <div className={`flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-medium ${theme.pill} backdrop-blur-xs`}>
                      <Calendar className="h-3 w-3" />
                      <span>{deadlineLabel}</span>
                    </div>
                  </div>
                </div>
              );
            }))}
        </div>
      </section>

      {/* 2. EXECUTIVE KPI TELEMETRY & WORKLOAD STATS (CLICKABLE CARDS) */}
      <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Card 1: Total Projects -> /projects */}
        <div
          onClick={() => router.push('/projects')}
          className="p-5 rounded-3xl border border-slate-200/80 dark:border-slate-800/80 bg-white dark:bg-slate-900 shadow-2xs hover:shadow-md hover:-translate-y-0.5 active:scale-[0.98] transition cursor-pointer group"
          title="Click to view all projects in portfolio"
        >
          <div className="flex items-center justify-between text-xs text-slate-400 mb-2">
            <span className="font-semibold uppercase tracking-wider text-[10px] group-hover:text-blue-600 transition">
              Total Projects
            </span>
            <FolderGit2 className="h-4 w-4 text-blue-600 group-hover:scale-110 transition-transform" />
          </div>
          <div className="text-3xl font-extrabold text-slate-900 dark:text-slate-100 group-hover:text-blue-600 transition">
            {summary?.totalProjects ?? 0}
          </div>
          <p className="text-[11px] text-slate-400 mt-1 font-medium flex items-center justify-between">
            <span>{summary?.totalTicketsCount ?? 0} active tasks in flight</span>
            <span className="text-[10px] text-blue-500 font-semibold opacity-0 group-hover:opacity-100 transition-opacity">View &rarr;</span>
          </p>
        </div>

        {/* Card 2: Completion Rate -> /reports */}
        <div
          onClick={() => router.push('/reports')}
          className="p-5 rounded-3xl border border-slate-200/80 dark:border-slate-800/80 bg-white dark:bg-slate-900 shadow-2xs hover:shadow-md hover:-translate-y-0.5 active:scale-[0.98] transition cursor-pointer group"
          title="Click to view Burndown & Velocity Reports"
        >
          <div className="flex items-center justify-between text-xs text-slate-400 mb-2">
            <span className="font-semibold uppercase tracking-wider text-[10px] group-hover:text-emerald-600 transition">
              Completion
            </span>
            <CheckCircle2 className="h-4 w-4 text-emerald-500 group-hover:scale-110 transition-transform" />
          </div>
          <div className="text-3xl font-extrabold text-emerald-600 dark:text-emerald-400">
            {summary?.completionRate ?? 0}%
          </div>
          <div className="w-full bg-slate-100 dark:bg-slate-800 h-1.5 rounded-full mt-2 overflow-hidden">
            <div
              style={{ width: `${summary?.completionRate ?? 0}%` }}
              className="bg-emerald-500 h-full rounded-full transition-all duration-500"
            />
          </div>
          <div className="text-[10px] text-emerald-600 dark:text-emerald-400 font-semibold mt-1.5 opacity-0 group-hover:opacity-100 transition-opacity text-right">
            Open Agile Reports &rarr;
          </div>
        </div>

        {/* Card 3: At-Risk SLA -> /table?filter=at_risk */}
        <div
          onClick={() => router.push('/table?filter=at_risk')}
          className="p-5 rounded-3xl border border-slate-200/80 dark:border-slate-800/80 bg-white dark:bg-slate-900 shadow-2xs hover:shadow-md hover:-translate-y-0.5 active:scale-[0.98] transition cursor-pointer group"
          title="Click to inspect SLA at-risk tasks"
        >
          <div className="flex items-center justify-between text-xs text-slate-400 mb-2">
            <span className="font-semibold uppercase tracking-wider text-[10px] group-hover:text-rose-600 transition">
              At-Risk SLA
            </span>
            <Flame className="h-4 w-4 text-rose-500 group-hover:scale-110 transition-transform" />
          </div>
          <div className="text-3xl font-extrabold text-rose-600 dark:text-rose-400">
            {summary?.slaAtRiskCount ?? 0}
          </div>
          <p className="text-[11px] text-rose-500/90 mt-1 font-medium flex items-center justify-between">
            <span>Within 4h of target deadline</span>
            <span className="text-[10px] text-rose-600 font-semibold opacity-0 group-hover:opacity-100 transition-opacity">Inspect &rarr;</span>
          </p>
        </div>

        {/* Card 4: Blockers -> /table?filter=blocked */}
        <div
          onClick={() => router.push('/table?filter=blocked')}
          className="p-5 rounded-3xl border border-slate-200/80 dark:border-slate-800/80 bg-white dark:bg-slate-900 shadow-2xs hover:shadow-md hover:-translate-y-0.5 active:scale-[0.98] transition cursor-pointer group"
          title="Click to inspect task dependencies and blockers"
        >
          <div className="flex items-center justify-between text-xs text-slate-400 mb-2">
            <span className="font-semibold uppercase tracking-wider text-[10px] group-hover:text-amber-600 transition">
              Blockers
            </span>
            <AlertTriangle className="h-4 w-4 text-amber-500 group-hover:scale-110 transition-transform" />
          </div>
          <div className="text-3xl font-extrabold text-amber-600 dark:text-amber-400">
            {crossProjectBlockers.length}
          </div>
          <p className="text-[11px] text-amber-500/90 mt-1 font-medium flex items-center justify-between">
            <span>Dependency holds</span>
            <span className="text-[10px] text-amber-600 font-semibold opacity-0 group-hover:opacity-100 transition-opacity">View Tasks &rarr;</span>
          </p>
        </div>
      </section>

      {/* 3. INTERACTIVE CALENDAR, TEAMS & FAVORITES BELOW STATS */}
      <section className="p-6 rounded-3xl border border-slate-200/80 dark:border-slate-800/80 bg-white dark:bg-slate-900 shadow-2xs space-y-6">
        {/* Navigation Tabs: Calendar | Teams | Favorites */}
        <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800/80 pb-4">
          <div className="flex items-center gap-6 text-sm font-semibold text-slate-400 dark:text-slate-500">
            <button
              onClick={() => setActiveTab('CALENDAR')}
              className={`transition pb-1 cursor-pointer ${activeTab === 'CALENDAR'
                ? 'text-slate-900 dark:text-slate-100 font-bold border-b-2 border-blue-600 text-blue-600 dark:text-blue-400'
                : 'hover:text-slate-700 dark:hover:text-slate-300'
                }`}
            >
              Calendar
            </button>
            <button
              onClick={() => setActiveTab('TEAMS')}
              className={`transition pb-1 cursor-pointer ${activeTab === 'TEAMS'
                ? 'text-slate-900 dark:text-slate-100 font-bold border-b-2 border-blue-600 text-blue-600 dark:text-blue-400'
                : 'hover:text-slate-700 dark:hover:text-slate-300'
                }`}
            >
              Teams
            </button>
            <button
              onClick={() => setActiveTab('FAVORITE')}
              className={`transition pb-1 cursor-pointer ${activeTab === 'FAVORITE'
                ? 'text-slate-900 dark:text-slate-100 font-bold border-b-2 border-blue-600 text-blue-600 dark:text-blue-400'
                : 'hover:text-slate-700 dark:hover:text-slate-300'
                }`}
            >
              Favorites
            </button>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-400 font-medium">{currentMonthYear}</span>
          </div>
        </div>

        {/* Tab 1: CALENDAR VIEW */}
        {activeTab === 'CALENDAR' && (
          <div className="space-y-4">
            {/* Day Headers Row */}
            <div className="grid grid-cols-7 gap-2 text-center text-xs">
              {calendarDays.map((d, i) => (
                <div key={i} className="flex flex-col items-center">
                  <span className="font-bold text-sm text-slate-800 dark:text-slate-200">{d.day}</span>
                  <span className="text-[11px] text-slate-400">{d.label}</span>
                  {d.active && (
                    <div className="mt-1 flex flex-col items-center">
                      <div className="h-1.5 w-1.5 rounded-full bg-blue-600 mb-0.5" />
                      <span className="px-2 py-0.5 rounded-full bg-blue-600 text-white font-mono text-[10px] font-bold shadow-2xs">
                        {d.time}
                      </span>
                    </div>
                  )}
                </div>
              ))}
            </div>

            {/* Schedule Task Bands Row */}
            <div className="relative pt-2 space-y-3 min-h-[120px]">
              {scheduleItems.length === 0 ? (
                <div className="py-8 px-4 text-center rounded-2xl border border-dashed border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/40 flex flex-col items-center justify-center">
                  <Calendar className="h-6 w-6 text-slate-300 dark:text-slate-600 mb-1.5" />
                  <p className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                    No scheduled tasks or deadlines for this week
                  </p>
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    Tasks with target deadlines will automatically appear on your schedule.
                  </p>
                </div>
              ) : (
                scheduleItems.map((item, idx) => {
                  const isPurple = item.color === 'purple';
                  const isRose = item.color === 'rose';
                  const colorClasses = isPurple
                    ? 'bg-purple-500/20 dark:bg-purple-950/60 border-purple-300 dark:border-purple-800 text-purple-900 dark:text-purple-200'
                    : isRose
                      ? 'bg-rose-500/20 dark:bg-rose-950/60 border-rose-300 dark:border-rose-800 text-rose-900 dark:text-rose-200'
                      : 'bg-blue-500/20 dark:bg-blue-950/60 border-blue-300 dark:border-blue-800 text-blue-900 dark:text-blue-200';

                  const badgeColor = isPurple
                    ? 'bg-purple-700 text-white'
                    : isRose
                      ? 'bg-rose-700 text-white'
                      : 'bg-blue-700 text-white';

                  return (
                    <div key={item.id} className="relative h-10 w-full">
                      <div
                        onClick={() => {
                          if (item.type === 'PROJECT') {
                            handleNavigateProject(item.key, 'board');
                          } else {
                            handleOpenTicketByKey(item.key);
                          }
                        }}
                        style={{
                          left: `${item.span!.leftPct}%`,
                          width: `${item.span!.widthPct}%`,
                        }}
                        className={`absolute top-0 bottom-0 px-3 rounded-2xl border ${colorClasses} flex items-center justify-between gap-2 shadow-2xs hover:shadow-xs transition cursor-pointer group overflow-hidden`}
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <div className={`h-5 px-1.5 rounded-full ${badgeColor} text-[9px] font-bold flex items-center justify-center shrink-0`}>
                            {item.key}
                          </div>
                          <span className="text-xs font-bold truncate group-hover:underline">
                            {item.title}
                          </span>
                        </div>
                        <span className="text-[10px] font-mono opacity-80 shrink-0 hidden sm:inline">
                          {item.dueTime}
                        </span>
                      </div>
                    </div>
                  );
                })
              )}
              {upcomingDeadlines.length > 0 && (
                <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex flex-wrap items-center gap-2 text-[11px]">
                  <span className="text-slate-400 font-medium">Upcoming deadlines:</span>
                  {upcomingDeadlines.slice(0, 4).map((d) => (
                    <button
                      key={d.id}
                      onClick={() => handleNavigateProject(d.key, 'board')}
                      className="px-2 py-0.5 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-blue-50 dark:hover:bg-blue-950/50 text-slate-700 dark:text-slate-300 font-medium cursor-pointer"
                    >
                      {d.key} · {d.deadline ? new Date(d.deadline).toLocaleDateString([], { month: 'short', day: 'numeric' }) : 'Soon'}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Tab 2: TEAMS VIEW */}
        {activeTab === 'TEAMS' && (
          <div className="space-y-3">
            {teamsList.length === 0 ? (
              <div className="py-8 px-4 text-center rounded-2xl border border-dashed border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/40 flex flex-col items-center justify-center">
                <Users className="h-6 w-6 text-slate-300 dark:text-slate-600 mb-1.5" />
                <p className="text-xs font-semibold text-slate-700 dark:text-slate-300">No teams created yet</p>
                <p className="text-[11px] text-slate-400 mt-0.5">Create squads in the Teams module to see team distribution.</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                {teamsList.map((t) => (
                  <div
                    key={t.id}
                    onClick={() => router.push('/teams')}
                    className="p-3.5 rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/40 hover:bg-slate-100 dark:hover:bg-slate-800/80 transition cursor-pointer flex items-center justify-between"
                  >
                    <div>
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs font-bold text-slate-900 dark:text-slate-100">{t.name}</span>
                        <span className="text-[10px] font-mono text-blue-600 dark:text-blue-400 font-semibold">({t.keyPrefix})</span>
                      </div>
                      <span className="text-[11px] text-slate-400">{t.members?.length || 0} members</span>
                    </div>
                    <ChevronRight className="h-4 w-4 text-slate-400" />
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Tab 3: FAVORITES VIEW */}
        {activeTab === 'FAVORITE' && (() => {
          const favProjects = projectsHealth.filter((p) => favoriteKeys.includes(p.key));
          if (favProjects.length === 0) {
            return (
              <div className="py-8 px-4 text-center rounded-2xl border border-dashed border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/40 flex flex-col items-center justify-center">
                <Star className="h-6 w-6 text-slate-300 dark:text-slate-600 mb-1.5" />
                <p className="text-xs font-semibold text-slate-700 dark:text-slate-300">No favorite projects pinned</p>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  Click the star icon on any project card above to pin it here for quick access.
                </p>
              </div>
            );
          }
          return (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
              {favProjects.map((fp) => (
                <div
                  key={fp.id}
                  onClick={() => handleNavigateProject(fp.key, 'board')}
                  className="p-3.5 rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/40 hover:bg-slate-100 dark:hover:bg-slate-800/80 transition cursor-pointer flex items-center justify-between gap-2"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs font-bold text-slate-900 dark:text-slate-100 truncate">{fp.name}</span>
                      <span className="text-[10px] font-mono text-blue-600 dark:text-blue-400 font-semibold">({fp.key})</span>
                    </div>
                    <span className="text-[11px] text-slate-400">
                      {fp.completionPercentage || 0}% complete · {fp.totalTickets || 0} tasks
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleFavorite(fp.key);
                    }}
                    title="Unpin from Favorites"
                    className="p-1.5 rounded-lg hover:bg-white dark:hover:bg-slate-700 cursor-pointer shrink-0"
                  >
                    <Star className="h-4 w-4 fill-amber-400 text-amber-400" />
                  </button>
                </div>
              ))}
            </div>
          );
        })()}
      </section>

      {/* Ticket Detail Modal */}
      {selectedTicket && (
        <TicketDetailModal
          ticket={selectedTicket}
          onClose={() => setSelectedTicket(null)}
        />
      )}
    </div>
  );
}
