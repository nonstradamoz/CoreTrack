'use client';

import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { fetchTickets, createTicket, Ticket } from '../lib/api';
import { KanbanBoard } from '../components/kanban/KanbanBoard';
import { CreateTicketModal } from '../components/kanban/CreateTicketModal';
import { TicketDetailModal } from '../components/kanban/TicketDetailModal';
import { ImportTasksXlsxModal } from '../components/kanban/ImportTasksXlsxModal';
import { useProject } from '../context/ProjectContext';
import { usePermissions } from '../hooks/usePermissions';
import { Plus, Search, Filter, FolderGit2, FileSpreadsheet } from 'lucide-react';
import Link from 'next/link';

export default function Home() {
  const queryClient = useQueryClient();
  const { activeProject, projects, isLoadingProjects } = useProject();
  const [selectedTicket, setSelectedTicket] = useState<Ticket | null>(null);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const { roleTier } = usePermissions();
  const canImport = roleTier >= 3;

  // Functional Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [priorityFilter, setPriorityFilter] = useState<'ALL' | 'URGENT' | 'HIGH' | 'MEDIUM' | 'LOW'>('ALL');

  // Fetch project tickets
  const { data: tickets = [] } = useQuery({
    queryKey: ['tickets', activeProject?.key || 'CORE'],
    queryFn: () => fetchTickets(activeProject?.key || 'CORE'),
    enabled: !!activeProject,
  });

  // Create ticket mutation
  const createTicketMutation = useMutation({
    mutationFn: createTicket,
    onSuccess: () => {
      if (activeProject) {
        queryClient.invalidateQueries({ queryKey: ['tickets', activeProject.key] });
      }
      setIsCreateModalOpen(false);
    },
  });

  const priorities: ('ALL' | 'URGENT' | 'HIGH' | 'MEDIUM' | 'LOW')[] = [
    'ALL',
    'URGENT',
    'HIGH',
    'MEDIUM',
    'LOW',
  ];

  if (!isLoadingProjects && projects.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-8 text-center min-h-[500px]">
        <div className="w-16 h-16 rounded-3xl bg-blue-50 dark:bg-blue-950/60 border border-blue-200 dark:border-blue-900/50 flex items-center justify-center text-blue-600 mb-4 shadow-xs">
          <FolderGit2 className="w-8 h-8" />
        </div>
        <h3 className="text-base font-bold text-slate-900 dark:text-slate-100 mb-1">No Projects Found</h3>
        <p className="text-xs text-slate-500 dark:text-slate-400 max-w-sm mb-6">
          Your workspace is completely clean. Create your first project to start organizing tasks, sprints, and team deliverables.
        </p>
        <Link
          href="/projects"
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-semibold text-xs shadow-sm transition active:scale-95"
        >
          <Plus className="w-4 h-4" />
          Create First Project
        </Link>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col min-w-0">
      {/* Standard Page Header */}
      <div className="mb-6 flex flex-col gap-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h1 className="text-xl md:text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
              {activeProject?.name || 'Engineering'} Board
            </h1>
            <p className="text-xs md:text-sm text-slate-500 dark:text-slate-400 mt-1">
              Sprint tasks and workflow state tracking.
            </p>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {canImport && (
              <button
                onClick={() => setIsImportModalOpen(true)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:border-slate-300 dark:hover:border-slate-600 text-slate-700 dark:text-slate-300 text-xs font-semibold shadow-2xs transition active:scale-[0.98] cursor-pointer"
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
            {/* Functional Search Input */}
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-slate-400" />
              <input
                type="text"
                placeholder="Filter tasks by key or title..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-8 pr-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:border-blue-600 focus:bg-white dark:focus:bg-slate-900 transition"
              />
            </div>

            {/* Functional Priority Pill Selectors */}
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0">
              <span className="text-[11px] font-medium text-slate-400 flex items-center gap-1 mr-1">
                <Filter className="h-3 w-3" /> Priority:
              </span>
              {priorities.map((p) => (
                <button
                  key={p}
                  onClick={() => setPriorityFilter(p)}
                  className={`px-2.5 py-1 rounded-md text-[11px] font-medium transition ${
                    priorityFilter === p
                      ? 'bg-blue-600 text-white shadow-2xs font-semibold'
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

      {/* Main Kanban Content */}
      {activeProject ? (
        <KanbanBoard
          project={activeProject}
          searchQuery={searchQuery}
          priorityFilter={priorityFilter}
        />
      ) : (
        <div className="flex-1 flex flex-col items-center justify-center text-center p-12">
          <p className="text-xs text-slate-400 dark:text-slate-500">Loading project board...</p>
        </div>
      )}

      {/* Create Task Modal */}
      {isCreateModalOpen && activeProject && (
        <CreateTicketModal
          projectId={activeProject.id}
          isOpen={isCreateModalOpen}
          onClose={() => setIsCreateModalOpen(false)}
          onSubmit={async (data) => {
            await createTicketMutation.mutateAsync(data);
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

      {/* Ticket Detail Modal */}
      <TicketDetailModal
        ticket={selectedTicket}
        onClose={() => setSelectedTicket(null)}
      />
    </div>
  );
}
