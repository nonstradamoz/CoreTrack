'use client';

import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  fetchTickets,
  fetchSprints,
  createSprint,
  updateSprintStatus,
  assignTicketToSprint,
  createTicket,
  Ticket,
} from '../../lib/api';
import { useProject } from '../../context/ProjectContext';
import { SLABadge } from '../../components/sla/SLABadge';
import { TicketDetailModal } from '../../components/kanban/TicketDetailModal';
import { CreateTicketModal } from '../../components/kanban/CreateTicketModal';
import { usePermissions } from '../../hooks/usePermissions';
import { useModuleAccess } from '../../hooks/useModuleAccess';
import { AccessDenied } from '../../components/auth/AccessDenied';
import { Permissions } from '../../lib/permissions';
import {
  Plus,
  Play,
  CheckCircle2,
  Calendar,
  ChevronRight,
  Search,
  Filter,
  X,
} from 'lucide-react';

export default function BacklogPage() {
  const queryClient = useQueryClient();
  const { activeProject } = useProject();
  const { hasPermission } = usePermissions();
  const { canAccess } = useModuleAccess();
  const canManageSprints = hasPermission(Permissions.SPRINT_MANAGE);
  const canCreateTask = hasPermission(Permissions.TICKET_CREATE);
  const [selectedTicket, setSelectedTicket] = useState<Ticket | null>(null);
  const [isCreateTicketModalOpen, setIsCreateTicketModalOpen] = useState(false);
  const [isCreateSprintModalOpen, setIsCreateSprintModalOpen] = useState(false);

  // Functional Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [priorityFilter, setPriorityFilter] = useState<'ALL' | 'URGENT' | 'HIGH' | 'MEDIUM' | 'LOW'>('ALL');

  // New Sprint Form State
  const [sprintName, setSprintName] = useState('');
  const [sprintGoal, setSprintGoal] = useState('');

  // 1. Fetch Tickets for Project
  const { data: tickets = [] } = useQuery({
    queryKey: ['tickets', activeProject?.key || 'CORE'],
    queryFn: () => fetchTickets(activeProject?.key || 'CORE'),
    enabled: !!activeProject,
  });

  // 2. Fetch Sprints for Project
  const { data: sprints = [] } = useQuery({
    queryKey: ['sprints', activeProject?.key || 'CORE'],
    queryFn: () => fetchSprints(activeProject?.key || 'CORE'),
    enabled: !!activeProject,
  });

  // Mutations
  const createSprintMutation = useMutation({
    mutationFn: (data: { name: string; goal?: string }) =>
      createSprint(activeProject!.key, data),
    onSuccess: () => {
      setIsCreateSprintModalOpen(false);
      setSprintName('');
      setSprintGoal('');
      queryClient.invalidateQueries({ queryKey: ['sprints', activeProject?.key] });
    },
  });

  const updateSprintMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: 'PLANNING' | 'ACTIVE' | 'CLOSED' }) =>
      updateSprintStatus(id, { status }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sprints', activeProject?.key] });
      queryClient.invalidateQueries({ queryKey: ['tickets', activeProject?.key] });
    },
  });

  const assignSprintMutation = useMutation({
    mutationFn: ({ ticketKey, sprintId }: { ticketKey: string; sprintId: string | null }) =>
      assignTicketToSprint(ticketKey, sprintId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sprints', activeProject?.key] });
      queryClient.invalidateQueries({ queryKey: ['tickets', activeProject?.key] });
    },
  });

  // Active or latest planning sprint
  const activeOrPlanningSprint =
    sprints.find((s) => s.status === 'ACTIVE') ||
    sprints.find((s) => s.status === 'PLANNING') ||
    sprints[0];

  // Filtered tickets
  const filteredTickets = tickets.filter((t) => {
    const matchesSearch =
      !searchQuery ||
      t.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      t.ticketKey.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesPriority =
      !priorityFilter || priorityFilter === 'ALL' || t.priority === priorityFilter;
    return matchesSearch && matchesPriority;
  });

  const sprintTickets = activeOrPlanningSprint
    ? filteredTickets.filter((t) => t.sprintId === activeOrPlanningSprint.id)
    : [];

  const backlogTickets = filteredTickets.filter(
    (t) => !t.sprintId || (activeOrPlanningSprint && t.sprintId !== activeOrPlanningSprint.id)
  );

  const totalSprintPoints = sprintTickets.reduce((acc, t) => acc + (t.storyPoints || 0), 0);
  const completedSprintPoints = sprintTickets
    .filter((t) => t.status === 'DONE')
    .reduce((acc, t) => acc + (t.storyPoints || 0), 0);
  const sprintProgressPercent =
    totalSprintPoints > 0 ? Math.round((completedSprintPoints / totalSprintPoints) * 100) : 0;

  const totalBacklogPoints = backlogTickets.reduce((acc, t) => acc + (t.storyPoints || 0), 0);

  const priorities: ('ALL' | 'URGENT' | 'HIGH' | 'MEDIUM' | 'LOW')[] = [
    'ALL',
    'URGENT',
    'HIGH',
    'MEDIUM',
    'LOW',
  ];

  if (!canAccess('backlog')) return <AccessDenied module="Backlog" requiredRole="Team Lead or above" />;

  return (
    <div className="flex-1 flex flex-col min-w-0">
      <div className="mb-6 flex flex-col gap-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h1 className="text-xl md:text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
              Backlog
            </h1>
            <p className="text-xs md:text-sm text-slate-500 dark:text-slate-400 mt-1">
              Sprint planning and backlog prioritization.
            </p>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={() => canManageSprints && setIsCreateSprintModalOpen(true)}
              disabled={!canManageSprints}
              title={!canManageSprints ? 'Requires Manage Sprints permission' : undefined}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-semibold text-slate-700 dark:text-slate-300 shadow-2xs transition ${
                !canManageSprints ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer hover:border-slate-300 dark:hover:border-slate-600'
              }`}
            >
              <Calendar className="h-3.5 w-3.5 text-slate-500 dark:text-slate-400" />
              <span>New Sprint</span>
            </button>
            <button
              onClick={() => canCreateTask && setIsCreateTicketModalOpen(true)}
              disabled={!canCreateTask}
              title={!canCreateTask ? 'Requires Create Tasks permission' : undefined}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold shadow-2xs transition ${
                !canCreateTask ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer'
              }`}
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
                placeholder="Filter tasks..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-8 pr-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:border-blue-600 focus:bg-white dark:focus:bg-slate-900 transition"
              />
            </div>

            <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0">
              <span className="text-[11px] font-medium text-slate-400 flex items-center gap-1 mr-1">
                <Filter className="h-3 w-3" /> Priority:
              </span>
              {priorities.map((p) => (
                <button
                  key={p}
                  onClick={() => setPriorityFilter(p)}
                  className={`px-2.5 py-1 rounded-md text-[11px] font-medium transition ${priorityFilter === p
                      ? 'bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 shadow-2xs font-semibold'
                      : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-200 dark:hover:bg-slate-700'
                    }`}
                >
                  {p}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-6">
        {/* SECTION 1: Active or Planned Sprint */}
        <div className="flex flex-col rounded-xl border border-slate-200/90 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 shadow-2xs">
          {activeOrPlanningSprint ? (
            <div className="flex flex-col gap-4">
              {/* Sprint Header & Controls */}
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-slate-100 dark:border-slate-800">
                <div className="flex items-center gap-3">
                  <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                    {activeOrPlanningSprint.name}
                  </h2>
                  <span
                    className={`px-2 py-0.5 rounded-md border text-[10px] font-mono font-semibold ${activeOrPlanningSprint.status === 'ACTIVE'
                        ? 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800'
                        : activeOrPlanningSprint.status === 'PLANNING'
                          ? 'bg-blue-50 dark:bg-blue-950/60 text-blue-800 dark:text-blue-300 border-blue-200 dark:border-blue-800'
                          : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700'
                      }`}
                  >
                    {activeOrPlanningSprint.status}
                  </span>
                  {activeOrPlanningSprint.goal && (
                    <span className="text-xs text-slate-500 dark:text-slate-400 italic">
                      Goal: {activeOrPlanningSprint.goal}
                    </span>
                  )}
                </div>

                {/* Capacity & Lifecycle Controls */}
                <div className="flex items-center gap-4">
                  {/* Story Points Capacity Meter */}
                  <div className="flex items-center gap-3 bg-slate-50 dark:bg-slate-800/60 px-3.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700">
                    <div className="flex flex-col">
                      <span className="text-[10px] text-slate-500 dark:text-slate-400 font-mono uppercase">
                        Capacity Meter
                      </span>
                      <span className="text-xs font-semibold text-slate-900 dark:text-slate-100">
                        {completedSprintPoints} / {totalSprintPoints} pts{' '}
                        <span className="text-slate-500 dark:text-slate-400 font-mono">({sprintProgressPercent}%)</span>
                      </span>
                    </div>
                    <div className="w-24 h-2 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-slate-900 dark:bg-blue-500 transition-all duration-300"
                        style={{ width: `${sprintProgressPercent}%` }}
                      />
                    </div>
                  </div>

                  {/* Lifecycle Buttons */}
                  {activeOrPlanningSprint.status === 'PLANNING' && (
                    <button
                      onClick={() =>
                        updateSprintMutation.mutate({
                          id: activeOrPlanningSprint.id,
                          status: 'ACTIVE',
                        })
                      }
                      disabled={updateSprintMutation.isPending}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-xs font-semibold text-white shadow-2xs transition"
                    >
                      <Play className="h-3.5 w-3.5" />
                      <span>Start Sprint</span>
                    </button>
                  )}

                  {activeOrPlanningSprint.status === 'ACTIVE' && (
                    <button
                      onClick={() =>
                        updateSprintMutation.mutate({
                          id: activeOrPlanningSprint.id,
                          status: 'CLOSED',
                        })
                      }
                      disabled={updateSprintMutation.isPending}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 border border-slate-300 dark:border-slate-700 text-xs font-semibold text-slate-800 dark:text-slate-200 transition"
                    >
                      <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                      <span>Complete Sprint</span>
                    </button>
                  )}
                </div>
              </div>

              {/* Sprint Tickets List */}
              {sprintTickets.length === 0 ? (
                <div className="py-8 text-center text-xs text-slate-400 dark:text-slate-500 border border-dashed border-slate-200 dark:border-slate-800 rounded-xl">
                  No tickets committed to this sprint. Move items from the Product Backlog below.
                </div>
              ) : (
                <div className="flex flex-col gap-2">
                  {sprintTickets.map((ticket) => (
                    <div
                      key={ticket.id}
                      onClick={() => setSelectedTicket(ticket)}
                      className="flex items-center justify-between p-3 rounded-xl border border-slate-200/80 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-800/40 hover:bg-white dark:hover:bg-slate-800/80 hover:border-slate-300 dark:hover:border-slate-700 transition-all cursor-pointer shadow-2xs"
                    >
                      <div className="flex items-center gap-3">
                        <span className="font-mono text-xs font-semibold text-slate-500 dark:text-slate-400 w-20">
                          {ticket.ticketKey}
                        </span>
                        <span className="text-sm font-medium text-slate-900 dark:text-slate-100">{ticket.title}</span>
                      </div>

                      <div className="flex items-center gap-3">
                        <SLABadge
                          dueAt={ticket.slaResolutionDueAt}
                          isPaused={ticket.isSlaPaused}
                          isResolved={ticket.status === 'DONE' || ticket.status === 'RESOLVED'}
                          compact
                        />

                        {ticket.storyPoints !== null && (
                          <span className="px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-[10px] font-mono text-slate-700 dark:text-slate-300">
                            {ticket.storyPoints} pts
                          </span>
                        )}

                        <span className="px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 text-[10px] font-mono text-slate-600 dark:text-slate-400">
                          {ticket.status}
                        </span>

                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            assignSprintMutation.mutate({
                              ticketKey: ticket.ticketKey,
                              sprintId: null,
                            });
                          }}
                          title="Move to Product Backlog"
                          className="px-2 py-1 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 text-[11px] text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white transition"
                        >
                          To Backlog
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <div className="py-8 text-center">
              <p className="text-sm text-slate-500 dark:text-slate-400 mb-3">No active or planning sprint found.</p>
              <button
                onClick={() => setIsCreateSprintModalOpen(true)}
                className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-xs font-semibold text-white transition shadow-2xs"
              >
                Create Sprint 1
              </button>
            </div>
          )}
        </div>

        {/* SECTION 2: Product Backlog */}
        <div className="flex flex-col rounded-xl border border-slate-200/90 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 shadow-2xs">
          <div className="flex items-center justify-between pb-4 border-b border-slate-100 dark:border-slate-800 mb-4">
            <div className="flex items-center gap-3">
              <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">Product Backlog</h2>
              <span className="px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs font-mono text-slate-600 dark:text-slate-400">
                {backlogTickets.length} tasks ({totalBacklogPoints} pts)
              </span>
            </div>

            <button
              onClick={() => setIsCreateTicketModalOpen(true)}
              className="flex items-center gap-1 text-xs text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 font-semibold"
            >
              <Plus className="h-3.5 w-3.5" />
              <span>Add Backlog Item</span>
            </button>
          </div>

          {backlogTickets.length === 0 ? (
            <div className="py-8 text-center text-xs text-slate-400 dark:text-slate-500 border border-dashed border-slate-200 dark:border-slate-800 rounded-xl">
              Backlog is clear!
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              {backlogTickets.map((ticket) => (
                <div
                  key={ticket.id}
                  onClick={() => setSelectedTicket(ticket)}
                  className="flex items-center justify-between p-3 rounded-xl border border-slate-200/80 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-800/40 hover:bg-white dark:hover:bg-slate-800/80 hover:border-slate-300 dark:hover:border-slate-700 transition-all cursor-pointer shadow-2xs"
                >
                  <div className="flex items-center gap-3">
                    <span className="font-mono text-xs font-semibold text-slate-500 dark:text-slate-400 w-20">
                      {ticket.ticketKey}
                    </span>
                    <span className="text-sm font-medium text-slate-800 dark:text-slate-200">{ticket.title}</span>
                  </div>

                  <div className="flex items-center gap-3">
                    <SLABadge
                      dueAt={ticket.slaResolutionDueAt}
                      isPaused={ticket.isSlaPaused}
                      isResolved={ticket.status === 'DONE' || ticket.status === 'RESOLVED'}
                      compact
                    />

                    {ticket.storyPoints !== null && (
                      <span className="px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-[10px] font-mono text-slate-600 dark:text-slate-400">
                        {ticket.storyPoints} pts
                      </span>
                    )}

                    <span className="px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 text-[10px] font-mono text-slate-600 dark:text-slate-400">
                      {ticket.status}
                    </span>

                    {/* Move to Active Sprint Button */}
                    {activeOrPlanningSprint && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          assignSprintMutation.mutate({
                            ticketKey: ticket.ticketKey,
                            sprintId: activeOrPlanningSprint.id,
                          });
                        }}
                        className="flex items-center gap-1 px-2.5 py-1 rounded bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 border border-slate-300 dark:border-slate-700 text-[11px] font-semibold text-slate-700 dark:text-slate-300 shadow-2xs transition"
                      >
                        <span>Move to Sprint</span>
                        <ChevronRight className="h-3 w-3" />
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Create Sprint Modal */}
      {isCreateSprintModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 dark:bg-black/60 backdrop-blur-xs">
          <div className="relative w-full max-w-md rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 shadow-2xl">
            <div className="flex items-center justify-between pb-3 mb-4 border-b border-slate-100 dark:border-slate-800">
              <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">Create Planning Sprint</h3>
              <button onClick={() => setIsCreateSprintModalOpen(false)} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300">
                <X className="h-4 w-4" />
              </button>
            </div>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (!sprintName.trim()) return;
                createSprintMutation.mutate({
                  name: sprintName.trim(),
                  goal: sprintGoal.trim() || undefined,
                });
              }}
              className="flex flex-col gap-4"
            >
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">Sprint Name</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Sprint 2 - Core Engine"
                  value={sprintName}
                  onChange={(e) => setSprintName(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:border-blue-600 transition"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">Sprint Goal</label>
                <textarea
                  placeholder="What is the deliverable goal of this iteration?"
                  rows={3}
                  value={sprintGoal}
                  onChange={(e) => setSprintGoal(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:border-blue-600 transition"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsCreateSprintModalOpen(false)}
                  className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-700 transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={createSprintMutation.isPending}
                  className="px-4 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-xs font-semibold text-white transition shadow-2xs"
                >
                  {createSprintMutation.isPending ? 'Creating...' : 'Create Sprint'}
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
      {isCreateTicketModalOpen && activeProject && (
        <CreateTicketModal
          projectId={activeProject.id}
          isOpen={isCreateTicketModalOpen}
          onClose={() => setIsCreateTicketModalOpen(false)}
          onSubmit={async (input) => {
            await createTicket(input);
            setIsCreateTicketModalOpen(false);
            queryClient.invalidateQueries({ queryKey: ['tickets', activeProject.key] });
          }}
        />
      )}
    </div>
  );
}
