'use client';

import React, { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  fetchTickets,
  fetchProjectDependencies,
  createTicketDependency,
  deleteTicketDependency,
  createTicket,
  Ticket,
  TicketDependency,
} from '../../lib/api';
import { useProject } from '../../context/ProjectContext';
import { useModuleAccess } from '../../hooks/useModuleAccess';
import { AccessDenied } from '../../components/auth/AccessDenied';
import { TicketDetailModal } from '../../components/kanban/TicketDetailModal';
import { CreateTicketModal } from '../../components/kanban/CreateTicketModal';
import {
  CalendarRange,
  Plus,
  Search,
  Filter,
  AlertTriangle,
  Link2,
  Unlink,
  CheckCircle2,
  Clock,
  ArrowRight,
  ShieldAlert,
  X,
} from 'lucide-react';

export default function TimelinePage() {
  const queryClient = useQueryClient();
  const { projects, activeProject } = useProject();
  const { canAccess } = useModuleAccess();
  const [selectedTicket, setSelectedTicket] = useState<Ticket | null>(null);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isDependencyModalOpen, setIsDependencyModalOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [projectScope, setProjectScope] = useState<string>(activeProject?.key || 'ALL');

  // Dependency Modal State
  const [sourceKey, setSourceKey] = useState('');
  const [targetKey, setTargetKey] = useState('');
  const [depType, setDepType] = useState<'BLOCKS' | 'BLOCKED_BY' | 'RELATES_TO'>('BLOCKS');
  const [depError, setDepError] = useState<string | null>(null);

  // 1. Fetch tickets for selected project or all assigned projects
  const { data: tickets = [] } = useQuery({
    queryKey: ['timelineTickets', projectScope, projects.map((p) => p.key).join(',')],
    queryFn: async () => {
      if (projectScope === 'ALL') {
        if (projects.length === 0) return [];
        const batches = await Promise.all(projects.map((p) => fetchTickets(p.key).catch(() => [])));
        return batches.flat();
      }
      return fetchTickets(projectScope);
    },
    enabled: projects.length > 0,
  });

  // 2. Fetch dependencies
  const depProjectKey = projectScope === 'ALL' ? activeProject?.key || projects[0]?.key || 'CORE' : projectScope;
  const { data: dependencies = [] } = useQuery({
    queryKey: ['dependencies', depProjectKey],
    queryFn: () => fetchProjectDependencies(depProjectKey),
    enabled: projects.length > 0,
  });

  // Mutations
  const createDependencyMutation = useMutation({
    mutationFn: (data: { sourceKey: string; targetKey: string; type: 'BLOCKS' | 'BLOCKED_BY' | 'RELATES_TO' }) =>
      createTicketDependency(data.sourceKey, {
        targetTicketKey: data.targetKey,
        dependencyType: data.type,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['dependencies', activeProject?.key] });
      setIsDependencyModalOpen(false);
      setDepError(null);
      setSourceKey('');
      setTargetKey('');
    },
    onError: (err: Error) => {
      setDepError(err.message);
    },
  });

  const deleteDependencyMutation = useMutation({
    mutationFn: ({ ticketKey, depId }: { ticketKey: string; depId: string }) =>
      deleteTicketDependency(ticketKey, depId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['dependencies', activeProject?.key] });
    },
  });

  // Compute timeline boundaries (14 days window around now)
  const today = useMemo(() => new Date(), []);
  const timelineDays = useMemo(() => {
    const days: Date[] = [];
    for (let i = -3; i <= 14; i++) {
      const d = new Date(today);
      d.setDate(today.getDate() + i);
      days.push(d);
    }
    return days;
  }, [today]);

  const startDateMin = timelineDays[0];
  const totalDays = timelineDays.length;

  // Filtered tickets
  const filteredTickets = tickets.filter((t) => {
    const matchesSearch =
      !searchQuery ||
      t.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (t.displayKey || t.ticketKey).toLowerCase().includes(searchQuery.toLowerCase()) ||
      t.ticketKey.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesStatus = !statusFilter || statusFilter === 'ALL' || t.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  // Warning Mode Engine: Detect conflicts
  // A conflict occurs if ticket A BLOCKS ticket B, but A's dueDate is after B's dueDate,
  // or A is NOT DONE while B is IN_PROGRESS / DONE.
  const conflicts = useMemo(() => {
    const conflictMap = new Map<string, { blockedBy: string; reason: string }>();
    const ticketMap = new Map(tickets.map((t) => [t.ticketKey, t]));

    for (const dep of dependencies) {
      if (dep.dependencyType === 'BLOCKS' && dep.sourceKey && dep.targetKey) {
        const source = ticketMap.get(dep.sourceKey);
        const target = ticketMap.get(dep.targetKey);

        if (source && target) {
          if (source.status !== 'DONE' && (target.status === 'IN_PROGRESS' || target.status === 'DONE')) {
            conflictMap.set(target.ticketKey, {
              blockedBy: source.ticketKey,
              reason: `${source.ticketKey} must be completed before ${target.ticketKey} starts`,
            });
          } else if (source.dueDate && target.dueDate && new Date(source.dueDate) > new Date(target.dueDate)) {
            conflictMap.set(target.ticketKey, {
              blockedBy: source.ticketKey,
              reason: `${source.ticketKey} finishes after ${target.ticketKey} due date`,
            });
          }
        }
      }
    }
    return conflictMap;
  }, [tickets, dependencies]);

  if (!canAccess('timeline')) return <AccessDenied module="Timeline & Calendar" requiredRole="Team Lead or above" />;

  return (
    <div className="flex-1 flex flex-col min-w-0">
      {/* Standard Page Header */}
      <div className="mb-6 flex flex-col gap-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h1 className="text-xl md:text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100 flex items-center gap-2.5">
              <span>Timeline</span>
            </h1>
            <p className="text-xs md:text-sm text-slate-500 dark:text-slate-400 mt-1">
              Cross-task dependencies, schedule, and conflict detection.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            {projects.length > 0 && (
              <select
                value={projectScope}
                onChange={(e) => setProjectScope(e.target.value)}
                className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-semibold text-slate-700 dark:text-slate-200 focus:outline-none focus:border-blue-600 cursor-pointer"
              >
                <option value="ALL">All Assigned Projects ({projects.length})</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.key}>
                    {p.name} ({p.key})
                  </option>
                ))}
              </select>
            )}
            <button
              onClick={() => {
                setDepError(null);
                setIsDependencyModalOpen(true);
              }}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:border-slate-300 dark:hover:border-slate-600 text-xs font-semibold text-slate-700 dark:text-slate-300 shadow-2xs transition cursor-pointer"
            >
              <Link2 className="h-3.5 w-3.5 text-slate-500 dark:text-slate-400" />
              <span>Link</span>
            </button>
            <button
              onClick={() => setIsCreateModalOpen(true)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold shadow-2xs transition active:scale-[0.98] cursor-pointer"
            >
              <Plus className="h-3.5 w-3.5" />
              <span>New Task</span>
            </button>
          </div>
        </div>

        {/* Search & Filter Bar */}
        <div className="pt-2">
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 p-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-2xs">
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-slate-400" />
              <input
                type="text"
                placeholder="Search tasks or filter timeline..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-8 pr-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:border-blue-600 focus:bg-white dark:focus:bg-slate-900 transition"
              />
            </div>

            <div className="flex items-center gap-1.5">
              <span className="text-[11px] font-medium text-slate-400 flex items-center gap-1 mr-1">
                <Filter className="h-3 w-3" /> Status:
              </span>
              {['ALL', 'TODO', 'IN_PROGRESS', 'IN_REVIEW', 'DONE'].map((s) => (
                <button
                  key={s}
                  onClick={() => setStatusFilter(s)}
                  className={`px-2.5 py-1 rounded-md text-[11px] font-medium transition ${statusFilter === s
                      ? 'bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 shadow-2xs font-semibold'
                      : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-200 dark:hover:bg-slate-700'
                    }`}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Dependency Warning Summary Banner */}
      {conflicts.size > 0 && (
        <div className="mb-4 p-3.5 rounded-xl border border-amber-300 dark:border-amber-800 bg-amber-50/80 dark:bg-amber-950/30 flex items-center justify-between text-xs text-amber-900 dark:text-amber-200">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0" />
            <span className="font-semibold">
              {conflicts.size} schedule conflict{conflicts.size > 1 ? 's' : ''} detected in Warning Mode.
            </span>
            <span className="text-amber-700 dark:text-amber-300 hidden md:inline">
              Dependencies are highlighted below. Timelines are preserved without destructive shifting.
            </span>
          </div>
        </div>
      )}

      {/* Gantt Matrix Container */}
      <div className="flex-1 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-2xs overflow-hidden flex flex-col">
        {/* Timeline Header (Calendar Scale) */}
        <div className="flex border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/60 sticky top-0 z-10 select-none">
          {/* Left Fixed Column: Issue Summary */}
          <div className="w-72 shrink-0 p-3 border-r border-slate-200 dark:border-slate-800 text-xs font-semibold text-slate-700 dark:text-slate-300">
            Task & Schedule
          </div>

          {/* Right Days Grid */}
          <div className="flex-1 flex overflow-x-auto">
            {timelineDays.map((day, idx) => {
              const isToday = day.toDateString() === today.toDateString();
              const isWeekend = day.getDay() === 0 || day.getDay() === 6;
              return (
                <div
                  key={idx}
                  className={`flex-1 min-w-[38px] text-center py-2 px-1 border-r border-slate-100 dark:border-slate-800/80 ${isToday
                      ? 'bg-blue-50/70 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 font-bold'
                      : isWeekend
                        ? 'bg-slate-100/50 dark:bg-slate-800/30 text-slate-400'
                        : 'text-slate-600 dark:text-slate-400'
                    }`}
                >
                  <span className="block text-[10px] uppercase font-mono">
                    {day.toLocaleDateString([], { weekday: 'narrow' })}
                  </span>
                  <span className="block text-xs font-semibold">{day.getDate()}</span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Timeline Rows */}
        <div className="flex-1 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800/60">
          {filteredTickets.length === 0 ? (
            <div className="p-12 text-center text-xs text-slate-400">
              No tasks match the active filters.
            </div>
          ) : (
            filteredTickets.map((ticket) => {
              const conflict = conflicts.get(ticket.ticketKey);

              // Calculate exact start and end offset in grid using startDate || createdAt and dueDate
              const rawStart = new Date(ticket.startDate || ticket.createdAt);
              rawStart.setHours(0, 0, 0, 0);
              const rawDue = ticket.dueDate
                ? new Date(ticket.dueDate)
                : new Date(rawStart.getTime() + 3 * 86400000);
              rawDue.setHours(23, 59, 59, 999);

              const gridStart = new Date(startDateMin);
              gridStart.setHours(0, 0, 0, 0);

              const diffStartDays = Math.max(0, Math.floor((rawStart.getTime() - gridStart.getTime()) / 86400000));
              const spanDays = Math.max(1, Math.ceil((rawDue.getTime() - Math.max(rawStart.getTime(), gridStart.getTime())) / 86400000));
              const diffDurationDays = Math.min(totalDays - diffStartDays, spanDays);

              const leftPercent = Math.min(96, Math.max(0, (diffStartDays / totalDays) * 100));
              const widthPercent = Math.min(100 - leftPercent, Math.max(6, (diffDurationDays / totalDays) * 100));

              return (
                <div
                  key={ticket.id}
                  onClick={() => setSelectedTicket(ticket)}
                  className="flex items-center hover:bg-slate-50/80 dark:hover:bg-slate-800/40 cursor-pointer transition group"
                >
                  {/* Left Column: Key & Title */}
                  <div className="w-72 shrink-0 p-3 border-r border-slate-200 dark:border-slate-800 flex items-center justify-between min-w-0">
                    <div className="min-w-0 flex-1 pr-2">
                      <div className="flex items-center gap-1.5">
                        <span className="font-mono text-xs font-semibold text-slate-500 dark:text-slate-400">
                          {ticket.displayKey || ticket.ticketKey}
                        </span>
                        {conflict && (
                          <span
                            title={conflict.reason}
                            className="inline-flex items-center gap-0.5 px-1.5 py-0.2 rounded text-[10px] font-semibold bg-rose-100 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-900"
                          >
                            <AlertTriangle className="h-2.5 w-2.5" />
                            <span>Conflict</span>
                          </span>
                        )}
                      </div>
                      <p className="text-xs font-medium text-slate-800 dark:text-slate-200 truncate mt-0.5">
                        {ticket.title}
                      </p>
                    </div>

                    <span className="px-2 py-0.5 rounded text-[10px] font-mono text-slate-500 bg-slate-100 dark:bg-slate-800 shrink-0">
                      {ticket.status}
                    </span>
                  </div>

                  {/* Right Column: Interactive Gantt Bar */}
                  <div className="flex-1 relative h-12 flex items-center px-2">
                    <div
                      style={{
                        left: `${leftPercent}%`,
                        width: `${widthPercent}%`,
                      }}
                      className={`absolute h-7 rounded-lg px-2.5 flex items-center justify-between text-[11px] font-semibold shadow-2xs transition-all ${conflict
                          ? 'bg-rose-600 text-white ring-2 ring-rose-400/50'
                          : ticket.status === 'DONE'
                            ? 'bg-emerald-600 text-white'
                            : ticket.status === 'IN_PROGRESS'
                              ? 'bg-blue-600 text-white'
                              : ticket.status === 'IN_REVIEW'
                                ? 'bg-purple-600 text-white'
                                : 'bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-200'
                        }`}
                    >
                      <span className="truncate">{ticket.title}</span>
                      {ticket.storyPoints !== null && (
                        <span className="opacity-80 font-mono text-[10px] ml-1">
                          {ticket.storyPoints}pt
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Timeline Footer: Dependency Relationship Badges */}
        <div className="p-3 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/40 flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 overflow-x-auto">
          <div className="flex items-center gap-3">
            <span className="font-semibold text-slate-700 dark:text-slate-300">Active Dependencies:</span>
            {dependencies.length === 0 ? (
              <span>None configured yet. Use &ldquo;Link Dependency&rdquo; above.</span>
            ) : (
              dependencies.slice(0, 5).map((dep) => (
                <div
                  key={dep.id}
                  className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-[11px]"
                >
                  <span className="font-mono font-semibold text-slate-700 dark:text-slate-300">
                    {dep.sourceKey}
                  </span>
                  <span className="text-[10px] uppercase font-bold text-blue-600 dark:text-blue-400">
                    {dep.dependencyType}
                  </span>
                  <span className="font-mono font-semibold text-slate-700 dark:text-slate-300">
                    {dep.targetKey}
                  </span>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      if (dep.sourceKey) {
                        deleteDependencyMutation.mutate({
                          ticketKey: dep.sourceKey,
                          depId: dep.id,
                        });
                      }
                    }}
                    title="Unlink"
                    className="ml-1 text-slate-400 hover:text-rose-600"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Link Dependency Modal with Cycle Detection */}
      {isDependencyModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 dark:bg-black/60 backdrop-blur-xs">
          <div className="relative w-full max-w-md rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 shadow-2xl">
            <div className="flex items-center justify-between pb-3 mb-4 border-b border-slate-100 dark:border-slate-800">
              <div className="flex items-center gap-2">
                <Link2 className="h-4 w-4 text-blue-600" />
                <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                  Link Task Dependency
                </h3>
              </div>
              <button
                onClick={() => setIsDependencyModalOpen(false)}
                className="text-slate-400 hover:text-slate-600"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {depError && (
              <div className="mb-4 p-3 rounded-lg bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 text-rose-800 dark:text-rose-200 text-xs flex items-center gap-2">
                <ShieldAlert className="h-4 w-4 shrink-0 text-rose-600" />
                <span>{depError}</span>
              </div>
            )}

            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (!sourceKey.trim() || !targetKey.trim()) return;
                createDependencyMutation.mutate({
                  sourceKey: sourceKey.trim().toUpperCase(),
                  targetKey: targetKey.trim().toUpperCase(),
                  type: depType,
                });
              }}
              className="space-y-4"
            >
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Source Ticket Key
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. CORE-1"
                  value={sourceKey}
                  onChange={(e) => setSourceKey(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-mono font-semibold text-slate-900 dark:text-slate-100 focus:outline-none focus:border-blue-600"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Relationship Type
                </label>
                <select
                  value={depType}
                  onChange={(e) => setDepType(e.target.value as 'BLOCKS' | 'BLOCKED_BY' | 'RELATES_TO')}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-semibold text-slate-900 dark:text-slate-100 focus:outline-none focus:border-blue-600"
                >
                  <option value="BLOCKS">BLOCKS (Source must finish before Target)</option>
                  <option value="BLOCKED_BY">BLOCKED_BY (Source is blocked by Target)</option>
                  <option value="RELATES_TO">RELATES_TO (Associated items)</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Target Ticket Key
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. CORE-2"
                  value={targetKey}
                  onChange={(e) => setTargetKey(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-mono font-semibold text-slate-900 dark:text-slate-100 focus:outline-none focus:border-blue-600"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsDependencyModalOpen(false)}
                  className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={createDependencyMutation.isPending}
                  className="px-4 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-xs font-semibold text-white transition shadow-2xs"
                >
                  {createDependencyMutation.isPending ? 'Linking...' : 'Create Link'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Ticket Detail Modal */}
      {selectedTicket && (
        <TicketDetailModal
          ticket={selectedTicket}
          onClose={() => setSelectedTicket(null)}
        />
      )}

      {/* Create Ticket Modal */}
      {isCreateModalOpen && activeProject && (
        <CreateTicketModal
          projectId={activeProject.id}
          isOpen={isCreateModalOpen}
          onClose={() => setIsCreateModalOpen(false)}
          onSubmit={async (data) => {
            await createTicket(data);
            setIsCreateModalOpen(false);
            queryClient.invalidateQueries({ queryKey: ['tickets', activeProject.key] });
          }}
        />
      )}
    </div>
  );
}
