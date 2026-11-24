'use client';

import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useProject } from '../../context/ProjectContext';
import { fetchTickets, fetchCurrentUser, updateTicket, Ticket } from '../../lib/api';
import {
  Calendar,
  Clock,
  Check,
  ChevronRight,
  Plus,
  MessageSquare,
  Activity,
  Layers,
  Sparkles,
  Inbox,
  AlertCircle,
} from 'lucide-react';

interface ContextualRightPanelProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectTicket: (ticket: Ticket) => void;
  onOpenCreateModal?: () => void;
}

export function ContextualRightPanel({
  isOpen,
  onClose,
  onSelectTicket,
  onOpenCreateModal,
}: ContextualRightPanelProps) {
  const queryClient = useQueryClient();
  const { activeProject } = useProject();
  const [activeTab, setActiveTab] = useState<'MESSAGES' | 'TODAY' | 'ACTIVITY'>('TODAY');
  const [filterMode, setFilterMode] = useState<'ALL' | 'OPEN' | 'CLOSED' | 'OVERDUE'>('ALL');

  const { data: currentUser } = useQuery({
    queryKey: ['currentUser'],
    queryFn: fetchCurrentUser,
  });

  const projectKey = activeProject?.key || 'CORE';

  const { data: tickets = [], isLoading } = useQuery({
    queryKey: ['tickets', projectKey],
    queryFn: () => fetchTickets(projectKey),
  });

  // Toggle ticket completion mutation
  const toggleStatusMutation = useMutation({
    mutationFn: ({ ticketKey, newStatus, lockVersion }: { ticketKey: string; newStatus: Ticket['status']; lockVersion: number }) =>
      updateTicket(ticketKey, { status: newStatus, lockVersion }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tickets'] });
      queryClient.invalidateQueries({ queryKey: ['portfolioDashboard'] });
    },
  });

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // Formatted date string matching reference: "Wednesday, 11 May"
  const formattedDate = new Intl.DateTimeFormat('en-US', {
    weekday: 'long',
    day: 'numeric',
    month: 'short',
  }).format(new Date());

  // Derive counts
  const openTickets = tickets.filter((t) => t.status !== 'DONE' && t.status !== 'RESOLVED');
  const closedTickets = tickets.filter((t) => t.status === 'DONE' || t.status === 'RESOLVED');
  const overdueTickets = tickets.filter((t) => {
    if (!t.dueDate || t.status === 'DONE' || t.status === 'RESOLVED') return false;
    const d = new Date(t.dueDate);
    d.setHours(0, 0, 0, 0);
    return d.getTime() < today.getTime();
  });

  const displayedTickets = tickets.filter((t) => {
    if (filterMode === 'OPEN') return t.status !== 'DONE' && t.status !== 'RESOLVED';
    if (filterMode === 'CLOSED') return t.status === 'DONE' || t.status === 'RESOLVED';
    if (filterMode === 'OVERDUE') {
      if (!t.dueDate || t.status === 'DONE' || t.status === 'RESOLVED') return false;
      const d = new Date(t.dueDate);
      d.setHours(0, 0, 0, 0);
      return d.getTime() < today.getTime();
    }
    return true;
  });

  if (!isOpen) return null;

  return (
    <aside
      className="hidden xl:flex flex-col w-[340px] border-l border-slate-200/80 dark:border-slate-800/80 bg-white dark:bg-slate-900 shrink-0 z-20 select-none transition-all duration-200 overflow-hidden"
      aria-label="Contextual Details Panel"
    >
      {/* 1. TOP TABS: Messages | Today's Task | Last Activity */}
      <div className="h-14 flex items-center justify-between px-4 border-b border-slate-100 dark:border-slate-800/80">
        <div className="flex items-center gap-4 text-xs font-semibold text-slate-500 dark:text-slate-400">
          <button
            onClick={() => setActiveTab('MESSAGES')}
            className={`transition pb-0.5 ${
              activeTab === 'MESSAGES'
                ? 'text-slate-900 dark:text-slate-100 font-bold border-b-2 border-slate-900 dark:border-slate-100'
                : 'hover:text-slate-800 dark:hover:text-slate-200'
            }`}
          >
            Messages
          </button>
          <button
            onClick={() => setActiveTab('TODAY')}
            className={`transition pb-0.5 ${
              activeTab === 'TODAY'
                ? 'text-slate-900 dark:text-slate-100 font-bold border-b-2 border-blue-600 text-blue-600 dark:text-blue-400'
                : 'hover:text-slate-800 dark:hover:text-slate-200'
            }`}
          >
            Today&apos;s Task
          </button>
          <button
            onClick={() => setActiveTab('ACTIVITY')}
            className={`transition pb-0.5 ${
              activeTab === 'ACTIVITY'
                ? 'text-slate-900 dark:text-slate-100 font-bold border-b-2 border-slate-900 dark:border-slate-100'
                : 'hover:text-slate-800 dark:hover:text-slate-200'
            }`}
          >
            Last Activity
          </button>
        </div>

        <button
          onClick={onClose}
          title="Close panel"
          className="p-1 rounded-md text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>

      {activeTab === 'TODAY' && (
        <div className="flex-1 flex flex-col min-h-0">
          {/* 2. SUBHEADER: Today's Task & Date + "+ New Task" Button */}
          <div className="p-4 pb-3 flex items-start justify-between gap-2 border-b border-slate-100 dark:border-slate-800/60 bg-slate-50/50 dark:bg-slate-900/40">
            <div>
              <h3 className="text-base font-bold text-slate-900 dark:text-slate-100 leading-tight">
                Today&apos;s Task
              </h3>
              <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5 font-medium">
                {formattedDate}
              </p>
            </div>

            <button
              onClick={onOpenCreateModal}
              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-full bg-blue-600 hover:bg-blue-700 active:scale-[0.98] text-white text-xs font-semibold shadow-2xs transition cursor-pointer"
            >
              <Plus className="h-3.5 w-3.5" />
              <span>New Task</span>
            </button>
          </div>

          {/* 3. STATUS FILTER PILLS: All 35 | Open 14 | Closed 19 | Overdue */}
          <div className="px-4 py-3 flex items-center gap-1.5 overflow-x-auto border-b border-slate-100 dark:border-slate-800/60">
            <button
              onClick={() => setFilterMode('ALL')}
              className={`px-3 py-1 rounded-full text-xs font-semibold transition flex items-center gap-1.5 cursor-pointer whitespace-nowrap ${
                filterMode === 'ALL'
                  ? 'bg-blue-600 text-white shadow-2xs'
                  : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700'
              }`}
            >
              <span>All</span>
              <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-bold ${filterMode === 'ALL' ? 'bg-white/20 text-white' : 'bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300'}`}>
                {tickets.length}
              </span>
            </button>

            <button
              onClick={() => setFilterMode('OPEN')}
              className={`px-3 py-1 rounded-full text-xs font-semibold transition flex items-center gap-1.5 cursor-pointer whitespace-nowrap ${
                filterMode === 'OPEN'
                  ? 'bg-blue-600 text-white shadow-2xs'
                  : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700'
              }`}
            >
              <span>Open</span>
              <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-bold ${filterMode === 'OPEN' ? 'bg-white/20 text-white' : 'bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300'}`}>
                {openTickets.length}
              </span>
            </button>

            <button
              onClick={() => setFilterMode('CLOSED')}
              className={`px-3 py-1 rounded-full text-xs font-semibold transition flex items-center gap-1.5 cursor-pointer whitespace-nowrap ${
                filterMode === 'CLOSED'
                  ? 'bg-blue-600 text-white shadow-2xs'
                  : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700'
              }`}
            >
              <span>Closed</span>
              <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-bold ${filterMode === 'CLOSED' ? 'bg-white/20 text-white' : 'bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300'}`}>
                {closedTickets.length}
              </span>
            </button>

            {overdueTickets.length > 0 && (
              <button
                onClick={() => setFilterMode('OVERDUE')}
                className={`px-3 py-1 rounded-full text-xs font-semibold transition flex items-center gap-1.5 cursor-pointer whitespace-nowrap ${
                  filterMode === 'OVERDUE'
                    ? 'bg-rose-600 text-white shadow-2xs'
                    : 'bg-rose-50 dark:bg-rose-950/60 text-rose-700 dark:text-rose-400 hover:bg-rose-100'
                }`}
              >
                <span>Overdue</span>
                <span className="text-[10px] px-1.5 py-0.2 rounded-full font-bold bg-rose-200/80 dark:bg-rose-900 text-rose-800 dark:text-rose-200">
                  {overdueTickets.length}
                </span>
              </button>
            )}
          </div>

          {/* 4. TASK ITEMS LIST */}
          <div className="flex-1 overflow-y-auto p-3 space-y-2.5">
            {isLoading ? (
              <div className="p-8 text-center text-xs text-slate-400">Loading tasks...</div>
            ) : displayedTickets.length === 0 ? (
              <div className="py-12 text-center px-4 rounded-2xl border border-dashed border-slate-200 dark:border-slate-800">
                <Sparkles className="h-6 w-6 text-blue-500 mx-auto mb-2" />
                <p className="text-xs font-semibold text-slate-800 dark:text-slate-200">No tasks in this view</p>
                <p className="text-[11px] text-slate-400 mt-0.5">Everything looks clear and up to date.</p>
              </div>
            ) : (
              displayedTickets.map((t) => {
                const isClosed = t.status === 'DONE' || t.status === 'RESOLVED';
                const assigneeInitial = t.assignee?.fullName
                  ? t.assignee.fullName.charAt(0).toUpperCase()
                  : 'U';

                return (
                  <div
                    key={t.id}
                    onClick={() => onSelectTicket(t)}
                    className="group relative p-3.5 rounded-2xl border border-slate-200/80 dark:border-slate-800/80 bg-white dark:bg-slate-900 hover:border-blue-500/50 hover:shadow-2xs dark:hover:bg-slate-800/80 transition cursor-pointer flex items-center justify-between gap-3"
                  >
                    <div className="min-w-0 flex-1">
                      {/* Title */}
                      <h4
                        className={`text-xs font-bold text-slate-900 dark:text-slate-100 truncate group-hover:text-blue-600 dark:group-hover:text-blue-400 transition ${
                          isClosed ? 'line-through text-slate-400 dark:text-slate-500' : ''
                        }`}
                      >
                        {t.title}
                      </h4>

                      {/* Subtitle: Project Category / Key */}
                      <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate mt-0.5">
                        {activeProject?.name || 'Project'} • <span className="font-mono text-blue-600 dark:text-blue-400 font-semibold">{t.ticketKey}</span>
                      </p>

                      {/* Schedule / Time Row & Avatar */}
                      <div className="flex items-center justify-between gap-2 mt-2 pt-1">
                        <div className="flex items-center gap-1 text-[10px] text-slate-400 dark:text-slate-500 font-medium">
                          <Clock className="h-3 w-3 shrink-0" />
                          <span>
                            {t.dueDate
                              ? `Due ${new Date(t.dueDate).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`
                              : 'No deadline'}
                          </span>
                        </div>

                        {t.assignee && (
                          <div
                            className="h-5 w-5 rounded-full bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 flex items-center justify-center text-[10px] font-bold shadow-2xs shrink-0"
                            title={`Assigned to ${t.assignee.fullName}`}
                          >
                            {assigneeInitial}
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Right Checkbox / Completion Circle matching reference */}
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleStatusMutation.mutate({
                          ticketKey: t.ticketKey,
                          newStatus: isClosed ? 'TODO' : 'DONE',
                          lockVersion: t.lockVersion,
                        });
                      }}
                      title={isClosed ? 'Mark as open' : 'Mark as complete'}
                      className={`h-6 w-6 rounded-full shrink-0 flex items-center justify-center transition cursor-pointer ${
                        isClosed
                          ? 'bg-blue-600 text-white shadow-xs'
                          : 'border-2 border-slate-300 dark:border-slate-600 hover:border-blue-600 hover:bg-blue-50 dark:hover:bg-slate-800'
                      }`}
                    >
                      {isClosed && <Check className="h-3.5 w-3.5 stroke-[2.5]" />}
                    </button>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}

      {activeTab === 'MESSAGES' && (
        <div className="flex-1 p-4 space-y-3 overflow-y-auto">
          <div className="text-xs font-bold text-slate-800 dark:text-slate-200">
            Standup Feed & Messages
          </div>
          <div className="p-3 rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/40 text-xs text-slate-600 dark:text-slate-300">
            <p className="font-semibold text-slate-900 dark:text-slate-100">Team Standup Channel</p>
            <p className="mt-1 text-[11px] text-slate-500">Daily standup updates and automated ticket notifications are synchronized live.</p>
          </div>
        </div>
      )}

      {activeTab === 'ACTIVITY' && (
        <div className="flex-1 p-4 space-y-3 overflow-y-auto">
          <div className="text-xs font-bold text-slate-800 dark:text-slate-200">
            Recent System Activity
          </div>
          <div className="space-y-2">
            <div className="p-2.5 rounded-xl border border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/40 text-xs">
              <span className="font-semibold text-blue-600 dark:text-blue-400">WebSocket Live</span>
              <p className="text-[11px] text-slate-500 mt-0.5">Real-time sync active on project {activeProject?.key || 'CORE'}</p>
            </div>
            <div className="p-2.5 rounded-xl border border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/40 text-xs">
              <span className="font-semibold text-emerald-600 dark:text-emerald-400">Automations Active</span>
              <p className="text-[11px] text-slate-500 mt-0.5">Rules engine running on assigned tasks</p>
            </div>
          </div>
        </div>
      )}
    </aside>
  );
}
