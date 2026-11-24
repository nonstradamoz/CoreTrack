'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  fetchProjects,
  fetchProjectMetrics,
  createProject,
  updateProject,
  fetchTeams,
  fetchCurrentUser,
  fetchAvailableUsers,
  deleteProject,
  Project,
} from '../../lib/api';
import { CreateProjectModal } from '../../components/projects/CreateProjectModal';
import { usePermissions } from '../../hooks/usePermissions';
import { Permissions } from '../../lib/permissions';
import {
  FolderGit2,
  Plus,
  Search,
  Calendar,
  Clock,
  CheckCircle2,
  AlertTriangle,
  Users,
  ShieldCheck,
  ChevronRight,
  Filter,
  ArrowUpRight,
  Archive,
  Edit2,
  Trash2,
  Lock,
  Layers,
  Sparkles,
  LayoutGrid,
} from 'lucide-react';

export default function ProjectsPage() {
  const queryClient = useQueryClient();
  const { hasPermission, isOrgAdmin, roleTier } = usePermissions();
  const canCreateProject = isOrgAdmin || (roleTier >= 3 && hasPermission(Permissions.PROJECT_CREATE));
  const canEditProjectGeneral = isOrgAdmin || (roleTier >= 3 && hasPermission(Permissions.PROJECT_EDIT));
  const canDeleteProjects = isOrgAdmin || roleTier >= 4 || hasPermission(Permissions.PROJECT_DELETE);

  const [activeTab, setActiveTab] = useState<'ALL' | 'ACTIVE' | 'OVERDUE' | 'COMPLETED' | 'ON_HOLD' | 'ARCHIVED'>('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [editingProject, setEditingProject] = useState<Project | null>(null);
  const [deletingKey, setDeletingKey] = useState<string | null>(null);

  const deleteProjectMutation = useMutation({
    mutationFn: (key: string) => deleteProject(key),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['projects'] });
      queryClient.invalidateQueries({ queryKey: ['projectMetrics'] });
      setDeletingKey(null);
    },
    onError: (err: Error) => {
      alert(err.message || 'Failed to delete project');
      setDeletingKey(null);
    },
  });

  const handleDeleteProject = (p: Project) => {
    if (!canDeleteProjects) {
      alert('Access Denied: Only higher authorities (Admins & Super Admins) can delete projects.');
      return;
    }
    if (
      confirm(
        `Are you sure you want to permanently delete project "${p.name}" (${p.key})?\n\nThis will permanently delete all tasks, sprints, milestones, and audit logs. This action cannot be undone.`
      )
    ) {
      setDeletingKey(p.key);
      deleteProjectMutation.mutate(p.key);
    }
  };

  // Queries
  const { data: projects = [], isLoading: isProjectsLoading } = useQuery({
    queryKey: ['projects'],
    queryFn: fetchProjects,
  });

  const { data: metrics } = useQuery({
    queryKey: ['projectMetrics'],
    queryFn: fetchProjectMetrics,
  });

  const { data: teamsList = [] } = useQuery({
    queryKey: ['teams'],
    queryFn: fetchTeams,
  });

  const { data: currentUser } = useQuery({
    queryKey: ['currentUser'],
    queryFn: fetchCurrentUser,
  });

  const { data: availableUsers = [] } = useQuery({
    queryKey: ['availableUsers'],
    queryFn: fetchAvailableUsers,
  });

  // Filter projects by tab, archive, and search
  const filteredProjects = projects.filter((p) => {
    // Archive check
    if (activeTab === 'ARCHIVED') {
      if (!p.archived) return false;
    } else {
      if (p.archived) return false;
    }

    // Status check
    const status = p.computedStatus || p.status || 'NOT_STARTED';
    if (activeTab === 'ACTIVE' && status !== 'IN_PROGRESS') return false;
    if (activeTab === 'OVERDUE' && status !== 'OVERDUE') return false;
    if (activeTab === 'COMPLETED' && status !== 'COMPLETED') return false;
    if (activeTab === 'ON_HOLD' && status !== 'ON_HOLD') return false;

    // Search query
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const matchName = p.name.toLowerCase().includes(q);
      const matchKey = p.key.toLowerCase().includes(q);
      const matchPM = p.projectManager?.fullName.toLowerCase().includes(q);
      if (!matchName && !matchKey && !matchPM) return false;
    }

    return true;
  });

  // Helper function to format status badges
  const getStatusBadge = (status?: string) => {
    switch (status) {
      case 'OVERDUE':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-rose-100 text-rose-700 dark:bg-rose-950/80 dark:text-rose-400 border border-rose-200 dark:border-rose-800">
            <AlertTriangle className="h-3 w-3" /> Overdue
          </span>
        );
      case 'COMPLETED':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-100 text-emerald-700 dark:bg-emerald-950/80 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800">
            <CheckCircle2 className="h-3 w-3" /> Completed
          </span>
        );
      case 'IN_PROGRESS':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-blue-100 text-blue-700 dark:bg-blue-950/80 dark:text-blue-400 border border-blue-200 dark:border-blue-800">
            <span className="h-1.5 w-1.5 rounded-full bg-blue-600 dark:bg-blue-400 animate-pulse" /> In Progress
          </span>
        );
      case 'ON_HOLD':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-amber-100 text-amber-700 dark:bg-amber-950/80 dark:text-amber-400 border border-amber-200 dark:border-amber-800">
            <Clock className="h-3 w-3" /> On Hold
          </span>
        );
      case 'UNDER_REVIEW':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-purple-100 text-purple-700 dark:bg-purple-950/80 dark:text-purple-400 border border-purple-200 dark:border-purple-800">
            <ShieldCheck className="h-3 w-3" /> Under Review
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-400 border border-slate-200 dark:border-slate-700">
            Not Started
          </span>
        );
    }
  };

  return (
    <div className="flex-1 flex flex-col h-full bg-[#F5F6F8] dark:bg-[#111318] overflow-y-auto">
      {/* Top Header Banner */}
      <div className="border-b border-slate-200/80 dark:border-slate-800/80 bg-white dark:bg-slate-900 px-6 py-5 transition-colors">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 max-w-7xl mx-auto">
          <div>
            <div className="flex items-center gap-2 text-xs text-slate-400 dark:text-slate-500 font-medium mb-1">
              <span>Organization</span>
              <ChevronRight className="h-3.5 w-3.5" />
              <span className="text-slate-900 dark:text-slate-200 font-semibold">Project Management</span>
            </div>
            <h1 className="text-xl md:text-2xl font-bold text-slate-900 dark:text-slate-100 tracking-tight">
              Projects & Portfolios
            </h1>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Manage enterprise projects, assignments, milestones, and deliverable deadlines
            </p>
          </div>

          <div className="flex items-center gap-3">
            {canCreateProject && (
              <button
                onClick={() => setIsCreateModalOpen(true)}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-semibold text-xs shadow-sm transition active:scale-95 cursor-pointer"
              >
                <Plus className="h-4 w-4" />
                <span>Create Project</span>
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="p-6 max-w-7xl mx-auto w-full space-y-6">
        {/* 1. AGGREGATE METRICS CARDS */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3.5">
          <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800/80 shadow-2xs">
            <div className="flex items-center justify-between text-slate-400 text-xs font-semibold">
              <span>Total Projects</span>
              <FolderGit2 className="h-4 w-4 text-blue-500" />
            </div>
            <div className="mt-2 text-2xl font-black text-slate-900 dark:text-slate-100 tracking-tight">
              {metrics?.totalProjects ?? projects.length}
            </div>
            <div className="mt-1 text-[11px] text-slate-400">Org-wide active workspace</div>
          </div>

          <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800/80 shadow-2xs">
            <div className="flex items-center justify-between text-slate-400 text-xs font-semibold">
              <span>Active</span>
              <span className="h-2 w-2 rounded-full bg-blue-500 animate-pulse" />
            </div>
            <div className="mt-2 text-2xl font-black text-blue-600 dark:text-blue-400 tracking-tight">
              {metrics?.activeProjects ?? 0}
            </div>
            <div className="mt-1 text-[11px] text-slate-400">In continuous execution</div>
          </div>

          <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800/80 shadow-2xs">
            <div className="flex items-center justify-between text-slate-400 text-xs font-semibold">
              <span>Overdue</span>
              <AlertTriangle className="h-4 w-4 text-rose-500" />
            </div>
            <div className="mt-2 text-2xl font-black text-rose-600 dark:text-rose-400 tracking-tight">
              {metrics?.overdueProjects ?? 0}
            </div>
            <div className="mt-1 text-[11px] text-rose-500/80 font-medium">Requires immediate intervention</div>
          </div>

          <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800/80 shadow-2xs">
            <div className="flex items-center justify-between text-slate-400 text-xs font-semibold">
              <span>Completed</span>
              <CheckCircle2 className="h-4 w-4 text-emerald-500" />
            </div>
            <div className="mt-2 text-2xl font-black text-emerald-600 dark:text-emerald-400 tracking-tight">
              {metrics?.completedProjects ?? 0}
            </div>
            <div className="mt-1 text-[11px] text-slate-400">Delivered successfully</div>
          </div>

          <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800/80 shadow-2xs col-span-2 sm:col-span-1">
            <div className="flex items-center justify-between text-slate-400 text-xs font-semibold">
              <span>Overall Progress</span>
              <Sparkles className="h-4 w-4 text-indigo-500" />
            </div>
            <div className="mt-2 text-2xl font-black text-indigo-600 dark:text-indigo-400 tracking-tight">
              {metrics?.overallProgress ?? 0}%
            </div>
            <div className="mt-1.5 w-full bg-slate-100 dark:bg-slate-800 h-1.5 rounded-full overflow-hidden">
              <div
                className="bg-indigo-600 dark:bg-indigo-400 h-full rounded-full transition-all duration-500"
                style={{ width: `${metrics?.overallProgress ?? 0}%` }}
              />
            </div>
          </div>
        </div>

        {/* 2. FILTER TABS & SEARCH BAR */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 pt-2">
          {/* Tabs */}
          <div className="flex items-center gap-1.5 p-1 rounded-xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800/80 overflow-x-auto shadow-2xs">
            {(['ALL', 'ACTIVE', 'OVERDUE', 'COMPLETED', 'ON_HOLD', 'ARCHIVED'] as const).map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition whitespace-nowrap cursor-pointer ${
                  activeTab === tab
                    ? 'bg-blue-600 text-white shadow-2xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800/60'
                }`}
              >
                {tab === 'ALL'
                  ? 'All Projects'
                  : tab === 'ACTIVE'
                    ? 'Active'
                    : tab === 'OVERDUE'
                      ? 'Overdue'
                      : tab === 'COMPLETED'
                        ? 'Completed'
                        : tab === 'ON_HOLD'
                          ? 'On Hold'
                          : 'Archived'}
              </button>
            ))}
          </div>

          {/* Search box */}
          <div className="relative min-w-[240px]">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
            <input
              type="text"
              placeholder="Search projects, keys, managers..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-3 py-1.5 rounded-xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 text-xs text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:outline-hidden focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition shadow-2xs"
            />
          </div>
        </div>

        {/* 3. PROJECTS CARDS GRID */}
        {isProjectsLoading ? (
          <div className="py-20 text-center text-xs text-slate-400">Loading projects portfolio...</div>
        ) : filteredProjects.length === 0 ? (
          <div className="py-16 text-center rounded-2xl border border-dashed border-slate-300 dark:border-slate-800 p-8 bg-white/50 dark:bg-slate-900/40">
            <FolderGit2 className="h-10 w-10 text-slate-300 dark:text-slate-600 mx-auto mb-3" />
            <div className="text-sm font-bold text-slate-700 dark:text-slate-300">No projects found</div>
            <p className="text-xs text-slate-400 mt-1 max-w-sm mx-auto mb-4">
              {searchQuery ? `No projects match "${searchQuery}"` : 'There are currently no projects in your workspace.'}
            </p>
            {canCreateProject && !searchQuery && (
              <button
                onClick={() => setIsCreateModalOpen(true)}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-semibold text-xs shadow-sm transition active:scale-95 cursor-pointer"
              >
                <Plus className="h-4 w-4" />
                <span>Create First Project</span>
              </button>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredProjects.map((p) => {
              const progress = p.progressPercentage ?? 0;
              const status = p.computedStatus || p.status || 'NOT_STARTED';
              const isManager = (roleTier >= 3) && currentUser && p.projectManagerId === currentUser.id;
              const canEditThisProject = canEditProjectGeneral || isManager;

              return (
                <div
                  key={p.id}
                  className="rounded-2xl border border-slate-200/80 dark:border-slate-800/80 bg-white dark:bg-slate-900 p-5 shadow-2xs hover:shadow-md hover:border-blue-300 dark:hover:border-blue-900/60 transition-all flex flex-col justify-between"
                >
                  <div>
                    {/* Header: Key & Status Badge */}
                    <div className="flex items-center justify-between gap-2 mb-2.5">
                      <div className="flex items-center gap-2">
                        <span className="px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 text-[11px] font-mono font-bold text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
                          {p.key}
                        </span>
                        {p.primaryTeam && (
                          <span className="text-[11px] text-slate-400 dark:text-slate-500 font-medium">
                            {p.primaryTeam.name}
                          </span>
                        )}
                      </div>
                      {getStatusBadge(status)}
                    </div>

                    {/* Project Title & Description */}
                    <Link
                      href={`/projects/${p.key}`}
                      className="group block"
                    >
                      <h3 className="text-base font-bold text-slate-900 dark:text-slate-100 group-hover:text-blue-600 dark:group-hover:text-blue-400 transition tracking-tight">
                        {p.name}
                      </h3>
                    </Link>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 line-clamp-2 leading-relaxed">
                      {p.description || 'Enterprise project under active delivery and team execution.'}
                    </p>

                    {/* Progress Bar */}
                    <div className="mt-4 pt-4 border-t border-slate-100 dark:border-slate-800/80">
                      <div className="flex items-center justify-between text-xs font-semibold mb-1.5">
                        <span className="text-slate-600 dark:text-slate-400">Task Completion</span>
                        <span className="text-slate-900 dark:text-slate-100 font-bold">{progress}%</span>
                      </div>
                      <div className="w-full bg-slate-100 dark:bg-slate-800 h-2 rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all duration-300 ${
                            status === 'OVERDUE'
                              ? 'bg-rose-500'
                              : status === 'COMPLETED'
                                ? 'bg-emerald-500'
                                : 'bg-blue-600'
                          }`}
                          style={{ width: `${progress}%` }}
                        />
                      </div>
                      <div className="flex items-center justify-between text-[11px] text-slate-400 mt-1">
                        <span>
                          {p.completedTicketsCount ?? 0} / {p.totalTicketsCount ?? 0} tasks resolved
                        </span>
                        {p.milestonesCount !== undefined && p.milestonesCount > 0 && (
                          <span>
                            {p.completedMilestonesCount ?? 0}/{p.milestonesCount} milestones
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Personnel & Dates Stack */}
                    <div className="mt-4 space-y-2 text-xs">
                      {/* Project Manager */}
                      <div className="flex items-center justify-between">
                        <span className="text-slate-400">Project Manager</span>
                        <div className="flex items-center gap-1.5 font-medium text-slate-700 dark:text-slate-300">
                          <div className="h-5 w-5 rounded-full bg-blue-600 text-[10px] font-bold text-white flex items-center justify-center">
                            {p.projectManager?.fullName ? p.projectManager.fullName[0] : 'U'}
                          </div>
                          <span>{p.projectManager?.fullName || 'Unassigned'}</span>
                        </div>
                      </div>

                      {/* Reviewer */}
                      {p.reviewer && (
                        <div className="flex items-center justify-between">
                          <span className="text-slate-400">Reviewer</span>
                          <div className="flex items-center gap-1.5 font-medium text-slate-700 dark:text-slate-300">
                            <div className="h-5 w-5 rounded-full bg-slate-700 text-[10px] font-bold text-white flex items-center justify-center">
                              {p.reviewer.fullName[0]}
                            </div>
                            <span>{p.reviewer.fullName}</span>
                          </div>
                        </div>
                      )}

                      {/* Deadline */}
                      <div className="flex items-center justify-between">
                        <span className="text-slate-400">Target Deadline</span>
                        <div className="flex items-center gap-1.5 font-medium text-slate-700 dark:text-slate-300">
                          <Calendar className="h-3.5 w-3.5 text-slate-400" />
                          <span>
                            {p.deadline ? new Date(p.deadline).toLocaleDateString() : 'No date set'}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Footer Actions */}
                  <div className="mt-5 pt-3.5 border-t border-slate-100 dark:border-slate-800/80 flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <Link
                        href={`/projects/${p.key}`}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 text-xs font-semibold hover:bg-slate-200 dark:hover:bg-slate-700 transition"
                      >
                        <span>Details</span>
                        <ChevronRight className="h-3.5 w-3.5" />
                      </Link>

                      <Link
                        href={`/?projectKey=${p.key}`}
                        title="Open Kanban Board"
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-950/60 transition"
                      >
                        <LayoutGrid className="h-3.5 w-3.5" />
                        <span>Board</span>
                      </Link>
                    </div>

                    <div className="flex items-center gap-1">
                      {canEditThisProject && (
                        <button
                          onClick={() => setEditingProject(p)}
                          className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition cursor-pointer"
                          title="Edit Project"
                        >
                          <Edit2 className="h-3.5 w-3.5" />
                        </button>
                      )}

                      {canDeleteProjects ? (
                        <button
                          onClick={() => handleDeleteProject(p)}
                          disabled={deletingKey === p.key}
                          className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/50 transition cursor-pointer"
                          title="Delete Project (Higher Authorities Only)"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      ) : (
                        <span
                          className="p-1.5 rounded-lg text-slate-300 dark:text-slate-700 cursor-not-allowed"
                          title="Only higher authorities (Super Admin & Admin) can delete projects"
                        >
                          <Lock className="h-3 w-3" />
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* CREATE PROJECT MODAL (Super Admin / Admin Only) */}
      {isCreateModalOpen && (
        <CreateProjectModal
          isOpen={isCreateModalOpen}
          onClose={() => setIsCreateModalOpen(false)}
          teams={teamsList}
          availableUsers={availableUsers}
          onSuccess={() => {
            queryClient.invalidateQueries({ queryKey: ['projects'] });
            queryClient.invalidateQueries({ queryKey: ['projectMetrics'] });
            setIsCreateModalOpen(false);
          }}
        />
      )}

      {/* EDIT PROJECT MODAL */}
      {editingProject && (
        <EditProjectModal
          project={editingProject}
          isOpen={!!editingProject}
          onClose={() => setEditingProject(null)}
          teams={teamsList}
          availableUsers={availableUsers}
          onSuccess={() => {
            queryClient.invalidateQueries({ queryKey: ['projects'] });
            queryClient.invalidateQueries({ queryKey: ['projectMetrics'] });
            setEditingProject(null);
          }}
        />
      )}
    </div>
  );
}

// ----------------------------------------------------
// EDIT PROJECT MODAL COMPONENT
// ----------------------------------------------------
function EditProjectModal({
  project,
  isOpen,
  onClose,
  teams,
  availableUsers,
  onSuccess,
}: {
  project: Project;
  isOpen: boolean;
  onClose: () => void;
  teams: any[];
  availableUsers: any[];
  onSuccess: () => void;
}) {
  const [name, setName] = useState(project.name);
  const [description, setDescription] = useState(project.description || '');
  const [projectManagerId, setProjectManagerId] = useState(project.projectManagerId || '');
  const [reviewerId, setReviewerId] = useState(project.reviewerId || '');
  const [status, setStatus] = useState(project.status || 'IN_PROGRESS');
  const [startDate, setStartDate] = useState(
    project.startDate ? new Date(project.startDate).toISOString().split('T')[0] : ''
  );
  const [deadline, setDeadline] = useState(
    project.deadline ? new Date(project.deadline).toISOString().split('T')[0] : ''
  );
  const [archived, setArchived] = useState(!!project.archived);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setErrorMsg('');

    try {
      await updateProject(project.key, {
        name: name.trim(),
        description: description.trim() || undefined,
        projectManagerId: projectManagerId || null,
        reviewerId: reviewerId || null,
        status,
        startDate: startDate ? new Date(startDate).toISOString() : null,
        deadline: deadline ? new Date(deadline).toISOString() : null,
        archived,
      });
      onSuccess();
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to update project');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 overflow-y-auto">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl w-full max-w-lg p-6 shadow-xl space-y-4 my-8">
        <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
          <div className="flex items-center gap-2">
            <Edit2 className="h-5 w-5 text-blue-600" />
            <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">
              Edit Project ({project.key})
            </h2>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 text-xs font-semibold"
          >
            ✕
          </button>
        </div>

        {errorMsg && (
          <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/60 text-rose-600 dark:text-rose-400 text-xs font-medium border border-rose-200 dark:border-rose-900">
            {errorMsg}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
              Project Name
            </label>
            <input
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 text-xs text-slate-900 dark:text-slate-100"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
              Description
            </label>
            <textarea
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 text-xs text-slate-900 dark:text-slate-100"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                Project Manager
              </label>
              <select
                value={projectManagerId}
                onChange={(e) => setProjectManagerId(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 text-xs text-slate-900 dark:text-slate-100"
              >
                <option value="">-- No Manager --</option>
                {availableUsers.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.fullName}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                Reviewer
              </label>
              <select
                value={reviewerId}
                onChange={(e) => setReviewerId(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 text-xs text-slate-900 dark:text-slate-100"
              >
                <option value="">-- No Reviewer --</option>
                {availableUsers.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.fullName}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                Status
              </label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 text-xs text-slate-900 dark:text-slate-100"
              >
                <option value="NOT_STARTED">Not Started</option>
                <option value="IN_PROGRESS">In Progress</option>
                <option value="ON_HOLD">On Hold</option>
                <option value="UNDER_REVIEW">Under Review</option>
                <option value="COMPLETED">Completed</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                Target Deadline
              </label>
              <input
                type="date"
                value={deadline}
                onChange={(e) => setDeadline(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 text-xs text-slate-900 dark:text-slate-100"
              />
            </div>
          </div>

          <div className="flex items-center gap-2 pt-1">
            <input
              type="checkbox"
              id="archivedCheck"
              checked={archived}
              onChange={(e) => setArchived(e.target.checked)}
              className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
            />
            <label htmlFor="archivedCheck" className="text-xs font-bold text-slate-700 dark:text-slate-300">
              Archive Project (Hide from active views)
            </label>
          </div>

          <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100 dark:border-slate-800">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-semibold text-xs shadow-xs transition disabled:opacity-50"
            >
              {isSubmitting ? 'Saving Changes...' : 'Save Changes'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
