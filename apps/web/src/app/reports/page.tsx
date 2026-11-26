'use client';

import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useProject } from '../../context/ProjectContext';
import {
  fetchSprints,
  fetchSprintBurndown,
  fetchProjectVelocity,
  fetchProjectOverviewReport,
  fetchTicket,
  Sprint,
  SprintBurndownReport,
  VelocityReport,
  ProjectOverviewReport,
  Ticket,
} from '../../lib/api';
import { TicketDetailModal } from '../../components/kanban/TicketDetailModal';
import {
  TrendingDown,
  BarChart3,
  Calendar,
  Layers,
  Flame,
  CheckCircle2,
  Clock,
  Target,
  ArrowUpRight,
  Info,
  Download,
  LayoutGrid,
  Users,
  AlertTriangle,
  ShieldCheck,
  X,
} from 'lucide-react';

type ReportTab = 'overview' | 'burndown' | 'velocity' | 'workload';

export default function ReportsPage() {
  const { projects, activeProject, setSelectedProjectKey } = useProject();
  const [activeTab, setActiveTab] = useState<ReportTab>('overview');
  const [selectedSprintId, setSelectedSprintId] = useState<string>('');
  const [hoveredBurndownIdx, setHoveredBurndownIdx] = useState<number | null>(null);
  const [hoveredVelocityIdx, setHoveredVelocityIdx] = useState<number | null>(null);
  const [burndownStyle, setBurndownStyle] = useState<'smooth' | 'step' | 'linear'>('smooth');
  const [showIdealLine, setShowIdealLine] = useState(true);
  const [selectedReviewUserId, setSelectedReviewUserId] = useState<string>('');
  const [selectedTicket, setSelectedTicket] = useState<Ticket | null>(null);
  const [loadingTicketKey, setLoadingTicketKey] = useState<string | null>(null);

  const handleOpenTaskDetails = async (ticketKey: string) => {
    setLoadingTicketKey(ticketKey);
    try {
      const fullTicket = await fetchTicket(ticketKey);
      setSelectedTicket(fullTicket);
    } catch (err) {
      console.error('Failed to load task details:', err);
    } finally {
      setLoadingTicketKey(null);
    }
  };

  const projectKey = activeProject?.key || projects[0]?.key || '';

  const { data: sprints = [], isLoading: isLoadingSprints } = useQuery<Sprint[]>({
    queryKey: ['sprints', projectKey],
    queryFn: () => (projectKey ? fetchSprints(projectKey) : Promise.resolve([])),
    enabled: !!projectKey,
  });

  const activeSprint = sprints.find((s) => s.status === 'ACTIVE') || sprints[0];
  const currentSprintId =
    selectedSprintId && sprints.some((s) => s.id === selectedSprintId)
      ? selectedSprintId
      : activeSprint?.id || '';

  const { data: overviewReport, isLoading: isLoadingOverview } = useQuery<ProjectOverviewReport>({
    queryKey: ['reportOverview', projectKey],
    queryFn: () => fetchProjectOverviewReport(projectKey),
    enabled: !!projectKey,
  });

  const { data: burndownReport, isLoading: isLoadingBurndown } = useQuery<SprintBurndownReport>({
    queryKey: ['burndown', currentSprintId],
    queryFn: () => (currentSprintId ? fetchSprintBurndown(currentSprintId) : Promise.reject('No sprint')),
    enabled: !!currentSprintId,
  });

  const { data: velocityReport, isLoading: isLoadingVelocity } = useQuery<VelocityReport>({
    queryKey: ['velocity', projectKey],
    queryFn: () => fetchProjectVelocity(projectKey),
    enabled: !!projectKey,
  });

  const burndownData = burndownReport?.dataPoints || [];
  const maxBurndownPoints = Math.max(
    burndownReport?.sprint.totalPoints || 1,
    ...burndownData.map((d) => Math.max(d.idealPoints, d.remainingPoints)),
    10
  );

  const velocityHistory = velocityReport?.velocityHistory || [];
  const maxVelocityPoints = Math.max(
    ...velocityHistory.map((v) => Math.max(v.committedPoints, v.completedPoints)),
    20
  );

  const buildBurndownPath = (points: Array<{ x: number; y: number }>, mode: 'smooth' | 'step' | 'linear') => {
    if (points.length === 0) return '';
    if (points.length === 1) return `M ${points[0].x} ${points[0].y}`;
    if (mode === 'linear') {
      return points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');
    }
    if (mode === 'step') {
      let d = `M ${points[0].x} ${points[0].y}`;
      for (let i = 1; i < points.length; i++) {
        d += ` H ${points[i].x} V ${points[i].y}`;
      }
      return d;
    }
    let d = `M ${points[0].x} ${points[0].y}`;
    for (let i = 0; i < points.length - 1; i++) {
      const p0 = points[i];
      const p1 = points[i + 1];
      const cx = (p0.x + p1.x) / 2;
      d += ` C ${cx} ${p0.y}, ${cx} ${p1.y}, ${p1.x} ${p1.y}`;
    }
    return d;
  };

  const burndownSvgPoints = burndownData.map((d, i) => ({
    x: burndownData.length > 1 ? (i / (burndownData.length - 1)) * 1000 : 500,
    y: 400 - (d.remainingPoints / maxBurndownPoints) * 400,
  }));
  const burndownLinePath = buildBurndownPath(burndownSvgPoints, burndownStyle);
  const burndownAreaPath =
    burndownSvgPoints.length > 1
      ? `${burndownLinePath} L ${burndownSvgPoints[burndownSvgPoints.length - 1].x} 400 L ${burndownSvgPoints[0].x} 400 Z`
      : '';

  // CSV Export handler for current tab
  function handleExportCsv() {
    let rows: string[][] = [];
    let filename = `${projectKey || 'report'}-${activeTab}.csv`;

    if (activeTab === 'overview' && overviewReport) {
      rows = [
        ['Metric', 'Value'],
        ['Project', `${overviewReport.project.name} (${overviewReport.project.key})`],
        ['Total Tasks', String(overviewReport.summary.totalTickets)],
        ['Completed Tasks', String(overviewReport.summary.completedTickets)],
        ['In Progress Tasks', String(overviewReport.summary.inProgressTickets)],
        ['Overdue Tasks', String(overviewReport.summary.overdueTickets)],
        ['Completion Rate', `${overviewReport.summary.completionRate}%`],
        ['SLA Compliance Rate', `${overviewReport.summary.slaComplianceRate}%`],
      ];
    } else if (activeTab === 'burndown' && burndownReport) {
      rows = [
        ['Day', 'Ideal Remaining (pts)', 'Actual Remaining (pts)'],
        ...burndownData.map((d) => [d.day, String(d.idealPoints), String(d.remainingPoints)]),
      ];
    } else if (activeTab === 'velocity' && velocityReport) {
      rows = [
        ['Sprint', 'Status', 'Committed (pts)', 'Completed (pts)', 'Completion %'],
        ...velocityHistory.map((v) => [
          v.sprintName,
          v.status,
          String(v.committedPoints),
          String(v.completedPoints),
          v.committedPoints > 0 ? `${Math.round((v.completedPoints / v.committedPoints) * 100)}%` : '0%',
        ]),
      ];
    } else if (activeTab === 'workload' && overviewReport) {
      rows = [
        ['Assignee', 'Email', 'Total Tasks', 'Completed', 'In Progress', 'Overdue', 'Story Points'],
        ...overviewReport.workloadByAssignee.map((w) => [
          w.fullName,
          w.email,
          String(w.total),
          String(w.completed),
          String(w.inProgress),
          String(w.overdue),
          String(w.storyPoints),
        ]),
      ];
    }

    if (rows.length === 0) return;
    const csv = rows
      .map((r) => r.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(','))
      .join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="flex-1 flex flex-col min-w-0 max-w-6xl mx-auto w-full space-y-6">
      {/* Page Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-slate-200 dark:border-slate-800">
        <div>
          <h1 className="text-xl md:text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
            Reports & Analytics
          </h1>
          <p className="text-xs md:text-sm text-slate-500 dark:text-slate-400 mt-1">
            Project delivery metrics, sprint burndown, team velocity, and SLA compliance.
          </p>
        </div>

        {/* Project, Sprint & CSV Controls */}
        <div className="flex flex-wrap items-center gap-2.5">
          {projects.length > 0 && (
            <select
              value={projectKey}
              onChange={(e) => {
                setSelectedProjectKey(e.target.value);
                setSelectedSprintId('');
              }}
              className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-medium text-slate-800 dark:text-slate-200 focus:outline-none focus:border-blue-600 cursor-pointer"
            >
              {projects.map((p) => (
                <option key={p.id} value={p.key}>
                  {p.name} ({p.key})
                </option>
              ))}
            </select>
          )}

          {activeTab === 'burndown' && (
            <div className="relative flex items-center">
              <Layers className="h-3.5 w-3.5 text-slate-400 absolute left-2.5 pointer-events-none" />
              <select
                value={currentSprintId}
                onChange={(e) => setSelectedSprintId(e.target.value)}
                disabled={isLoadingSprints || sprints.length === 0}
                className="pl-8 pr-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-medium text-slate-800 dark:text-slate-200 focus:outline-none focus:border-blue-600 cursor-pointer disabled:opacity-50"
              >
                {sprints.length === 0 ? (
                  <option value="">No Sprints</option>
                ) : (
                  sprints.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name} ({s.status})
                    </option>
                  ))
                )}
              </select>
            </div>
          )}

          <button
            type="button"
            onClick={handleExportCsv}
            disabled={!projectKey}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800 text-xs font-medium text-slate-700 dark:text-slate-200 transition cursor-pointer disabled:opacity-40"
          >
            <Download className="h-3.5 w-3.5" />
            <span>Export CSV</span>
          </button>
        </div>
      </div>

      {/* Navigation Tabs */}
      <div className="flex items-center gap-1 border-b border-slate-200 dark:border-slate-800 overflow-x-auto">
        {(
          [
            { id: 'overview', label: 'Overview', icon: LayoutGrid },
            { id: 'burndown', label: 'Sprint Burndown', icon: TrendingDown },
            { id: 'velocity', label: 'Team Velocity', icon: BarChart3 },
            { id: 'workload', label: 'Workload & SLA', icon: Users },
          ] as const
        ).map((tab) => {
          const Icon = tab.icon;
          const active = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`inline-flex items-center gap-2 px-3.5 py-2.5 text-xs font-semibold border-b-2 transition whitespace-nowrap cursor-pointer ${
                active
                  ? 'border-blue-600 text-blue-600 dark:text-blue-400'
                  : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
              }`}
            >
              <Icon className="h-3.5 w-3.5" />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {!projectKey ? (
        <div className="py-16 text-center rounded-xl border border-dashed border-slate-200 dark:border-slate-800 text-xs text-slate-400">
          No projects found. Create a project to view analytics and reports.
        </div>
      ) : (
        <>
          {/* ══════════════════════════════════════════════════════════════════════
              TAB 1 — OVERVIEW
          ══════════════════════════════════════════════════════════════════════ */}
          {activeTab === 'overview' && (
            <div className="space-y-6">
              {isLoadingOverview ? (
                <div className="py-16 text-center text-xs text-slate-400">Loading project overview...</div>
              ) : overviewReport ? (
                <>
                  {/* KPI Cards */}
                  <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                    <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
                      <div className="flex items-center justify-between text-xs text-slate-500 mb-1.5">
                        <span>Total Tasks</span>
                        <Target className="h-4 w-4 text-slate-400" />
                      </div>
                      <div className="text-2xl font-bold text-slate-900 dark:text-slate-100">
                        {overviewReport.summary.totalTickets}
                      </div>
                      <p className="text-[11px] text-slate-400 mt-1">
                        {overviewReport.summary.inProgressTickets} active in progress
                      </p>
                    </div>

                    <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
                      <div className="flex items-center justify-between text-xs text-slate-500 mb-1.5">
                        <span>Completion Rate</span>
                        <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                      </div>
                      <div className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">
                        {overviewReport.summary.completionRate}%
                      </div>
                      <p className="text-[11px] text-slate-400 mt-1">
                        {overviewReport.summary.completedTickets} completed
                      </p>
                    </div>

                    <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
                      <div className="flex items-center justify-between text-xs text-slate-500 mb-1.5">
                        <span>Overdue Tasks</span>
                        <AlertTriangle className="h-4 w-4 text-amber-500" />
                      </div>
                      <div className="text-2xl font-bold text-amber-600 dark:text-amber-400">
                        {overviewReport.summary.overdueTickets}
                      </div>
                      <p className="text-[11px] text-slate-400 mt-1">Past target due date</p>
                    </div>

                    <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
                      <div className="flex items-center justify-between text-xs text-slate-500 mb-1.5">
                        <span>SLA Compliance</span>
                        <ShieldCheck className="h-4 w-4 text-blue-500" />
                      </div>
                      <div className="text-2xl font-bold text-blue-600 dark:text-blue-400">
                        {overviewReport.summary.slaComplianceRate}%
                      </div>
                      <p className="text-[11px] text-slate-400 mt-1">
                        {overviewReport.summary.breachedSlaCount} breached
                      </p>
                    </div>
                  </div>

                  {/* Status & Priority Breakdown */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                    <div className="p-5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 space-y-4">
                      <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                        Tasks by Status
                      </h3>
                      {overviewReport.statusBreakdown.length === 0 ? (
                        <p className="text-xs text-slate-400 italic py-4">No tasks recorded yet.</p>
                      ) : (
                        <div className="space-y-3">
                          {overviewReport.statusBreakdown.map((item) => {
                            const pct =
                              overviewReport.summary.totalTickets > 0
                                ? Math.round((item.count / overviewReport.summary.totalTickets) * 100)
                                : 0;
                            return (
                              <div key={item.status} className="space-y-1">
                                <div className="flex items-center justify-between text-xs">
                                  <span className="font-medium text-slate-700 dark:text-slate-300">
                                    {item.status.replace(/_/g, ' ')}
                                  </span>
                                  <span className="font-mono text-slate-500">
                                    {item.count} ({pct}%)
                                  </span>
                                </div>
                                <div className="h-2 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                                  <div
                                    style={{ width: `${pct}%` }}
                                    className="h-full rounded-full bg-blue-600 transition-all"
                                  />
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>

                    <div className="p-5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 space-y-4">
                      <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                        Tasks by Priority
                      </h3>
                      {overviewReport.priorityBreakdown.length === 0 ? (
                        <p className="text-xs text-slate-400 italic py-4">No tasks recorded yet.</p>
                      ) : (
                        <div className="space-y-3">
                          {overviewReport.priorityBreakdown.map((item) => {
                            const pct =
                              overviewReport.summary.totalTickets > 0
                                ? Math.round((item.count / overviewReport.summary.totalTickets) * 100)
                                : 0;
                            const barColor =
                              item.priority === 'URGENT'
                                ? 'bg-rose-600'
                                : item.priority === 'HIGH'
                                  ? 'bg-amber-500'
                                  : item.priority === 'MEDIUM'
                                    ? 'bg-blue-600'
                                    : 'bg-slate-400';
                            return (
                              <div key={item.priority} className="space-y-1">
                                <div className="flex items-center justify-between text-xs">
                                  <span className="font-medium text-slate-700 dark:text-slate-300">
                                    {item.priority}
                                  </span>
                                  <span className="font-mono text-slate-500">
                                    {item.count} ({pct}%)
                                  </span>
                                </div>
                                <div className="h-2 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                                  <div
                                    style={{ width: `${pct}%` }}
                                    className={`h-full rounded-full transition-all ${barColor}`}
                                  />
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Team Progress Summary */}
                  {overviewReport.teamBreakdown.length > 0 && (
                    <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden">
                      <div className="px-5 py-3.5 border-b border-slate-100 dark:border-slate-800">
                        <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                          Team Delivery Breakdown
                        </h3>
                      </div>
                      <div className="overflow-x-auto">
                        <table className="w-full text-left text-xs">
                          <thead>
                            <tr className="border-b border-slate-100 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/40 text-slate-500">
                              <th className="px-5 py-2.5 font-medium">Team</th>
                              <th className="px-5 py-2.5 font-medium">Total Tasks</th>
                              <th className="px-5 py-2.5 font-medium">In Progress</th>
                              <th className="px-5 py-2.5 font-medium">Completed</th>
                              <th className="px-5 py-2.5 font-medium text-right">Progress</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                            {overviewReport.teamBreakdown.map((tm) => {
                              const pct = tm.total > 0 ? Math.round((tm.completed / tm.total) * 100) : 0;
                              return (
                                <tr key={tm.teamId} className="hover:bg-slate-50/60 dark:hover:bg-slate-800/30">
                                  <td className="px-5 py-3 font-semibold text-slate-900 dark:text-slate-100">
                                    {tm.name}{' '}
                                    <span className="font-mono text-[10px] text-slate-400">({tm.keyPrefix})</span>
                                  </td>
                                  <td className="px-5 py-3 font-mono">{tm.total}</td>
                                  <td className="px-5 py-3 font-mono text-blue-600 dark:text-blue-400">{tm.inProgress}</td>
                                  <td className="px-5 py-3 font-mono text-emerald-600 dark:text-emerald-400">{tm.completed}</td>
                                  <td className="px-5 py-3 text-right font-mono font-semibold">{pct}%</td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                </>
              ) : null}
            </div>
          )}

          {/* ══════════════════════════════════════════════════════════════════════
              TAB 2 — SPRINT BURNDOWN
          ══════════════════════════════════════════════════════════════════════ */}
          {activeTab === 'burndown' && (
            <div className="space-y-5">
              {burndownReport && (
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                  <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
                    <div className="flex items-center justify-between text-xs text-slate-500 mb-1">
                      <span>Committed Scope</span>
                      <Target className="h-4 w-4 text-slate-400" />
                    </div>
                    <div className="text-2xl font-bold text-slate-900 dark:text-slate-100">
                      {burndownReport.sprint.totalPoints}{' '}
                      <span className="text-xs font-normal text-slate-400">pts</span>
                    </div>
                  </div>
                  <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
                    <div className="flex items-center justify-between text-xs text-slate-500 mb-1">
                      <span>Completed</span>
                      <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                    </div>
                    <div className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">
                      {burndownReport.sprint.completedPoints}{' '}
                      <span className="text-xs font-normal text-slate-400">pts</span>
                    </div>
                  </div>
                  <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
                    <div className="flex items-center justify-between text-xs text-slate-500 mb-1">
                      <span>Remaining</span>
                      <Flame className="h-4 w-4 text-amber-500" />
                    </div>
                    <div className="text-2xl font-bold text-amber-600 dark:text-amber-400">
                      {burndownReport.sprint.remainingPoints}{' '}
                      <span className="text-xs font-normal text-slate-400">pts</span>
                    </div>
                  </div>
                  <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
                    <div className="flex items-center justify-between text-xs text-slate-500 mb-1">
                      <span>Sprint Status</span>
                      <Clock className="h-4 w-4 text-blue-500" />
                    </div>
                    <div className="mt-1">
                      <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800">
                        {burndownReport.sprint.status}
                      </span>
                    </div>
                  </div>
                </div>
              )}

              {/* Interactive Burndown Chart Card */}
              <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden">
                <div className="px-5 py-3.5 border-b border-slate-100 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setShowIdealLine((v) => !v)}
                      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-medium border transition cursor-pointer ${
                        showIdealLine
                          ? 'border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-200'
                          : 'border-transparent text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800'
                      }`}
                    >
                      <span className="w-3 border-t-2 border-dashed border-slate-400" />
                      <span>Ideal Slope</span>
                    </button>
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-semibold bg-blue-50/70 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 border border-blue-200/70 dark:border-blue-900">
                      <span className="w-2 h-2 rounded-full bg-blue-600" />
                      <span>Actual Remaining</span>
                    </span>
                  </div>

                  <div className="inline-flex p-0.5 rounded-lg bg-slate-100 dark:bg-slate-800 border border-slate-200/70 dark:border-slate-700">
                    {(['smooth', 'step', 'linear'] as const).map((mode) => (
                      <button
                        key={mode}
                        type="button"
                        onClick={() => setBurndownStyle(mode)}
                        className={`px-2.5 py-1 rounded-md text-[11px] font-medium capitalize transition cursor-pointer ${
                          burndownStyle === mode
                            ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-2xs'
                            : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
                        }`}
                      >
                        {mode}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="p-6">
                  {isLoadingBurndown ? (
                    <div className="h-64 flex items-center justify-center text-xs text-slate-400">
                      Calculating burndown curve...
                    </div>
                  ) : burndownData.length === 0 ? (
                    <div className="h-64 flex flex-col items-center justify-center text-xs text-slate-400">
                      <Info className="h-8 w-8 text-slate-300 dark:text-slate-700 mb-2" />
                      <p>No sprint tickets with story points found for burndown calculation.</p>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      <div className="flex gap-3">
                        <div className="w-10 h-64 flex flex-col justify-between items-end pr-1 text-[11px] font-mono text-slate-400 select-none shrink-0">
                          {[1, 0.75, 0.5, 0.25, 0].map((pct) => (
                            <span key={pct} className="leading-none">
                              {Math.round(maxBurndownPoints * pct)}
                            </span>
                          ))}
                        </div>

                        <div
                          className="relative flex-1 h-64 select-none"
                          onMouseLeave={() => setHoveredBurndownIdx(null)}
                        >
                          <div className="absolute inset-0 flex flex-col justify-between pointer-events-none">
                            {[0, 1, 2, 3, 4].map((idx) => (
                              <div
                                key={idx}
                                className={`w-full border-t ${
                                  idx === 4
                                    ? 'border-slate-200 dark:border-slate-700'
                                    : 'border-dashed border-slate-200/70 dark:border-slate-800'
                                }`}
                              />
                            ))}
                          </div>

                          <svg
                            className="absolute inset-0 w-full h-full overflow-visible pointer-events-none"
                            viewBox="0 0 1000 400"
                            preserveAspectRatio="none"
                          >
                            <defs>
                              <linearGradient id="burndownGradient" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="0%" stopColor="#2563eb" stopOpacity="0.18" />
                                <stop offset="100%" stopColor="#2563eb" stopOpacity="0.0" />
                              </linearGradient>
                            </defs>

                            {burndownData.length > 1 && (
                              <>
                                {showIdealLine && (
                                  <line
                                    x1="0"
                                    y1={400 - (burndownData[0].idealPoints / maxBurndownPoints) * 400}
                                    x2="1000"
                                    y2={400 - (burndownData[burndownData.length - 1].idealPoints / maxBurndownPoints) * 400}
                                    stroke="#94a3b8"
                                    strokeWidth="1.75"
                                    strokeDasharray="5 5"
                                    vectorEffect="non-scaling-stroke"
                                  />
                                )}
                                <path d={burndownAreaPath} fill="url(#burndownGradient)" />
                                <path
                                  d={burndownLinePath}
                                  fill="none"
                                  stroke="#2563eb"
                                  strokeWidth="2.5"
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  vectorEffect="non-scaling-stroke"
                                />
                              </>
                            )}
                          </svg>

                          {burndownData.map((d, i) => {
                            const xPct = burndownData.length > 1 ? (i / (burndownData.length - 1)) * 100 : 50;
                            const yPct = (d.remainingPoints / maxBurndownPoints) * 100;
                            const idealYPct = (d.idealPoints / maxBurndownPoints) * 100;
                            const isHovered = hoveredBurndownIdx === i;

                            return (
                              <div
                                key={i}
                                onMouseEnter={() => setHoveredBurndownIdx(i)}
                                style={{ left: `${xPct}%` }}
                                className="absolute inset-y-0 -translate-x-1/2 w-9 flex items-center justify-center cursor-crosshair z-10"
                              >
                                {isHovered && (
                                  <>
                                    <div className="absolute inset-y-0 w-6 bg-slate-100/70 dark:bg-slate-800/40 pointer-events-none" />
                                    <div className="absolute inset-y-0 w-px bg-blue-500/50 pointer-events-none" />
                                    {showIdealLine && (
                                      <div
                                        style={{ bottom: `${idealYPct}%` }}
                                        className="absolute w-2.5 h-2.5 rounded-full bg-slate-400 border-2 border-white dark:border-slate-900 translate-y-1/2 pointer-events-none"
                                      />
                                    )}
                                  </>
                                )}
                                <div
                                  style={{ bottom: `${yPct}%` }}
                                  className={`absolute rounded-full border-2 border-blue-600 bg-white dark:bg-slate-900 translate-y-1/2 transition-all pointer-events-none ${
                                    isHovered ? 'w-3.5 h-3.5 ring-4 ring-blue-500/20' : 'w-2 h-2'
                                  }`}
                                />
                              </div>
                            );
                          })}

                          {hoveredBurndownIdx !== null && burndownData[hoveredBurndownIdx] && (() => {
                            const d = burndownData[hoveredBurndownIdx];
                            const xPct = burndownData.length > 1
                              ? (hoveredBurndownIdx / (burndownData.length - 1)) * 100
                              : 50;
                            const delta = Math.round((d.remainingPoints - d.idealPoints) * 10) / 10;
                            const alignRight = xPct > 70;
                            const alignLeft = xPct < 25;

                            return (
                              <div
                                style={{ left: `${xPct}%` }}
                                className={`absolute top-2 z-20 pointer-events-none ${
                                  alignRight ? '-translate-x-full -ml-3' : alignLeft ? 'translate-x-0 ml-3' : '-translate-x-1/2'
                                }`}
                              >
                                <div className="min-w-[175px] p-3 rounded-xl border border-slate-700 bg-slate-900 text-white shadow-xl text-xs space-y-1.5">
                                  <div className="font-semibold border-b border-slate-800 pb-1">{d.day}</div>
                                  <div className="flex items-center justify-between gap-4">
                                    <span className="text-slate-400">Actual</span>
                                    <span className="font-mono font-bold">{d.remainingPoints} pts</span>
                                  </div>
                                  {showIdealLine && (
                                    <div className="flex items-center justify-between gap-4">
                                      <span className="text-slate-400">Ideal</span>
                                      <span className="font-mono text-slate-300">{Math.round(d.idealPoints * 10) / 10} pts</span>
                                    </div>
                                  )}
                                  <div className="flex items-center justify-between gap-4 pt-1 border-t border-slate-800 text-[11px]">
                                    <span className="text-slate-400">Variance</span>
                                    <span className={`font-semibold ${delta <= 0 ? 'text-emerald-400' : 'text-amber-400'}`}>
                                      {delta <= 0 ? `${Math.abs(delta)} pts ahead` : `+${delta} pts behind`}
                                    </span>
                                  </div>
                                </div>
                              </div>
                            );
                          })()}
                        </div>
                      </div>

                      <div className="relative h-5 ml-13 pt-2">
                        {burndownData.map((d, i) => {
                          const step = burndownData.length > 10 ? Math.ceil(burndownData.length / 8) : 1;
                          const showLabel = i === 0 || i === burndownData.length - 1 || i % step === 0;
                          if (!showLabel) return null;
                          const xPct = burndownData.length > 1 ? (i / (burndownData.length - 1)) * 100 : 50;
                          return (
                            <span
                              key={i}
                              style={{ left: `${xPct}%` }}
                              className={`absolute top-2 text-[10px] font-medium whitespace-nowrap ${
                                hoveredBurndownIdx === i ? 'text-blue-600 font-semibold' : 'text-slate-400'
                              } ${
                                i === 0 ? 'translate-x-0' : i === burndownData.length - 1 ? '-translate-x-full' : '-translate-x-1/2'
                              }`}
                            >
                              {d.day}
                            </span>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* ══════════════════════════════════════════════════════════════════════
              TAB 3 — TEAM VELOCITY
          ══════════════════════════════════════════════════════════════════════ */}
          {activeTab === 'velocity' && (
            <div className="space-y-5">
              {velocityReport && (
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
                    <div className="flex items-center justify-between text-xs text-slate-500 mb-1">
                      <span>Average Velocity</span>
                      <ArrowUpRight className="h-4 w-4 text-blue-500" />
                    </div>
                    <div className="text-2xl font-bold text-blue-600 dark:text-blue-400">
                      {velocityReport.averageVelocity}{' '}
                      <span className="text-xs font-normal text-slate-400">pts / sprint</span>
                    </div>
                  </div>
                  <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
                    <div className="flex items-center justify-between text-xs text-slate-500 mb-1">
                      <span>Iterations Tracked</span>
                      <Calendar className="h-4 w-4 text-slate-400" />
                    </div>
                    <div className="text-2xl font-bold text-slate-900 dark:text-slate-100">
                      {velocityHistory.length}{' '}
                      <span className="text-xs font-normal text-slate-400">sprints</span>
                    </div>
                  </div>
                  <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
                    <div className="flex items-center justify-between text-xs text-slate-500 mb-1">
                      <span>Peak Output</span>
                      <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                    </div>
                    <div className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">
                      {Math.max(...velocityHistory.map((v) => v.completedPoints), 0)}{' '}
                      <span className="text-xs font-normal text-slate-400">pts</span>
                    </div>
                  </div>
                </div>
              )}

              <div className="p-6 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
                {isLoadingVelocity ? (
                  <div className="h-64 flex items-center justify-center text-xs text-slate-400">
                    Aggregating velocity metrics...
                  </div>
                ) : velocityHistory.length === 0 ? (
                  <div className="h-64 flex flex-col items-center justify-center text-xs text-slate-400">
                    <Info className="h-8 w-8 text-slate-300 dark:text-slate-700 mb-2" />
                    <p>No sprint history recorded for this project yet.</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    <div className="flex gap-3">
                      <div className="w-10 h-64 flex flex-col justify-between items-end pr-1 text-[11px] font-mono text-slate-400 select-none shrink-0">
                        {[1, 0.75, 0.5, 0.25, 0].map((pct) => (
                          <span key={pct} className="leading-none">
                            {Math.round(maxVelocityPoints * pct)}
                          </span>
                        ))}
                      </div>

                      <div
                        className="relative flex-1 h-64 flex items-end justify-between gap-4 px-4"
                        onMouseLeave={() => setHoveredVelocityIdx(null)}
                      >
                        <div className="absolute inset-0 flex flex-col justify-between pointer-events-none">
                          {[0, 1, 2, 3, 4].map((idx) => (
                            <div
                              key={idx}
                              className={`w-full border-t ${
                                idx === 4
                                  ? 'border-slate-200 dark:border-slate-700'
                                  : 'border-dashed border-slate-200/70 dark:border-slate-800'
                              }`}
                            />
                          ))}
                        </div>

                        {velocityHistory.map((sprint, idx) => {
                          const committedHeight = Math.max((sprint.committedPoints / maxVelocityPoints) * 100, 1.5);
                          const completedHeight = Math.max((sprint.completedPoints / maxVelocityPoints) * 100, 1.5);
                          const completionRate =
                            sprint.committedPoints > 0
                              ? Math.round((sprint.completedPoints / sprint.committedPoints) * 100)
                              : 0;
                          const isHovered = hoveredVelocityIdx === idx;

                          return (
                            <div
                              key={idx}
                              onMouseEnter={() => setHoveredVelocityIdx(idx)}
                              className={`relative flex-1 flex flex-col items-center h-full justify-end z-10 cursor-pointer rounded-t-xl transition ${
                                isHovered ? 'bg-slate-50/80 dark:bg-slate-800/30' : ''
                              }`}
                            >
                              {isHovered && (
                                <div className="absolute -top-2 -translate-y-full z-20 pointer-events-none">
                                  <div className="min-w-[160px] p-3 rounded-xl border border-slate-700 bg-slate-900 text-white shadow-xl text-xs space-y-1">
                                    <div className="font-semibold truncate border-b border-slate-800 pb-1">
                                      {sprint.sprintName}
                                    </div>
                                    <div className="flex items-center justify-between gap-3 text-[11px]">
                                      <span className="text-slate-400">Committed</span>
                                      <span className="font-mono font-semibold">{sprint.committedPoints} pts</span>
                                    </div>
                                    <div className="flex items-center justify-between gap-3 text-[11px]">
                                      <span className="text-blue-400">Completed</span>
                                      <span className="font-mono font-bold text-blue-400">{sprint.completedPoints} pts</span>
                                    </div>
                                    <div className="flex items-center justify-between gap-3 pt-1 border-t border-slate-800 text-[10px]">
                                      <span className="text-slate-400">Completion</span>
                                      <span className="font-semibold text-emerald-400">{completionRate}%</span>
                                    </div>
                                  </div>
                                </div>
                              )}

                              <div className="w-full max-w-[68px] flex items-end justify-center gap-1.5 h-full px-1">
                                <div
                                  style={{ height: `${committedHeight}%` }}
                                  className="w-1/2 rounded-t-md bg-slate-200 dark:bg-slate-700 transition-all duration-300"
                                />
                                <div
                                  style={{ height: `${completedHeight}%` }}
                                  className={`w-1/2 rounded-t-md transition-all duration-300 ${
                                    isHovered ? 'bg-blue-700 dark:bg-blue-400' : 'bg-blue-600 dark:bg-blue-500'
                                  }`}
                                />
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    <div className="ml-13 flex items-start justify-between gap-4 px-4 pt-2.5">
                      {velocityHistory.map((sprint, idx) => (
                        <div key={idx} className="flex-1 flex flex-col items-center min-w-0">
                          <span className="text-xs font-semibold text-slate-700 dark:text-slate-300 truncate max-w-full text-center">
                            {sprint.sprintName}
                          </span>
                          <span className="text-[10px] text-slate-400 uppercase font-mono">
                            {sprint.completedPoints}/{sprint.committedPoints} pts · {sprint.status}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ══════════════════════════════════════════════════════════════════════
              TAB 4 — WORKLOAD & SLA
          ══════════════════════════════════════════════════════════════════════ */}
          {activeTab === 'workload' && (
            <div className="space-y-5">
              {isLoadingOverview ? (
                <div className="py-16 text-center text-xs text-slate-400">Loading workload distribution...</div>
              ) : overviewReport ? (
                <>
                  {/* User-Specific Review Selector Bar */}
                  <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-5 py-3.5 flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                        User-Specific Performance & SLA Review
                      </h3>
                      <p className="text-xs text-slate-400">
                        Select any member below (or click a row) to inspect their individual task delivery and SLA compliance
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <select
                        value={selectedReviewUserId}
                        onChange={(e) => setSelectedReviewUserId(e.target.value)}
                        className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-medium text-slate-800 dark:text-slate-200 focus:outline-none focus:border-blue-600 cursor-pointer"
                      >
                        <option value="">-- Select Member to Review --</option>
                        {overviewReport.workloadByAssignee.map((w) => (
                          <option key={w.userId} value={w.userId}>
                            {w.fullName} ({w.completed}/{w.total} done · {w.slaComplianceRate}% SLA)
                          </option>
                        ))}
                      </select>
                      {selectedReviewUserId && (
                        <button
                          type="button"
                          onClick={() => setSelectedReviewUserId('')}
                          className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 cursor-pointer"
                          title="Clear selection"
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Selected User Review Panel */}
                  {(() => {
                    const reviewedUser = overviewReport.workloadByAssignee.find(
                      (w) => w.userId === selectedReviewUserId
                    );
                    if (!reviewedUser) return null;

                    const userCompletionPct =
                      reviewedUser.total > 0
                        ? Math.round((reviewedUser.completed / reviewedUser.total) * 100)
                        : 0;

                    const reviewStanding =
                      reviewedUser.slaComplianceRate >= 90 && reviewedUser.overdue === 0
                        ? {
                            label: 'Exceeding / On Track',
                            classes:
                              'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/60 dark:text-emerald-300 dark:border-emerald-800',
                          }
                        : reviewedUser.slaComplianceRate >= 75 && reviewedUser.overdue <= 2
                          ? {
                              label: 'Moderate Risk',
                              classes:
                                'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/60 dark:text-amber-300 dark:border-amber-800',
                            }
                          : {
                              label: 'Needs Attention',
                              classes:
                                'bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/60 dark:text-rose-300 dark:border-rose-800',
                            };

                    return (
                      <div className="rounded-xl border border-blue-200/80 dark:border-blue-900/60 bg-white dark:bg-slate-900 overflow-hidden shadow-2xs">
                        <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-800 bg-blue-50/40 dark:bg-blue-950/20 flex flex-wrap items-center justify-between gap-3">
                          <div className="flex items-center gap-3">
                            <div className="h-9 w-9 rounded-full bg-blue-600 text-white font-bold text-sm flex items-center justify-center">
                              {reviewedUser.fullName[0]}
                            </div>
                            <div>
                              <div className="flex items-center gap-2">
                                <span className="text-sm font-bold text-slate-900 dark:text-slate-100">
                                  {reviewedUser.fullName}
                                </span>
                                <span
                                  className={`px-2 py-0.5 rounded-full text-[10px] font-semibold border ${reviewStanding.classes}`}
                                >
                                  {reviewStanding.label}
                                </span>
                              </div>
                              {reviewedUser.email && (
                                <div className="text-[11px] font-mono text-slate-400">{reviewedUser.email}</div>
                              )}
                            </div>
                          </div>

                          <div className="text-xs font-mono text-slate-500">
                            {reviewedUser.total} assigned tasks · {reviewedUser.storyPoints} story pts
                          </div>
                        </div>

                        {/* User KPI Row */}
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 p-5 border-b border-slate-100 dark:border-slate-800">
                          <div className="p-3 rounded-lg border border-slate-200/80 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-800/40">
                            <div className="text-[11px] text-slate-500">Completion Rate</div>
                            <div className="text-lg font-bold text-slate-900 dark:text-slate-100 mt-0.5">
                              {userCompletionPct}%
                            </div>
                            <div className="text-[10px] text-slate-400">
                              {reviewedUser.completed} of {reviewedUser.total} done
                            </div>
                          </div>

                          <div className="p-3 rounded-lg border border-slate-200/80 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-800/40">
                            <div className="text-[11px] text-slate-500">SLA Compliance</div>
                            <div
                              className={`text-lg font-bold mt-0.5 ${
                                reviewedUser.slaComplianceRate >= 90
                                  ? 'text-emerald-600 dark:text-emerald-400'
                                  : reviewedUser.slaComplianceRate >= 75
                                    ? 'text-amber-600 dark:text-amber-400'
                                    : 'text-rose-600 dark:text-rose-400'
                              }`}
                            >
                              {reviewedUser.slaComplianceRate}%
                            </div>
                            <div className="text-[10px] text-slate-400">
                              {reviewedUser.slaBreached} breached / {reviewedUser.slaTracked} tracked
                            </div>
                          </div>

                          <div className="p-3 rounded-lg border border-slate-200/80 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-800/40">
                            <div className="text-[11px] text-slate-500">Overdue & Blocked</div>
                            <div className="text-lg font-bold text-rose-600 dark:text-rose-400 mt-0.5">
                              {reviewedUser.overdue}{' '}
                              <span className="text-xs font-normal text-slate-400">
                                overdue · {reviewedUser.blocked} blocked
                              </span>
                            </div>
                            <div className="text-[10px] text-slate-400">Immediate attention items</div>
                          </div>

                          <div className="p-3 rounded-lg border border-slate-200/80 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-800/40">
                            <div className="text-[11px] text-slate-500">In Progress / Review</div>
                            <div className="text-lg font-bold text-blue-600 dark:text-blue-400 mt-0.5">
                              {reviewedUser.inProgress}
                            </div>
                            <div className="text-[10px] text-slate-400">
                              {reviewedUser.inReview} awaiting review/approval
                            </div>
                          </div>
                        </div>

                        {/* User Task & SLA Audit Table */}
                        <div className="overflow-x-auto max-h-80">
                          <table className="w-full text-left text-xs">
                            <thead className="sticky top-0 bg-slate-50 dark:bg-slate-800 border-b border-slate-100 dark:border-slate-700 text-slate-500">
                              <tr>
                                <th className="px-5 py-2.5 font-medium">Task</th>
                                <th className="px-5 py-2.5 font-medium">Status</th>
                                <th className="px-5 py-2.5 font-medium">Priority</th>
                                <th className="px-5 py-2.5 font-medium">Due Date</th>
                                <th className="px-5 py-2.5 font-medium">SLA</th>
                                <th className="px-5 py-2.5 font-medium text-right">Open</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                              {reviewedUser.tickets.map((t) => (
                                <tr
                                  key={t.id}
                                  onClick={() => handleOpenTaskDetails(t.ticketKey)}
                                  className="hover:bg-slate-50/60 dark:hover:bg-slate-800/30 cursor-pointer"
                                >
                                  <td className="px-5 py-2.5">
                                    <div className="flex items-center gap-2">
                                      <span className="font-mono text-[11px] font-bold text-blue-600 dark:text-blue-400">
                                        {t.ticketKey}
                                      </span>
                                      <span className="font-medium text-slate-800 dark:text-slate-200 truncate max-w-xs">
                                        {t.title}
                                      </span>
                                    </div>
                                  </td>
                                  <td className="px-5 py-2.5">
                                    <span className="px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-[10px] font-semibold">
                                      {t.status.replace('_', ' ')}
                                    </span>
                                  </td>
                                  <td className="px-5 py-2.5 text-[11px] font-medium text-slate-600 dark:text-slate-300">
                                    {t.priority}
                                  </td>
                                  <td className="px-5 py-2.5 font-mono text-[11px]">
                                    {t.dueDate ? (
                                      <span className={t.isOverdue ? 'text-rose-600 font-semibold' : 'text-slate-500'}>
                                        {new Date(t.dueDate).toLocaleDateString()}
                                        {t.isOverdue ? ' (Overdue)' : ''}
                                      </span>
                                    ) : (
                                      <span className="text-slate-400">—</span>
                                    )}
                                  </td>
                                  <td className="px-5 py-2.5 text-[11px]">
                                    {t.slaResolutionDueAt ? (
                                      t.isSlaBreached ? (
                                        <span className="px-2 py-0.5 rounded-full bg-rose-50 dark:bg-rose-950/60 text-rose-600 dark:text-rose-300 font-semibold">
                                          Breached
                                        </span>
                                      ) : (
                                        <span className="px-2 py-0.5 rounded-full bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 font-semibold">
                                          On Time
                                        </span>
                                      )
                                    ) : (
                                      <span className="text-slate-400">No SLA</span>
                                    )}
                                  </td>
                                  <td className="px-5 py-2.5 text-right">
                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        handleOpenTaskDetails(t.ticketKey);
                                      }}
                                      disabled={loadingTicketKey === t.ticketKey}
                                      className="inline-flex items-center gap-1 text-[11px] font-semibold text-blue-600 hover:underline cursor-pointer disabled:opacity-50"
                                    >
                                      <span>{loadingTicketKey === t.ticketKey ? 'Loading...' : 'View'}</span>
                                      <ArrowUpRight className="h-3 w-3" />
                                    </button>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    );
                  })()}

                  {/* Team Assignee Workload Table */}
                  <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden">
                    <div className="px-5 py-3.5 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
                      <div>
                        <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                          Assignee Workload Distribution
                        </h3>
                        <p className="text-xs text-slate-400">
                          Task allocation, SLA compliance, and overdue counts per member
                        </p>
                      </div>
                      <span className="text-xs font-mono text-slate-500">
                        Project SLA Compliance: <strong>{overviewReport.summary.slaComplianceRate}%</strong>
                      </span>
                    </div>

                    {overviewReport.workloadByAssignee.length === 0 ? (
                      <div className="py-12 text-center text-xs text-slate-400">
                        No tasks found in this project yet.
                      </div>
                    ) : (
                      <div className="overflow-x-auto">
                        <table className="w-full text-left text-xs">
                          <thead>
                            <tr className="border-b border-slate-100 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/40 text-slate-500">
                              <th className="px-5 py-2.5 font-medium">Assignee</th>
                              <th className="px-5 py-2.5 font-medium">Total</th>
                              <th className="px-5 py-2.5 font-medium">In Progress</th>
                              <th className="px-5 py-2.5 font-medium">Completed</th>
                              <th className="px-5 py-2.5 font-medium">Overdue</th>
                              <th className="px-5 py-2.5 font-medium">SLA %</th>
                              <th className="px-5 py-2.5 font-medium">Story Points</th>
                              <th className="px-5 py-2.5 font-medium text-right">Completion</th>
                              <th className="px-5 py-2.5 font-medium text-right">Review</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                            {overviewReport.workloadByAssignee.map((w) => {
                              const pct = w.total > 0 ? Math.round((w.completed / w.total) * 100) : 0;
                              const isSelected = selectedReviewUserId === w.userId;
                              return (
                                <tr
                                  key={w.userId}
                                  onClick={() => setSelectedReviewUserId(isSelected ? '' : w.userId)}
                                  className={`cursor-pointer transition ${
                                    isSelected
                                      ? 'bg-blue-50/70 dark:bg-blue-950/30'
                                      : 'hover:bg-slate-50/60 dark:hover:bg-slate-800/30'
                                  }`}
                                >
                                  <td className="px-5 py-3">
                                    <div className="font-semibold text-slate-900 dark:text-slate-100">{w.fullName}</div>
                                    {w.email && (
                                      <div className="text-[10px] font-mono text-slate-400">{w.email}</div>
                                    )}
                                  </td>
                                  <td className="px-5 py-3 font-mono font-semibold">{w.total}</td>
                                  <td className="px-5 py-3 font-mono text-blue-600 dark:text-blue-400">{w.inProgress}</td>
                                  <td className="px-5 py-3 font-mono text-emerald-600 dark:text-emerald-400">{w.completed}</td>
                                  <td className="px-5 py-3 font-mono">
                                    {w.overdue > 0 ? (
                                      <span className="px-2 py-0.5 rounded-full bg-rose-50 dark:bg-rose-950/60 text-rose-600 dark:text-rose-400 font-semibold">
                                        {w.overdue}
                                      </span>
                                    ) : (
                                      <span className="text-slate-400">0</span>
                                    )}
                                  </td>
                                  <td className="px-5 py-3 font-mono">
                                    <span
                                      className={`font-semibold ${
                                        w.slaComplianceRate >= 90
                                          ? 'text-emerald-600 dark:text-emerald-400'
                                          : w.slaComplianceRate >= 75
                                            ? 'text-amber-600 dark:text-amber-400'
                                            : 'text-rose-600 dark:text-rose-400'
                                      }`}
                                    >
                                      {w.slaComplianceRate}%
                                    </span>
                                  </td>
                                  <td className="px-5 py-3 font-mono">{w.storyPoints} pts</td>
                                  <td className="px-5 py-3 text-right">
                                    <div className="inline-flex items-center gap-2">
                                      <div className="w-16 h-1.5 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                                        <div
                                          style={{ width: `${pct}%` }}
                                          className="h-full rounded-full bg-blue-600"
                                        />
                                      </div>
                                      <span className="font-mono font-semibold w-8 text-right">{pct}%</span>
                                    </div>
                                  </td>
                                  <td className="px-5 py-3 text-right">
                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setSelectedReviewUserId(isSelected ? '' : w.userId);
                                      }}
                                      className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold transition cursor-pointer ${
                                        isSelected
                                          ? 'bg-blue-600 text-white'
                                          : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-blue-50 hover:text-blue-600'
                                      }`}
                                    >
                                      {isSelected ? 'Close' : 'Review'}
                                    </button>
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                </>
              ) : null}
            </div>
          )}
        </>
      )}

      {selectedTicket && (
        <TicketDetailModal
          ticket={selectedTicket}
          onClose={() => setSelectedTicket(null)}
        />
      )}
    </div>
  );
}
