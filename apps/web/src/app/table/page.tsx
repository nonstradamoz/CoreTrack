'use client';

import React, { useState, useEffect, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  fetchTickets,
  updateTicket,
  bulkUpdateTickets,
  createTicket,
  Ticket,
} from '../../lib/api';
import { useProject } from '../../context/ProjectContext';
import { useModuleAccess } from '../../hooks/useModuleAccess';
import { AccessDenied } from '../../components/auth/AccessDenied';
import { SLABadge } from '../../components/sla/SLABadge';
import { TicketDetailModal } from '../../components/kanban/TicketDetailModal';
import { CreateTicketModal } from '../../components/kanban/CreateTicketModal';
import { ImportTasksXlsxModal } from '../../components/kanban/ImportTasksXlsxModal';
import { usePermissions } from '../../hooks/usePermissions';
import {
  Table2,
  Plus,
  Search,
  Filter,
  CheckSquare,
  Square,
  Layers,
  ArrowUpDown,
  Download,
  AlertCircle,
  Clock,
  Calendar,
  Sparkles,
  ChevronDown,
  FileSpreadsheet,
} from 'lucide-react';

function TablePageInner() {
  const queryClient = useQueryClient();
  const searchParams = useSearchParams();
  const filterParam = searchParams.get('filter');
  const { activeProject } = useProject();
  const { canAccess } = useModuleAccess();
  const { user, roleTier } = usePermissions();
  const [selectedTicket, setSelectedTicket] = useState<Ticket | null>(null);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const canImport = roleTier >= 3;
  const [searchQuery, setSearchQuery] = useState('');
  const [priorityFilter, setPriorityFilter] = useState<string>('ALL');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');

  useEffect(() => {
    if (filterParam === 'at_risk') {
      setPriorityFilter('URGENT');
    }
  }, [filterParam]);

  // Multi-Select Batch State
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());

  // 1. Fetch tickets
  const { data: tickets = [], isLoading } = useQuery({
    queryKey: ['tickets', activeProject?.key || 'CORE'],
    queryFn: () => fetchTickets(activeProject?.key || 'CORE'),
    enabled: !!activeProject,
  });

  // Inline Quick Update Mutation
  const inlineUpdateMutation = useMutation({
    mutationFn: ({ ticketKey, lockVersion, updates }: { ticketKey: string; lockVersion: number; updates: Partial<Ticket> }) =>
      updateTicket(ticketKey, { ...updates, lockVersion }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tickets', activeProject?.key] });
    },
  });

  // Bulk Update Mutation
  const bulkMutation = useMutation({
    mutationFn: (data: { ticketKeys: string[]; status?: Ticket['status']; priority?: Ticket['priority'] }) =>
      bulkUpdateTickets(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tickets', activeProject?.key] });
      setSelectedKeys(new Set());
    },
  });

  // Filtered tickets
  const filteredTickets = tickets.filter((t) => {
    const matchesSearch =
      !searchQuery ||
      t.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      t.ticketKey.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesPriority = !priorityFilter || priorityFilter === 'ALL' || t.priority === priorityFilter;
    const matchesStatus = !statusFilter || statusFilter === 'ALL' || t.status === statusFilter;
    return matchesSearch && matchesPriority && matchesStatus;
  });

  const allFilteredSelected =
    filteredTickets.length > 0 && filteredTickets.every((t) => selectedKeys.has(t.ticketKey));

  const toggleSelectAll = () => {
    if (allFilteredSelected) {
      setSelectedKeys(new Set());
    } else {
      setSelectedKeys(new Set(filteredTickets.map((t) => t.ticketKey)));
    }
  };

  const toggleSelectTicket = (key: string) => {
    const next = new Set(selectedKeys);
    if (next.has(key)) {
      next.delete(key);
    } else {
      next.add(key);
    }
    setSelectedKeys(next);
  };

  const exportCSV = () => {
    const headers = ['Key', 'Title', 'Type', 'Status', 'Priority', 'Story Points', 'Created At'];
    const rows = filteredTickets.map((t) => [
      t.ticketKey,
      `"${t.title.replace(/"/g, '""')}"`,
      t.ticketType,
      t.status,
      t.priority,
      t.storyPoints ?? '',
      t.createdAt,
    ]);
    const csvContent = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `${activeProject?.key || 'CORE'}-tickets.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  if (!canAccess('table')) return <AccessDenied module="All Tasks Table" requiredRole="Team Lead or above" />;

  return (
    <div className="flex-1 flex flex-col min-w-0">
      {/* Standard Page Header */}
      <div className="mb-6 flex flex-col gap-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h1 className="text-xl md:text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100 flex items-center gap-2.5">
              <span>Table</span>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-semibold bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
                {filteredTickets.length} tasks
              </span>
            </h1>
            <p className="text-xs md:text-sm text-slate-500 dark:text-slate-400 mt-1">
              High-density spreadsheet view with inline editing and bulk actions.
            </p>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={exportCSV}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:border-slate-300 dark:hover:border-slate-600 text-xs font-semibold text-slate-700 dark:text-slate-300 shadow-2xs transition cursor-pointer"
            >
              <Download className="h-3.5 w-3.5 text-slate-500 dark:text-slate-400" />
              <span>Export</span>
            </button>
            {canImport && (
              <button
                onClick={() => setIsImportModalOpen(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:border-slate-300 dark:hover:border-slate-600 text-xs font-semibold text-slate-700 dark:text-slate-300 shadow-2xs transition cursor-pointer"
              >
                <FileSpreadsheet className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
                <span>Import XLSX</span>
              </button>
            )}
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
                placeholder="Filter tasks..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-8 pr-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:border-blue-600 focus:bg-white dark:focus:bg-slate-900 transition"
              />
            </div>

            <div className="flex items-center gap-2 overflow-x-auto pb-1 sm:pb-0">
              <div className="flex items-center gap-1.5">
                <span className="text-[11px] font-medium text-slate-400 flex items-center gap-1 mr-1">
                  <Filter className="h-3 w-3" /> Priority:
                </span>
                {['ALL', 'URGENT', 'HIGH', 'MEDIUM', 'LOW'].map((p) => (
                  <button
                    key={p}
                    onClick={() => setPriorityFilter(p)}
                    className={`px-2 py-0.5 rounded text-[11px] font-medium transition ${priorityFilter === p
                        ? 'bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 shadow-2xs font-semibold'
                        : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100'
                      }`}
                  >
                    {p}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Floating Bulk Action Bar (when rows are checked) */}
      {selectedKeys.size > 0 && (
        <div className="mb-4 p-3 rounded-xl border border-blue-200 dark:border-blue-900 bg-blue-50/90 dark:bg-blue-950/60 shadow-lg flex flex-col sm:flex-row items-center justify-between gap-3 animate-in fade-in slide-in-from-top-2">
          <div className="flex items-center gap-2">
            <span className="px-2 py-0.5 rounded-md bg-blue-600 text-white font-mono text-xs font-bold">
              {selectedKeys.size}
            </span>
            <span className="text-xs font-semibold text-blue-950 dark:text-blue-200">
              tasks selected for batch modification
            </span>
          </div>

          <div className="flex items-center gap-2">
            {/* Bulk Status Dropdown */}
            <select
              onChange={(e) => {
                const newStatus = e.target.value as Ticket['status'];
                if (!newStatus) return;
                if (roleTier < 2) {
                  const unauthorized = filteredTickets.filter(
                    (t) => selectedKeys.has(t.ticketKey) && t.assigneeId !== user?.id
                  );
                  if (unauthorized.length > 0) {
                    alert(
                      `Access Denied: You cannot modify tasks assigned to others (${unauthorized.map((t) => t.ticketKey).join(', ')}). Only the assigned person or higher authorities can update tasks.`
                    );
                    e.target.value = '';
                    return;
                  }
                }
                bulkMutation.mutate({
                  ticketKeys: Array.from(selectedKeys),
                  status: newStatus,
                });
                e.target.value = '';
              }}
              disabled={bulkMutation.isPending}
              className="px-2.5 py-1.5 rounded-lg border border-blue-200 dark:border-blue-800 bg-white dark:bg-slate-900 text-xs font-semibold text-slate-800 dark:text-slate-200 focus:outline-none focus:border-blue-600 cursor-pointer shadow-2xs"
            >
              <option value="">Bulk Set Status...</option>
              <option value="TODO">To Do</option>
              <option value="IN_PROGRESS">In Progress</option>
              <option value="IN_REVIEW">In Review</option>
              <option value="DONE">Done</option>
              <option value="CANCELED">Canceled</option>
            </select>

            {/* Bulk Priority Dropdown */}
            <select
              onChange={(e) => {
                const newPriority = e.target.value as Ticket['priority'];
                if (!newPriority) return;
                if (roleTier < 2) {
                  const unauthorized = filteredTickets.filter(
                    (t) => selectedKeys.has(t.ticketKey) && t.assigneeId !== user?.id
                  );
                  if (unauthorized.length > 0) {
                    alert(
                      `Access Denied: You cannot modify tasks assigned to others (${unauthorized.map((t) => t.ticketKey).join(', ')}). Only the assigned person or higher authorities can update tasks.`
                    );
                    e.target.value = '';
                    return;
                  }
                }
                bulkMutation.mutate({
                  ticketKeys: Array.from(selectedKeys),
                  priority: newPriority,
                });
                e.target.value = '';
              }}
              disabled={bulkMutation.isPending}
              className="px-2.5 py-1.5 rounded-lg border border-blue-200 dark:border-blue-800 bg-white dark:bg-slate-900 text-xs font-semibold text-slate-800 dark:text-slate-200 focus:outline-none focus:border-blue-600 cursor-pointer shadow-2xs"
            >
              <option value="">Bulk Set Priority...</option>
              <option value="URGENT">Urgent</option>
              <option value="HIGH">High</option>
              <option value="MEDIUM">Medium</option>
              <option value="LOW">Low</option>
            </select>

            <button
              onClick={() => setSelectedKeys(new Set())}
              className="px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs text-slate-600 dark:text-slate-300 hover:bg-slate-50"
            >
              Clear
            </button>
          </div>
        </div>
      )}

      {/* Spreadsheet Table Container */}
      <div className="flex-1 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-2xs overflow-hidden flex flex-col">
        <div className="overflow-x-auto flex-1">
          <table className="w-full text-left border-collapse text-xs">
            {/* Table Header */}
            <thead>
              <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/60 text-slate-600 dark:text-slate-400 select-none">
                <th className="p-3 w-10 text-center">
                  <button
                    onClick={toggleSelectAll}
                    title="Select All"
                    className="text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
                  >
                    {allFilteredSelected ? (
                      <CheckSquare className="h-4 w-4 text-blue-600" />
                    ) : (
                      <Square className="h-4 w-4" />
                    )}
                  </button>
                </th>
                <th className="p-3 font-semibold w-24">Key</th>
                <th className="p-3 font-semibold min-w-[240px]">Summary</th>
                <th className="p-3 font-semibold w-32">Status</th>
                <th className="p-3 font-semibold w-28">Priority</th>
                <th className="p-3 font-semibold w-20">Points</th>
                <th className="p-3 font-semibold w-28">Deadline</th>
                <th className="p-3 font-semibold w-36">SLA Countdown</th>
                <th className="p-3 font-semibold w-28">Created</th>
              </tr>
            </thead>

            {/* Table Rows */}
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">
              {filteredTickets.length === 0 ? (
                <tr>
                  <td colSpan={9} className="p-12 text-center text-xs text-slate-400">
                    No tickets match the query.
                  </td>
                </tr>
              ) : (
                filteredTickets.map((ticket) => {
                  const isChecked = selectedKeys.has(ticket.ticketKey);
                  const isAssignedToCurrentUser = Boolean(user?.id && ticket.assigneeId === user.id);
                  const isHigherAuthority = roleTier >= 2;
                  const canEditTicket = isHigherAuthority || isAssignedToCurrentUser || (!ticket.assigneeId && ticket.reporterId === user?.id);

                  return (
                    <tr
                      key={ticket.id}
                      onClick={() => setSelectedTicket(ticket)}
                      className={`hover:bg-slate-50/80 dark:hover:bg-slate-800/40 cursor-pointer transition ${isChecked ? 'bg-blue-50/40 dark:bg-blue-950/20' : ''
                        }`}
                    >
                      {/* Checkbox */}
                      <td
                        className="p-3 text-center"
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleSelectTicket(ticket.ticketKey);
                        }}
                      >
                        {isChecked ? (
                          <CheckSquare className="h-4 w-4 text-blue-600" />
                        ) : (
                          <Square className="h-4 w-4 text-slate-300 dark:text-slate-600 hover:text-slate-500" />
                        )}
                      </td>

                      {/* Ticket Key */}
                      <td className="p-3 font-mono font-semibold text-slate-500 dark:text-slate-400">
                        {ticket.displayKey || ticket.ticketKey}
                      </td>

                      {/* Title */}
                      <td className="p-3 font-medium text-slate-900 dark:text-slate-100">
                        {ticket.title}
                      </td>

                      {/* Status with Inline Quick-Select */}
                      <td
                        className="p-3"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <select
                          value={ticket.status}
                          onChange={(e) =>
                            inlineUpdateMutation.mutate({
                              ticketKey: ticket.ticketKey,
                              lockVersion: ticket.lockVersion,
                              updates: { status: e.target.value as Ticket['status'] },
                            })
                          }
                          disabled={!canEditTicket || inlineUpdateMutation.isPending}
                          title={!canEditTicket ? 'Only assigned person or higher authorities can change status' : undefined}
                          className={`px-2 py-0.5 rounded-md border text-[11px] font-semibold focus:outline-none ${
                            !canEditTicket
                              ? 'border-slate-200 dark:border-slate-800 bg-slate-100 dark:bg-slate-800 text-slate-400 dark:text-slate-500 cursor-not-allowed'
                              : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200 cursor-pointer hover:border-slate-400'
                          }`}
                        >
                          <option value="TODO">To Do</option>
                          <option value="IN_PROGRESS">In Progress</option>
                          <option value="IN_REVIEW">In Review</option>
                          <option value="DONE">Done</option>
                          <option value="CANCELED">Canceled</option>
                        </select>
                      </td>

                      {/* Priority with Inline Quick-Select */}
                      <td
                        className="p-3"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <select
                          value={ticket.priority}
                          onChange={(e) =>
                            inlineUpdateMutation.mutate({
                              ticketKey: ticket.ticketKey,
                              lockVersion: ticket.lockVersion,
                              updates: { priority: e.target.value as Ticket['priority'] },
                            })
                          }
                          disabled={!canEditTicket || inlineUpdateMutation.isPending}
                          title={!canEditTicket ? 'Only assigned person or higher authorities can change priority' : undefined}
                          className={`px-2 py-0.5 rounded-md border text-[11px] font-semibold focus:outline-none ${
                            !canEditTicket
                              ? 'border-slate-200 dark:border-slate-800 bg-slate-100 dark:bg-slate-800 text-slate-400 dark:text-slate-500 cursor-not-allowed'
                              : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200 cursor-pointer hover:border-slate-400'
                          }`}
                        >
                          <option value="URGENT">Urgent</option>
                          <option value="HIGH">High</option>
                          <option value="MEDIUM">Medium</option>
                          <option value="LOW">Low</option>
                        </select>
                      </td>

                      {/* Story Points */}
                      <td className="p-3 font-mono text-slate-600 dark:text-slate-300">
                        {ticket.storyPoints !== null && ticket.storyPoints !== undefined
                          ? `${ticket.storyPoints} pts`
                          : '—'}
                      </td>

                      {/* Deadline */}
                      <td className="p-3">
                        {ticket.dueDate ? (
                          <span className="inline-flex items-center gap-1 font-mono text-[11px] font-medium text-slate-700 dark:text-slate-300">
                            <Calendar className="h-3 w-3 text-blue-500 shrink-0" />
                            {new Date(ticket.dueDate).toLocaleDateString()}
                          </span>
                        ) : ticket.assigneeId ? (
                          <span className="text-[10px] text-amber-600 dark:text-amber-400 font-medium">Pending deadline</span>
                        ) : (
                          <span className="text-slate-400">—</span>
                        )}
                      </td>

                      {/* SLA Countdown Badge */}
                      <td className="p-3">
                        <SLABadge
                          dueAt={ticket.slaResolutionDueAt}
                          isPaused={ticket.isSlaPaused}
                          isResolved={ticket.status === 'DONE' || ticket.status === 'RESOLVED'}
                          compact
                        />
                      </td>

                      {/* Created Date */}
                      <td className="p-3 text-[11px] text-slate-500 dark:text-slate-400">
                        {new Date(ticket.createdAt).toLocaleDateString()}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

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

      {/* Import XLSX Modal */}
      {canImport && (
        <ImportTasksXlsxModal
          isOpen={isImportModalOpen}
          onClose={() => setIsImportModalOpen(false)}
        />
      )}
    </div>
  );
}

export default function TablePage() {
  return (
    <Suspense fallback={<div className="p-6 text-xs text-slate-400">Loading table view...</div>}>
      <TablePageInner />
    </Suspense>
  );
}
