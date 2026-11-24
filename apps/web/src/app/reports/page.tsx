'use client';

import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useProject } from '../../context/ProjectContext';
import {
  fetchSprints,
  fetchSprintBurndown,
  fetchProjectVelocity,
  Sprint,
  SprintBurndownReport,
  VelocityReport,
} from '../../lib/api';
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
} from 'lucide-react';

export default function ReportsPage() {
  const { activeProject } = useProject();
  const [selectedSprintId, setSelectedSprintId] = useState<string>('');

  // Fetch sprints for active project
  const { data: sprints = [], isLoading: isLoadingSprints } = useQuery<Sprint[]>({
    queryKey: ['sprints', activeProject?.key],
    queryFn: () => (activeProject ? fetchSprints(activeProject.key) : Promise.resolve([])),
    enabled: !!activeProject,
  });

  // Default selected sprint to first active or planning sprint
  const activeSprint = sprints.find((s) => s.status === 'ACTIVE') || sprints[0];
  const currentSprintId = selectedSprintId || activeSprint?.id || '';

  // Fetch Burndown Chart Data
  const {
    data: burndownReport,
    isLoading: isLoadingBurndown,
  } = useQuery<SprintBurndownReport>({
    queryKey: ['burndown', currentSprintId],
    queryFn: () => (currentSprintId ? fetchSprintBurndown(currentSprintId) : Promise.reject('No sprint')),
    enabled: !!currentSprintId,
  });

  // Fetch Team Velocity Chart Data
  const {
    data: velocityReport,
    isLoading: isLoadingVelocity,
  } = useQuery<VelocityReport>({
    queryKey: ['velocity', activeProject?.key],
    queryFn: () => fetchProjectVelocity(activeProject?.key || 'CORE'),
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

  return (
    <div className="flex-1 flex flex-col min-w-0">
      {/* Standard Page Header */}
      <div className="mb-6 flex flex-col gap-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-xl md:text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100 flex items-center gap-2">
              <BarChart3 className="h-6 w-6 text-blue-600 dark:text-blue-400" />
              Reports
            </h1>
            <p className="text-xs md:text-sm text-slate-500 dark:text-slate-400 mt-1">
              Sprint burndown and team velocity metrics.
            </p>
          </div>

          {/* Sprint Selector */}
          <div className="flex items-center gap-3">
            <div className="relative">
              <label className="block text-[10px] font-semibold uppercase text-slate-400 mb-1">
                Active Sprint
              </label>
              <div className="relative flex items-center">
                <select
                  value={currentSprintId}
                  onChange={(e) => setSelectedSprintId(e.target.value)}
                  disabled={isLoadingSprints || sprints.length === 0}
                  className="pl-8 pr-8 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-xs font-semibold text-slate-800 dark:text-slate-200 shadow-2xs focus:outline-none focus:border-blue-600 focus:ring-1 focus:ring-blue-600 cursor-pointer disabled:opacity-50"
                >
                  {sprints.length === 0 ? (
                    <option value="">No Sprints Available</option>
                  ) : (
                    sprints.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name} ({s.status})
                      </option>
                    ))
                  )}
                </select>
                <Layers className="h-4 w-4 text-slate-400 absolute left-2.5 pointer-events-none" />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Dashboard Content */}
      <div className="space-y-8 w-full">
          {/* SECTION 1: SPRINT BURNDOWN */}
          <section className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="p-1.5 rounded-lg bg-blue-50 dark:bg-blue-950/60 border border-blue-200 dark:border-blue-900 text-blue-600 dark:text-blue-400">
                  <TrendingDown className="h-5 w-5" />
                </div>
                <div>
                  <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">
                    Sprint Burndown Chart
                  </h2>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Ideal burn slope vs actual remaining story points across the sprint timeframe.
                  </p>
                </div>
              </div>

              {burndownReport && (
                <div className="flex items-center gap-4 text-xs">
                  <div className="flex items-center gap-1.5">
                    <span className="w-3 h-0.5 border-t-2 border-dashed border-slate-400"></span>
                    <span className="text-slate-500 font-medium">Ideal Guideline</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="w-3 h-1 bg-blue-600 rounded-full"></span>
                    <span className="text-blue-600 dark:text-blue-400 font-semibold">
                      Actual Remaining
                    </span>
                  </div>
                </div>
              )}
            </div>

            {/* Burndown KPI Cards */}
            {burndownReport && (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                <div className="p-4 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-2xs">
                  <div className="flex items-center justify-between text-xs text-slate-500 mb-1">
                    <span>Committed Scope</span>
                    <Target className="h-4 w-4 text-slate-400" />
                  </div>
                  <div className="text-2xl font-bold text-slate-900 dark:text-slate-100">
                    {burndownReport.sprint.totalPoints}{' '}
                    <span className="text-xs font-normal text-slate-400">pts</span>
                  </div>
                </div>

                <div className="p-4 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-2xs">
                  <div className="flex items-center justify-between text-xs text-slate-500 mb-1">
                    <span>Completed Points</span>
                    <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                  </div>
                  <div className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">
                    {burndownReport.sprint.completedPoints}{' '}
                    <span className="text-xs font-normal text-slate-400">pts</span>
                  </div>
                </div>

                <div className="p-4 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-2xs">
                  <div className="flex items-center justify-between text-xs text-slate-500 mb-1">
                    <span>Remaining Points</span>
                    <Flame className="h-4 w-4 text-amber-500" />
                  </div>
                  <div className="text-2xl font-bold text-amber-600 dark:text-amber-400">
                    {burndownReport.sprint.remainingPoints}{' '}
                    <span className="text-xs font-normal text-slate-400">pts</span>
                  </div>
                </div>

                <div className="p-4 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-2xs">
                  <div className="flex items-center justify-between text-xs text-slate-500 mb-1">
                    <span>Sprint Status</span>
                    <Clock className="h-4 w-4 text-blue-500" />
                  </div>
                  <div className="text-sm font-bold text-slate-900 dark:text-slate-100 uppercase tracking-wider mt-1">
                    <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800">
                      {burndownReport.sprint.status}
                    </span>
                  </div>
                </div>
              </div>
            )}

            {/* SVG Interactive Burndown Graph */}
            <div className="p-6 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-2xs">
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
                <div className="space-y-4">
                  {/* Chart Container */}
                  <div className="relative h-64 w-full">
                    <svg className="w-full h-full overflow-visible" viewBox="0 0 800 240" preserveAspectRatio="none">
                      {/* Grid Lines */}
                      {[0, 0.25, 0.5, 0.75, 1].map((pct, idx) => {
                        const y = 200 - pct * 180;
                        return (
                          <g key={idx}>
                            <line
                              x1="40"
                              y1={y}
                              x2="780"
                              y2={y}
                              stroke="currentColor"
                              className="text-slate-100 dark:text-slate-800/60"
                              strokeWidth="1"
                            />
                            <text
                              x="32"
                              y={y + 4}
                              textAnchor="end"
                              className="text-[10px] fill-slate-400"
                            >
                              {Math.round(maxBurndownPoints * pct)}
                            </text>
                          </g>
                        );
                      })}

                      {/* Ideal Burndown Dashed Line */}
                      {burndownData.length > 1 && (
                        <line
                          x1="50"
                          y1={200 - (burndownData[0].idealPoints / maxBurndownPoints) * 180}
                          x2="770"
                          y2={200 - (burndownData[burndownData.length - 1].idealPoints / maxBurndownPoints) * 180}
                          stroke="#94a3b8"
                          strokeWidth="2"
                          strokeDasharray="6 4"
                        />
                      )}

                      {/* Actual Burndown Polyline & Fill Area */}
                      {burndownData.length > 1 && (
                        <>
                          <polygon
                            points={`50,200 ${burndownData
                              .map((d, i) => {
                                const x = 50 + (i / (burndownData.length - 1)) * 720;
                                const y = 200 - (d.remainingPoints / maxBurndownPoints) * 180;
                                return `${x},${y}`;
                              })
                              .join(' ')} 770,200`}
                            fill="url(#burndownGradient)"
                            className="opacity-20"
                          />
                          <polyline
                            points={burndownData
                              .map((d, i) => {
                                const x = 50 + (i / (burndownData.length - 1)) * 720;
                                const y = 200 - (d.remainingPoints / maxBurndownPoints) * 180;
                                return `${x},${y}`;
                              })
                              .join(' ')}
                            fill="none"
                            stroke="#2563eb"
                            strokeWidth="3"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                        </>
                      )}

                      {/* Data Point Nodes */}
                      {burndownData.map((d, i) => {
                        const x = 50 + (i / (burndownData.length - 1)) * 720;
                        const y = 200 - (d.remainingPoints / maxBurndownPoints) * 180;
                        return (
                          <g key={i} className="group">
                            <circle
                              cx={x}
                              cy={y}
                              r="5"
                              className="fill-white dark:fill-slate-900 stroke-blue-600 stroke-[3] transition-transform group-hover:scale-125"
                            />
                            <text
                              x={x}
                              y={y - 10}
                              textAnchor="middle"
                              className="text-[10px] font-bold fill-blue-600 dark:fill-blue-400 opacity-0 group-hover:opacity-100 transition"
                            >
                              {d.remainingPoints} pts
                            </text>
                          </g>
                        );
                      })}

                      {/* Gradients */}
                      <defs>
                        <linearGradient id="burndownGradient" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="#2563eb" stopOpacity="0.4" />
                          <stop offset="100%" stopColor="#2563eb" stopOpacity="0" />
                        </linearGradient>
                      </defs>
                    </svg>
                  </div>

                  {/* X Axis Labels */}
                  <div className="flex justify-between pl-8 pr-4 text-[10px] font-medium text-slate-400 border-t border-slate-100 dark:border-slate-800 pt-2">
                    {burndownData.map((d, i) => (
                      <span key={i} className="text-center truncate">
                        {d.day}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </section>

          {/* SECTION 2: TEAM HISTORICAL VELOCITY */}
          <section className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="p-1.5 rounded-lg bg-blue-50 dark:bg-blue-950/60 border border-blue-200 dark:border-blue-900 text-blue-600 dark:text-blue-400">
                  <BarChart3 className="h-5 w-5" />
                </div>
                <div>
                  <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">
                    Team Velocity History
                  </h2>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Committed capacity vs actual completed story points across the last 6 iterations.
                  </p>
                </div>
              </div>

              {velocityReport && (
                <div className="flex items-center gap-4 text-xs">
                  <div className="flex items-center gap-1.5">
                    <span className="w-3 h-3 bg-slate-300 dark:bg-slate-700 rounded-sm"></span>
                    <span className="text-slate-500 font-medium">Committed Points</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="w-3 h-3 bg-blue-600 rounded-sm"></span>
                    <span className="text-blue-600 dark:text-blue-400 font-semibold">
                      Completed Points
                    </span>
                  </div>
                </div>
              )}
            </div>

            {/* Velocity Average Header Metric */}
            {velocityReport && (
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="p-4 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-2xs">
                  <div className="flex items-center justify-between text-xs text-slate-500 mb-1">
                    <span>Average Velocity</span>
                    <ArrowUpRight className="h-4 w-4 text-blue-500" />
                  </div>
                  <div className="text-2xl font-bold text-blue-600 dark:text-blue-400">
                    {velocityReport.averageVelocity}{' '}
                    <span className="text-xs font-normal text-slate-400">pts / sprint</span>
                  </div>
                </div>

                <div className="p-4 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-2xs">
                  <div className="flex items-center justify-between text-xs text-slate-500 mb-1">
                    <span>Iterations Tracked</span>
                    <Calendar className="h-4 w-4 text-slate-400" />
                  </div>
                  <div className="text-2xl font-bold text-slate-900 dark:text-slate-100">
                    {velocityHistory.length}{' '}
                    <span className="text-xs font-normal text-slate-400">sprints</span>
                  </div>
                </div>

                <div className="p-4 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-2xs">
                  <div className="flex items-center justify-between text-xs text-slate-500 mb-1">
                    <span>Max Sprint Output</span>
                    <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                  </div>
                  <div className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">
                    {Math.max(...velocityHistory.map((v) => v.completedPoints), 0)}{' '}
                    <span className="text-xs font-normal text-slate-400">pts</span>
                  </div>
                </div>
              </div>
            )}

            {/* Velocity Clustered Bar Chart */}
            <div className="p-6 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-2xs">
              {isLoadingVelocity ? (
                <div className="h-64 flex items-center justify-center text-xs text-slate-400">
                  Aggregating historical velocity metrics...
                </div>
              ) : velocityHistory.length === 0 ? (
                <div className="h-64 flex flex-col items-center justify-center text-xs text-slate-400">
                  <Info className="h-8 w-8 text-slate-300 dark:text-slate-700 mb-2" />
                  <p>No historical sprint data recorded yet.</p>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="h-64 flex items-end justify-between gap-4 pt-8 pb-2 px-6">
                    {velocityHistory.map((sprint, idx) => {
                      const committedHeight = (sprint.committedPoints / maxVelocityPoints) * 100;
                      const completedHeight = (sprint.completedPoints / maxVelocityPoints) * 100;

                      return (
                        <div key={idx} className="flex-1 flex flex-col items-center h-full justify-end group">
                          {/* Tooltip on hover */}
                          <div className="opacity-0 group-hover:opacity-100 transition mb-2 text-center text-[10px] font-semibold text-slate-700 dark:text-slate-200">
                            <div>{sprint.completedPoints} / {sprint.committedPoints} pts</div>
                          </div>

                          {/* Clustered Bars */}
                          <div className="w-full max-w-[64px] flex items-end justify-center gap-1.5 h-full">
                            {/* Committed Bar */}
                            <div
                              style={{ height: `${committedHeight}%` }}
                              className="w-1/2 rounded-t-md bg-slate-200 dark:bg-slate-700 transition-all duration-300 group-hover:bg-slate-300 dark:group-hover:bg-slate-600"
                              title={`Committed: ${sprint.committedPoints} pts`}
                            />
                            {/* Completed Bar */}
                            <div
                              style={{ height: `${completedHeight}%` }}
                              className="w-1/2 rounded-t-md bg-blue-600 dark:bg-blue-500 transition-all duration-300 group-hover:bg-blue-700 dark:group-hover:bg-blue-400"
                              title={`Completed: ${sprint.completedPoints} pts`}
                            />
                          </div>

                          {/* Sprint Label */}
                          <span className="mt-3 text-xs font-semibold text-slate-700 dark:text-slate-300 truncate max-w-[100px] text-center">
                            {sprint.sprintName}
                          </span>
                          <span className="text-[10px] text-slate-400 uppercase font-mono">
                            {sprint.status}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          </section>
        </div>
      </div>
    );
  }
