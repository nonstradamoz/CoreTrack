'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  fetchProjectByKey,
  fetchAvailableUsers,
  fetchRoles,
  createMilestone,
  updateMilestone,
  deleteMilestone,
  assignProjectMemberRole,
  removeProjectMember,
  updateProject,
  deleteProject,
  fetchCurrentUser,
  fetchProjectGithubConfig,
  saveProjectGithubConfig,
  syncProjectGithub,
  fetchTeams,
  updateProjectTeams,
  createTicket,
  ProjectMilestone,
  Team,
} from '../../../lib/api';
import { CreateTicketModal } from '../../../components/kanban/CreateTicketModal';
import { ProjectSummaryCard } from '../../../components/projects/ProjectSummaryCard';
import { usePermissions } from '../../../hooks/usePermissions';
import { Permissions } from '../../../lib/permissions';
import {
  FolderGit2,
  Calendar,
  Clock,
  CheckCircle2,
  AlertTriangle,
  Users,
  ShieldCheck,
  ChevronLeft,
  Plus,
  Trash2,
  Edit2,
  LayoutGrid,
  Check,
  Activity,
  UserCheck,
  Sparkles,
  ArrowRight,
  GitPullRequest,
  RefreshCw,
  Lock,
  UsersRound,
} from 'lucide-react';

export default function ProjectDetailPage() {
  const params = useParams();
  const projectKey = (params?.key as string) || 'CORE';
  const queryClient = useQueryClient();
  const router = useRouter();

  const { hasPermission, isOrgAdmin, roleTier } = usePermissions();
  const { data: currentUser } = useQuery({
    queryKey: ['currentUser'],
    queryFn: fetchCurrentUser,
  });

  const urlTab = typeof window !== 'undefined' ? new URLSearchParams(window.location.search).get('tab') : null;
  const [activeTab, setActiveTab] = useState<'OVERVIEW' | 'MILESTONES' | 'TASKS' | 'ACTIVITY' | 'GITHUB'>(
    (urlTab as any) || 'OVERVIEW'
  );
  const [isAddMilestoneOpen, setIsAddMilestoneOpen] = useState(false);
  const [isAddMemberOpen, setIsAddMemberOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isAssignTeamsOpen, setIsAssignTeamsOpen] = useState(false);
  const [isCreateTaskOpen, setIsCreateTaskOpen] = useState(false);
  const [createTaskTeamId, setCreateTaskTeamId] = useState<string | undefined>(undefined);
  const [selectedTaskTeamFilter, setSelectedTaskTeamFilter] = useState<string>('ALL');

  // Queries
  const { data: project, isLoading, error } = useQuery({
    queryKey: ['project', projectKey],
    queryFn: () => fetchProjectByKey(projectKey),
  });

  const { data: allTeams = [] } = useQuery<Team[]>({
    queryKey: ['teams'],
    queryFn: fetchTeams,
  });

  const { data: availableUsers = [] } = useQuery({
    queryKey: ['availableUsers'],
    queryFn: fetchAvailableUsers,
  });

  const { data: rolesList = [] } = useQuery({
    queryKey: ['roles'],
    queryFn: () => fetchRoles(),
  });

  const isAssignedPM = (roleTier >= 3) && !!currentUser && project?.projectManagerId === currentUser.id;
  const canManageProject = (roleTier >= 3) && (isOrgAdmin || hasPermission(Permissions.PROJECT_EDIT) || isAssignedPM);
  const canManageMembers = (roleTier >= 3) && (isOrgAdmin || hasPermission(Permissions.MEMBER_MANAGE) || isAssignedPM);
  const canDeleteProject = isOrgAdmin || roleTier >= 4 || hasPermission(Permissions.PROJECT_DELETE);

  const [isDeletingProject, setIsDeletingProject] = useState(false);

  const deleteProjectMutation = useMutation({
    mutationFn: () => deleteProject(projectKey),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['projects'] });
      queryClient.invalidateQueries({ queryKey: ['projectMetrics'] });
      router.push('/projects');
    },
    onError: (err: Error) => {
      alert(err.message || 'Failed to delete project');
      setIsDeletingProject(false);
    },
  });

  const handleDeleteProject = () => {
    if (!canDeleteProject) {
      alert('Access Denied: Projects can only be deleted by higher authorities (Super Admins & Admins).');
      return;
    }
    if (
      confirm(
        `Are you sure you want to permanently delete project "${project?.name}" (${projectKey})?\n\nThis will remove all associated tasks, sprints, milestones, and audit history. This action cannot be undone.`
      )
    ) {
      setIsDeletingProject(true);
      deleteProjectMutation.mutate();
    }
  };

  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center h-full bg-[#F5F6F8] dark:bg-[#111318]">
        <div className="text-xs text-slate-400 font-medium animate-pulse">Loading project details...</div>
      </div>
    );
  }

  if (error || !project) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center h-full bg-[#F5F6F8] dark:bg-[#111318] p-6">
        <AlertTriangle className="h-10 w-10 text-rose-500 mb-3" />
        <h2 className="text-base font-bold text-slate-800 dark:text-slate-200">Project Not Found</h2>
        <p className="text-xs text-slate-400 mt-1 mb-4">The project &apos;{projectKey}&apos; does not exist or you do not have permission to view it.</p>
        <Link
          href="/projects"
          className="px-4 py-2 rounded-xl bg-blue-600 text-white font-semibold text-xs shadow-xs"
        >
          Return to Projects Portfolio
        </Link>
      </div>
    );
  }

  const progress = project.progressPercentage ?? 0;
  const status = project.computedStatus || project.status || 'NOT_STARTED';

  // Helper function to format status badges
  const getStatusBadge = (st?: string) => {
    switch (st) {
      case 'OVERDUE':
        return (
          <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-bold bg-rose-100 text-rose-700 dark:bg-rose-950/80 dark:text-rose-400 border border-rose-200 dark:border-rose-800">
            <AlertTriangle className="h-3.5 w-3.5" /> Overdue
          </span>
        );
      case 'COMPLETED':
        return (
          <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-bold bg-emerald-100 text-emerald-700 dark:bg-emerald-950/80 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800">
            <CheckCircle2 className="h-3.5 w-3.5" /> Completed
          </span>
        );
      case 'IN_PROGRESS':
        return (
          <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-bold bg-blue-100 text-blue-700 dark:bg-blue-950/80 dark:text-blue-400 border border-blue-200 dark:border-blue-800">
            <span className="h-2 w-2 rounded-full bg-blue-600 dark:bg-blue-400 animate-pulse" /> In Progress
          </span>
        );
      case 'ON_HOLD':
        return (
          <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-bold bg-amber-100 text-amber-700 dark:bg-amber-950/80 dark:text-amber-400 border border-amber-200 dark:border-amber-800">
            <Clock className="h-3.5 w-3.5" /> On Hold
          </span>
        );
      case 'UNDER_REVIEW':
        return (
          <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-bold bg-purple-100 text-purple-700 dark:bg-purple-950/80 dark:text-purple-400 border border-purple-200 dark:border-purple-800">
            <ShieldCheck className="h-3.5 w-3.5" /> Under Review
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-bold bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-400 border border-slate-200 dark:border-slate-700">
            Not Started
          </span>
        );
    }
  };

  return (
    <div className="flex-1 flex flex-col h-full bg-[#F5F6F8] dark:bg-[#111318] overflow-y-auto">
      {/* Top Breadcrumb & Header */}
      <div className="border-b border-slate-200/80 dark:border-slate-800/80 bg-white dark:bg-slate-900 px-6 py-5 transition-colors">
        <div className="max-w-7xl mx-auto space-y-4">
          <div className="flex items-center justify-between">
            <Link
              href="/projects"
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-blue-600 transition"
            >
              <ChevronLeft className="h-4 w-4" />
              <span>Back to Projects</span>
            </Link>

            <div className="flex items-center gap-2">
              <Link
                href={`/?projectKey=${project.key}`}
                className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 text-xs font-semibold text-slate-700 dark:text-slate-300 hover:border-blue-400 hover:text-blue-600 transition shadow-2xs"
              >
                <LayoutGrid className="h-3.5 w-3.5" />
                <span>Open Kanban Board</span>
              </Link>

              {canManageProject && (
                <button
                  onClick={() => setIsEditModalOpen(true)}
                  className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold shadow-xs transition cursor-pointer"
                >
                  <Edit2 className="h-3.5 w-3.5" />
                  <span>Edit Project</span>
                </button>
              )}

              {canDeleteProject ? (
                <button
                  onClick={handleDeleteProject}
                  disabled={isDeletingProject}
                  className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-rose-50 hover:bg-rose-100 dark:bg-rose-950/40 dark:hover:bg-rose-900/60 text-rose-600 dark:text-rose-400 border border-rose-200 dark:border-rose-900/60 text-xs font-semibold shadow-xs transition cursor-pointer"
                  title="Delete Project (Super Admin & Admin Only)"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  <span>{isDeletingProject ? 'Deleting...' : 'Delete Project'}</span>
                </button>
              ) : (
                <div
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-400 dark:text-slate-500 text-xs font-medium border border-slate-200 dark:border-slate-700 cursor-not-allowed"
                  title="Only higher authorities (Super Admin & Admin) can delete projects"
                >
                  <Lock className="h-3.5 w-3.5" />
                  <span>Delete Locked</span>
                </div>
              )}
            </div>
          </div>

          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <div className="flex flex-wrap items-center gap-2.5 mb-1.5">
                <span className="px-2.5 py-0.5 rounded-md bg-blue-50 dark:bg-blue-950 text-blue-600 dark:text-blue-400 font-mono font-bold text-xs border border-blue-200 dark:border-blue-900">
                  {project.key}
                </span>
                {getStatusBadge(status)}
                {(project.assignedTeams && project.assignedTeams.length > 0
                  ? project.assignedTeams
                  : project.primaryTeam
                    ? [project.primaryTeam]
                    : []
                ).map((t) => (
                  <span
                    key={t.id}
                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 text-[11px] font-medium border border-slate-200 dark:border-slate-700"
                  >
                    {t.name}
                  </span>
                ))}
              </div>
              <h1 className="text-xl md:text-2xl font-black text-slate-900 dark:text-slate-100 tracking-tight">
                {project.name}
              </h1>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 max-w-2xl leading-relaxed">
                {project.description || 'Enterprise project under active engineering and organizational coordination.'}
              </p>
            </div>

            {/* Quick Milestone & Task Completion Stats */}
            <div className="flex items-center gap-4 bg-slate-50 dark:bg-slate-800/60 p-3.5 rounded-2xl border border-slate-200/80 dark:border-slate-800 shrink-0">
              <div className="text-center px-2">
                <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Completion</div>
                <div className="text-xl font-black text-blue-600 dark:text-blue-400">{progress}%</div>
              </div>
              <div className="h-8 w-px bg-slate-200 dark:bg-slate-700" />
              <div className="text-center px-2">
                <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Tasks</div>
                <div className="text-xl font-black text-slate-800 dark:text-slate-200">
                  {project.completedTicketsCount} / {project.totalTicketsCount}
                </div>
              </div>
              <div className="h-8 w-px bg-slate-200 dark:bg-slate-700" />
              <div className="text-center px-2">
                <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Deadline</div>
                <div className="text-xs font-bold text-slate-700 dark:text-slate-300 mt-1">
                  {project.deadline ? new Date(project.deadline).toLocaleDateString() : 'None'}
                </div>
              </div>
            </div>
          </div>

          {/* Navigation Tabs */}
          <div className="flex items-center gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
            {(
              [
                { id: 'OVERVIEW', label: 'Personnel & Team', icon: Users },
                { id: 'MILESTONES', label: `Milestones (${project.milestones.length})`, icon: CheckCircle2 },
                { id: 'TASKS', label: `Tasks Distribution (${project.totalTicketsCount})`, icon: FolderGit2 },
                { id: 'ACTIVITY', label: `Activity Audit (${project.activityLogs.length})`, icon: Activity },
                { id: 'GITHUB', label: 'GitHub Integration', icon: GitPullRequest },
              ] as const
            ).map((tab) => {
              const Icon = tab.icon;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`inline-flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold transition cursor-pointer ${
                    activeTab === tab.id
                      ? 'bg-blue-600 text-white shadow-2xs'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800'
                  }`}
                >
                  <Icon className="h-3.5 w-3.5" />
                  <span>{tab.label}</span>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Content Area */}
      <div className="p-6 max-w-7xl mx-auto w-full space-y-6">
        {/* TAB 1: OVERVIEW & PERSONNEL */}
        {activeTab === 'OVERVIEW' && (
          <div className="space-y-6">
            {/* Project Summary (Completed, Blockers, Planned + Optional AI Brief) */}
            <ProjectSummaryCard projectKey={project.key} />

            {/* Key Personnel Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {/* Project Manager Card */}
              <div className="rounded-2xl border border-slate-200/80 dark:border-slate-800/80 bg-white dark:bg-slate-900 p-5 shadow-2xs">
                <div className="flex items-center justify-between text-xs text-slate-400 font-semibold mb-3">
                  <span>Project Manager</span>
                  <UserCheck className="h-4 w-4 text-blue-500" />
                </div>
                {project.projectManager ? (
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-full bg-blue-600 text-white font-bold text-sm flex items-center justify-center shrink-0">
                      {project.projectManager.fullName[0]}
                    </div>
                    <div className="min-w-0">
                      <div className="text-sm font-bold text-slate-900 dark:text-slate-100 truncate">
                        {project.projectManager.fullName}
                      </div>
                      <div className="text-xs text-slate-400 truncate">{project.projectManager.email}</div>
                    </div>
                  </div>
                ) : (
                  <div className="text-xs text-slate-400 italic">No Project Manager assigned</div>
                )}
              </div>

              {/* Reviewer Card */}
              <div className="rounded-2xl border border-slate-200/80 dark:border-slate-800/80 bg-white dark:bg-slate-900 p-5 shadow-2xs">
                <div className="flex items-center justify-between text-xs text-slate-400 font-semibold mb-3">
                  <span>Project Reviewer</span>
                  <ShieldCheck className="h-4 w-4 text-indigo-500" />
                </div>
                {project.reviewer ? (
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-full bg-indigo-600 text-white font-bold text-sm flex items-center justify-center shrink-0">
                      {project.reviewer.fullName[0]}
                    </div>
                    <div className="min-w-0">
                      <div className="text-sm font-bold text-slate-900 dark:text-slate-100 truncate">
                        {project.reviewer.fullName}
                      </div>
                      <div className="text-xs text-slate-400 truncate">{project.reviewer.email}</div>
                    </div>
                  </div>
                ) : (
                  <div className="text-xs text-slate-400 italic">No Reviewer assigned</div>
                )}
              </div>

              {/* Assigned Teams Card */}
              <div className="rounded-2xl border border-slate-200/80 dark:border-slate-800/80 bg-white dark:bg-slate-900 p-5 shadow-2xs">
                <div className="flex items-center justify-between text-xs text-slate-400 font-semibold mb-3">
                  <span>Assigned Teams</span>
                  <div className="flex items-center gap-2">
                    {canManageMembers && (
                      <button
                        type="button"
                        onClick={() => setIsAssignTeamsOpen(true)}
                        className="text-[11px] font-semibold text-blue-600 hover:underline cursor-pointer"
                      >
                        Manage
                      </button>
                    )}
                    <Users className="h-4 w-4 text-emerald-500" />
                  </div>
                </div>
                {(() => {
                  const teamsList =
                    project.assignedTeams && project.assignedTeams.length > 0
                      ? project.assignedTeams
                      : project.primaryTeam
                        ? [project.primaryTeam]
                        : [];
                  if (teamsList.length === 0) {
                    return <div className="text-xs text-slate-400 italic">No teams assigned yet</div>;
                  }
                  return (
                    <div className="space-y-1.5">
                      {teamsList.map((t) => (
                        <div key={t.id} className="flex items-center justify-between gap-2 text-xs">
                          <span className="font-bold text-slate-900 dark:text-slate-100 truncate">
                            {t.name} <span className="font-mono text-[10px] text-slate-400">({t.keyPrefix})</span>
                          </span>
                          <span className="text-[11px] text-slate-400 shrink-0">
                            {t.members?.length ?? 0} members
                          </span>
                        </div>
                      ))}
                    </div>
                  );
                })()}
              </div>
            </div>

            {/* Allocated Personnel & Members (Categorized by Team) */}
            <div className="rounded-2xl border border-slate-200/80 dark:border-slate-800/80 bg-white dark:bg-slate-900 p-5 shadow-2xs space-y-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                    Allocated Personnel & Members
                  </h3>
                  <p className="text-xs text-slate-400">
                    Team members and allocated personnel categorized by assigned teams
                  </p>
                </div>

                {canManageMembers && (
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setIsAssignTeamsOpen(true)}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 font-semibold text-xs transition cursor-pointer"
                    >
                      <UsersRound className="h-3.5 w-3.5" />
                      <span>Assign Teams</span>
                    </button>
                    <button
                      onClick={() => setIsAddMemberOpen(true)}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-semibold text-xs transition cursor-pointer"
                    >
                      <Plus className="h-3.5 w-3.5" />
                      <span>Allocate Member</span>
                    </button>
                  </div>
                )}
              </div>

              {/* Categorized Teams & Their Members */}
              {(() => {
                const teamsList =
                  project.assignedTeams && project.assignedTeams.length > 0
                    ? project.assignedTeams
                    : project.primaryTeam
                      ? [project.primaryTeam]
                      : [];

                return (
                  <div className="space-y-4">
                    {teamsList.map((team) => {
                      const members = team.members || [];
                      return (
                        <div
                          key={team.id}
                          className="rounded-xl border border-slate-200/80 dark:border-slate-800 overflow-hidden"
                        >
                          <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 bg-slate-50 dark:bg-slate-800/60 border-b border-slate-200/80 dark:border-slate-800">
                            <div className="flex items-center gap-2">
                              <UsersRound className="h-3.5 w-3.5 text-blue-600 dark:text-blue-400" />
                              <span className="text-xs font-bold text-slate-900 dark:text-slate-100">
                                {team.name}
                              </span>
                              <span className="px-1.5 py-0.5 rounded bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 font-mono text-[10px] font-semibold text-slate-500">
                                {team.keyPrefix}
                              </span>
                              <span className="text-[11px] text-slate-400">
                                · {members.length} member{members.length !== 1 ? 's' : ''}
                              </span>
                            </div>
                            {team.lead && (
                              <span className="text-[11px] text-slate-500 dark:text-slate-400">
                                Lead: <strong className="text-slate-700 dark:text-slate-200">{team.lead.fullName}</strong>
                              </span>
                            )}
                          </div>

                          {members.length > 0 ? (
                            <div className="overflow-x-auto">
                              <table className="w-full text-left text-xs">
                                <thead>
                                  <tr className="border-b border-slate-100 dark:border-slate-800 text-slate-400 font-semibold uppercase text-[10px]">
                                    <th className="py-2 px-4">Member Name</th>
                                    <th className="py-2 px-4">Email</th>
                                    <th className="py-2 px-4">Team Role</th>
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60 font-medium text-slate-700 dark:text-slate-300">
                                  {members.map((tm) => {
                                    const fullName = tm.user?.fullName || 'Unknown User';
                                    const email = tm.user?.email || '—';
                                    const isLead = tm.role === 'LEAD' || team.lead?.id === tm.userId;
                                    return (
                                      <tr key={tm.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                                        <td className="py-2.5 px-4 flex items-center gap-2.5 font-semibold text-slate-900 dark:text-slate-100">
                                          <div className="h-6 w-6 rounded-full bg-slate-200 dark:bg-slate-700 text-[10px] font-bold flex items-center justify-center shrink-0">
                                            {fullName[0]}
                                          </div>
                                          <span>{fullName}</span>
                                        </td>
                                        <td className="py-2.5 px-4 text-slate-400 font-mono text-[11px]">{email}</td>
                                        <td className="py-2.5 px-4">
                                          <span
                                            className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-bold ${
                                              isLead
                                                ? 'bg-blue-50 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300 border border-blue-200 dark:border-blue-800'
                                                : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400'
                                            }`}
                                          >
                                            {isLead ? 'Team Lead' : 'Member'}
                                          </span>
                                        </td>
                                      </tr>
                                    );
                                  })}
                                </tbody>
                              </table>
                            </div>
                          ) : (
                            <div className="py-4 px-4 text-xs text-slate-400 italic">
                              No members in this team yet.
                            </div>
                          )}
                        </div>
                      );
                    })}

                    {teamsList.length === 0 && (
                      <div className="py-6 text-center rounded-xl border border-dashed border-slate-200 dark:border-slate-800 text-xs text-slate-400">
                        No teams assigned to this project yet.
                        {canManageMembers && ' Click "Assign Teams" above to link one or more teams.'}
                      </div>
                    )}
                  </div>
                );
              })()}

              {/* Direct Project Member Allocations */}
              {project.members.length > 0 && (
                <div className="rounded-xl border border-slate-200/80 dark:border-slate-800 overflow-hidden">
                  <div className="flex items-center justify-between px-4 py-2.5 bg-slate-50 dark:bg-slate-800/60 border-b border-slate-200/80 dark:border-slate-800">
                    <span className="text-xs font-bold text-slate-900 dark:text-slate-100">
                      Direct Project Allocations
                    </span>
                    <span className="text-[11px] text-slate-400">
                      {project.members.length} member{project.members.length !== 1 ? 's' : ''}
                    </span>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs">
                      <thead>
                        <tr className="border-b border-slate-100 dark:border-slate-800 text-slate-400 font-semibold uppercase text-[10px]">
                          <th className="py-2 px-4">Member</th>
                          <th className="py-2 px-4">Email</th>
                          <th className="py-2 px-4">Project Role</th>
                          {canManageMembers && <th className="py-2 px-4 text-right">Actions</th>}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60 font-medium text-slate-700 dark:text-slate-300">
                        {project.members.map((m) => (
                          <tr key={m.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                            <td className="py-2.5 px-4 flex items-center gap-2.5 font-semibold text-slate-900 dark:text-slate-100">
                              <div className="h-6 w-6 rounded-full bg-slate-200 dark:bg-slate-700 text-[10px] font-bold flex items-center justify-center shrink-0">
                                {m.user.fullName[0]}
                              </div>
                              <span>{m.user.fullName}</span>
                            </td>
                            <td className="py-2.5 px-4 text-slate-400 font-mono text-[11px]">{m.user.email}</td>
                            <td className="py-2.5 px-4">
                              <span
                                className="inline-block px-2.5 py-0.5 rounded-full text-[11px] font-bold text-white shadow-2xs"
                                style={{ backgroundColor: m.role.color || '#4F46E5' }}
                              >
                                {m.role.name}
                              </span>
                            </td>
                            {canManageMembers && (
                              <td className="py-2.5 px-4 text-right">
                                <button
                                  onClick={async () => {
                                    if (confirm(`Remove ${m.user.fullName} from ${project.name}?`)) {
                                      await removeProjectMember(project.key, m.userId);
                                      queryClient.invalidateQueries({ queryKey: ['project', projectKey] });
                                    }
                                  }}
                                  className="text-slate-400 hover:text-rose-600 p-1 rounded-md transition cursor-pointer"
                                  title="Remove member"
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </button>
                              </td>
                            )}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* TAB 2: MILESTONES & DELIVERABLES */}
        {activeTab === 'MILESTONES' && (
          <div className="rounded-2xl border border-slate-200/80 dark:border-slate-800/80 bg-white dark:bg-slate-900 p-5 shadow-2xs space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                  Project Milestones & Deliverables
                </h3>
                <p className="text-xs text-slate-400">
                  Target milestones tracked towards final release and verification
                </p>
              </div>

              {canManageProject && (
                <button
                  onClick={() => setIsAddMilestoneOpen(true)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-semibold text-xs transition cursor-pointer"
                >
                  <Plus className="h-3.5 w-3.5" />
                  <span>Add Milestone</span>
                </button>
              )}
            </div>

            <div className="space-y-3 pt-2">
              {project.milestones.map((m) => {
                const isCompleted = m.status === 'COMPLETED';
                const isInProgress = m.status === 'IN_PROGRESS';

                return (
                  <div
                    key={m.id}
                    className="flex flex-col sm:flex-row sm:items-center justify-between p-4 rounded-xl border border-slate-200/80 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/30 gap-3"
                  >
                    <div className="flex items-start gap-3">
                      {canManageProject ? (
                        <button
                          onClick={async () => {
                            const nextStatus = isCompleted ? 'PENDING' : 'COMPLETED';
                            await updateMilestone(project.key, m.id, { status: nextStatus });
                            queryClient.invalidateQueries({ queryKey: ['project', projectKey] });
                          }}
                          className={`mt-0.5 h-5 w-5 rounded-md flex items-center justify-center border transition cursor-pointer shrink-0 ${
                            isCompleted
                              ? 'bg-emerald-600 border-emerald-600 text-white'
                              : 'border-slate-300 dark:border-slate-600 hover:border-emerald-500'
                          }`}
                        >
                          {isCompleted && <Check className="h-3.5 w-3.5 stroke-[3]" />}
                        </button>
                      ) : (
                        <div
                          className={`mt-0.5 h-5 w-5 rounded-md flex items-center justify-center border shrink-0 ${
                            isCompleted
                              ? 'bg-emerald-600 border-emerald-600 text-white'
                              : 'border-slate-300 dark:border-slate-600'
                          }`}
                        >
                          {isCompleted && <Check className="h-3.5 w-3.5 stroke-[3]" />}
                        </div>
                      )}

                      <div>
                        <div
                          className={`text-xs font-bold ${
                            isCompleted
                              ? 'line-through text-slate-400 dark:text-slate-500'
                              : 'text-slate-900 dark:text-slate-100'
                          }`}
                        >
                          {m.title}
                        </div>
                        {m.description && (
                          <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                            {m.description}
                          </p>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-3 self-end sm:self-center shrink-0">
                      {/* Status pill */}
                      <span
                        className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                          isCompleted
                            ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400'
                            : isInProgress
                              ? 'bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-400'
                              : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400'
                        }`}
                      >
                        {m.status}
                      </span>

                      {/* Due date */}
                      {m.dueDate && (
                        <div className="flex items-center gap-1 text-[11px] text-slate-400 font-medium">
                          <Calendar className="h-3 w-3" />
                          <span>{new Date(m.dueDate).toLocaleDateString()}</span>
                        </div>
                      )}

                      {canManageProject && (
                        <button
                          onClick={async () => {
                            if (confirm(`Delete milestone "${m.title}"?`)) {
                              await deleteMilestone(project.key, m.id);
                              queryClient.invalidateQueries({ queryKey: ['project', projectKey] });
                            }
                          }}
                          className="text-slate-400 hover:text-rose-600 p-1 rounded-md transition cursor-pointer"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}

              {project.milestones.length === 0 && (
                <div className="py-8 text-center text-xs text-slate-400 italic">
                  No deliverables or milestones added yet. Click &apos;Add Milestone&apos; above.
                </div>
              )}
            </div>
          </div>
        )}

        {/* TAB 3: TASKS & WORKLOAD DISTRIBUTION */}
        {activeTab === 'TASKS' && (
          <div className="space-y-6">
            {/* Status Breakdown Counters */}
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
              {Object.entries(project.ticketStatusBreakdown || {}).map(([st, count]) => (
                <div
                  key={st}
                  className="p-3.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-2xs text-center"
                >
                  <div className="text-[10px] font-bold uppercase text-slate-400">{st}</div>
                  <div className="text-xl font-black text-slate-800 dark:text-slate-200 mt-1">{count}</div>
                </div>
              ))}
            </div>

            {/* Tasks list preview — isolated & categorized by team */}
            <div className="rounded-2xl border border-slate-200/80 dark:border-slate-800/80 bg-white dark:bg-slate-900 p-5 shadow-2xs space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                    Project Tasks Roster
                  </h3>
                  <p className="text-xs text-slate-400">
                    Team-isolated deliverables — members only see tasks belonging to their own team
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => {
                      setCreateTaskTeamId(selectedTaskTeamFilter !== 'ALL' && selectedTaskTeamFilter !== 'GENERAL' ? selectedTaskTeamFilter : undefined);
                      setIsCreateTaskOpen(true);
                    }}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-semibold text-xs transition cursor-pointer"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    <span>New Team Task</span>
                  </button>
                  <Link
                    href={`/?projectKey=${project.key}`}
                    className="inline-flex items-center gap-1.5 text-xs font-bold text-blue-600 hover:underline"
                  >
                    <span>Open Kanban Board</span>
                    <ArrowRight className="h-3.5 w-3.5" />
                  </Link>
                </div>
              </div>

              {/* Team filter pills */}
              {(() => {
                const assignedTeamsList =
                  project.assignedTeams && project.assignedTeams.length > 0
                    ? project.assignedTeams
                    : project.primaryTeam
                      ? [project.primaryTeam]
                      : [];
                const visibleTeamGroups = new Map<string, { id: string; name: string; keyPrefix?: string; items: typeof project.tickets }>();
                for (const t of project.tickets) {
                  const key = t.team?.id || 'GENERAL';
                  if (!visibleTeamGroups.has(key)) {
                    visibleTeamGroups.set(key, {
                      id: key,
                      name: t.team ? t.team.name : 'General / Unassigned Team',
                      keyPrefix: t.team?.keyPrefix,
                      items: [],
                    });
                  }
                  visibleTeamGroups.get(key)!.items.push(t);
                }

                // Ensure assigned teams with 0 tasks still appear for managers/members of those teams
                for (const team of assignedTeamsList) {
                  if (!visibleTeamGroups.has(team.id)) {
                    const isMember = currentUser && (team.lead?.id === currentUser.id || team.members?.some((m) => m.userId === currentUser.id));
                    if (canManageProject || isMember) {
                      visibleTeamGroups.set(team.id, {
                        id: team.id,
                        name: team.name,
                        keyPrefix: team.keyPrefix,
                        items: [],
                      });
                    }
                  }
                }

                const groups = Array.from(visibleTeamGroups.values());
                const filteredGroups = selectedTaskTeamFilter === 'ALL'
                  ? groups
                  : groups.filter((g) => g.id === selectedTaskTeamFilter);

                return (
                  <>
                    {groups.length > 1 && (
                      <div className="flex flex-wrap items-center gap-1.5 pt-1">
                        <button
                          type="button"
                          onClick={() => setSelectedTaskTeamFilter('ALL')}
                          className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold transition cursor-pointer ${
                            selectedTaskTeamFilter === 'ALL'
                              ? 'bg-blue-600 text-white'
                              : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
                          }`}
                        >
                          All Visible ({project.tickets.length})
                        </button>
                        {groups.map((g) => (
                          <button
                            key={g.id}
                            type="button"
                            onClick={() => setSelectedTaskTeamFilter(g.id)}
                            className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold transition cursor-pointer ${
                              selectedTaskTeamFilter === g.id
                                ? 'bg-blue-600 text-white'
                                : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
                            }`}
                          >
                            {g.name} ({g.items.length})
                          </button>
                        ))}
                      </div>
                    )}

                    <div className="space-y-4">
                      {filteredGroups.map((group) => (
                        <div key={group.id} className="rounded-xl border border-slate-200/80 dark:border-slate-800 overflow-hidden">
                          <div className="flex items-center justify-between px-4 py-2 bg-slate-50 dark:bg-slate-800/60 border-b border-slate-200/80 dark:border-slate-800">
                            <div className="flex items-center gap-2 text-xs font-bold text-slate-800 dark:text-slate-200">
                              <UsersRound className="h-3.5 w-3.5 text-blue-600 dark:text-blue-400" />
                              <span>{group.name}</span>
                              {group.keyPrefix && (
                                <span className="px-1.5 py-0.5 rounded bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 font-mono text-[10px] text-slate-500">
                                  {group.keyPrefix}
                                </span>
                              )}
                            </div>
                            <span className="text-[11px] text-slate-400">
                              {group.items.length} task{group.items.length !== 1 ? 's' : ''}
                            </span>
                          </div>

                          <div className="divide-y divide-slate-100 dark:divide-slate-800/60 px-4">
                            {group.items.map((t) => (
                              <div key={t.id} className="py-2.5 flex items-center justify-between gap-3 text-xs">
                                <div className="flex items-center gap-2.5 min-w-0">
                                  <span className="font-mono font-bold text-[11px] text-blue-600 dark:text-blue-400 shrink-0">
                                    {t.displayKey || t.ticketKey}
                                  </span>
                                  <span className="font-medium text-slate-800 dark:text-slate-200 truncate">
                                    {t.title}
                                  </span>
                                </div>

                                <div className="flex items-center gap-2 shrink-0">
                                  <span className="px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 text-[10px] font-bold text-slate-600 dark:text-slate-400">
                                    {t.status}
                                  </span>
                                  <span className="px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 text-[10px] font-semibold text-slate-500">
                                    {t.priority}
                                  </span>
                                </div>
                              </div>
                            ))}

                            {group.items.length === 0 && (
                              <div className="py-4 text-center text-xs text-slate-400 italic">
                                No tasks for this team yet.
                              </div>
                            )}
                          </div>
                        </div>
                      ))}

                      {filteredGroups.length === 0 && (
                        <div className="py-6 text-center text-xs text-slate-400 italic">
                          No tasks created for this project yet.
                        </div>
                      )}
                    </div>
                  </>
                );
              })()}
            </div>
          </div>
        )}

        {/* TAB 4: ACTIVITY AUDIT HISTORY */}
        {activeTab === 'ACTIVITY' && (
          <div className="rounded-2xl border border-slate-200/80 dark:border-slate-800/80 bg-white dark:bg-slate-900 p-5 shadow-2xs space-y-4">
            <div>
              <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                Activity Audit & Assignment History
              </h3>
              <p className="text-xs text-slate-400">
                Immutable audit trail of project creation, PM updates, and milestones
              </p>
            </div>

            <div className="space-y-4 pt-2">
              {project.activityLogs.map((log) => (
                <div key={log.id} className="flex items-start gap-3 text-xs">
                  <div className="h-7 w-7 rounded-full bg-blue-100 dark:bg-blue-950/80 text-blue-600 dark:text-blue-400 flex items-center justify-center shrink-0 mt-0.5 font-bold text-[11px]">
                    {log.user?.fullName ? log.user.fullName[0] : 'S'}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-slate-900 dark:text-slate-100">
                        {log.user?.fullName || 'System'}
                      </span>
                      <span className="text-[10px] font-mono text-slate-400">
                        {new Date(log.createdAt).toLocaleString()}
                      </span>
                    </div>
                    <div className="text-slate-600 dark:text-slate-300 mt-0.5">{log.details}</div>
                  </div>
                </div>
              ))}

              {project.activityLogs.length === 0 && (
                <div className="py-6 text-center text-xs text-slate-400 italic">
                  No activity recorded yet.
                </div>
              )}
            </div>
          </div>
        )}

        {/* TAB 5: GITHUB INTEGRATION */}
        {activeTab === 'GITHUB' && (
          <ProjectGithubIntegrationTab
            projectKey={project.key}
            canManageProject={Boolean(canManageProject)}
            onUpdate={() => {
              queryClient.invalidateQueries({ queryKey: ['project', projectKey] });
            }}
          />
        )}
      </div>

      {/* EDIT PROJECT MODAL */}
      {isEditModalOpen && (
        <EditProjectModal
          isOpen={isEditModalOpen}
          onClose={() => setIsEditModalOpen(false)}
          project={project}
          availableUsers={availableUsers}
          roleTier={roleTier}
          onSuccess={() => {
            queryClient.invalidateQueries({ queryKey: ['project', projectKey] });
            queryClient.invalidateQueries({ queryKey: ['projects'] });
            setIsEditModalOpen(false);
          }}
        />
      )}

      {/* ADD MILESTONE MODAL */}
      {isAddMilestoneOpen && (
        <AddMilestoneModal
          isOpen={isAddMilestoneOpen}
          onClose={() => setIsAddMilestoneOpen(false)}
          projectKey={project.key}
          onSuccess={() => {
            queryClient.invalidateQueries({ queryKey: ['project', projectKey] });
            setIsAddMilestoneOpen(false);
          }}
        />
      )}

      {/* ALLOCATE MEMBER MODAL */}
      {isAddMemberOpen && (
        <AllocateMemberModal
          isOpen={isAddMemberOpen}
          onClose={() => setIsAddMemberOpen(false)}
          projectKey={project.key}
          availableUsers={availableUsers}
          roles={rolesList}
          onSuccess={() => {
            queryClient.invalidateQueries({ queryKey: ['project', projectKey] });
            setIsAddMemberOpen(false);
          }}
        />
      )}

      {/* ASSIGN MULTIPLE TEAMS MODAL */}
      {isAssignTeamsOpen && (
        <AssignTeamsModal
          isOpen={isAssignTeamsOpen}
          onClose={() => setIsAssignTeamsOpen(false)}
          projectKey={project.key}
          allTeams={allTeams}
          currentTeamIds={(
            project.assignedTeams && project.assignedTeams.length > 0
              ? project.assignedTeams
              : project.primaryTeam
                ? [project.primaryTeam]
                : []
          ).map((t) => t.id)}
          onSuccess={() => {
            queryClient.invalidateQueries({ queryKey: ['project', projectKey] });
            queryClient.invalidateQueries({ queryKey: ['projects'] });
            setIsAssignTeamsOpen(false);
          }}
        />
      )}

      {/* CREATE TEAM TASK MODAL */}
      {isCreateTaskOpen && (
        <CreateTicketModal
          projectId={project.id}
          defaultTeamId={createTaskTeamId}
          isOpen={isCreateTaskOpen}
          onClose={() => setIsCreateTaskOpen(false)}
          onSubmit={async (data) => {
            await createTicket(data);
            queryClient.invalidateQueries({ queryKey: ['project', projectKey] });
            queryClient.invalidateQueries({ queryKey: ['tickets'] });
            setIsCreateTaskOpen(false);
          }}
        />
      )}
    </div>
  );
}

// ----------------------------------------------------
// PROJECT GITHUB INTEGRATION TAB
// ----------------------------------------------------
function ProjectGithubIntegrationTab({
  projectKey,
  canManageProject,
  onUpdate,
}: {
  projectKey: string;
  canManageProject: boolean;
  onUpdate: () => void;
}) {
  const { data: config, isLoading, refetch } = useQuery({
    queryKey: ['projectGithubConfig', projectKey],
    queryFn: () => fetchProjectGithubConfig(projectKey),
  });

  const [owner, setOwner] = useState('');
  const [repo, setRepo] = useState('');
  const [token, setToken] = useState('');
  const [statusMsg, setStatusMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  React.useEffect(() => {
    if (config) {
      if (config.owner) setOwner(config.owner);
      if (config.repo) setRepo(config.repo);
    }
  }, [config]);

  const saveConfigMutation = useMutation({
    mutationFn: () =>
      saveProjectGithubConfig(projectKey, {
        owner: owner.trim(),
        repo: repo.trim(),
        token: token.trim() || undefined,
      }),
    onSuccess: () => {
      setStatusMsg({ type: 'success', text: 'GitHub repository configuration saved successfully!' });
      refetch();
      onUpdate();
    },
    onError: (err: Error) => {
      setStatusMsg({ type: 'error', text: err.message || 'Failed to save configuration' });
    },
  });

  const syncMutation = useMutation({
    mutationFn: () => syncProjectGithub(projectKey),
    onSuccess: (res) => {
      setStatusMsg({
        type: 'success',
        text: `Sync complete! Processed ${res.syncedItemsCount} items and linked ${res.matchedTicketsCount} tickets with ticket keys (e.g. ${projectKey}-X).`,
      });
      refetch();
      onUpdate();
    },
    onError: (err: Error) => {
      setStatusMsg({ type: 'error', text: `Sync failed: ${err.message}` });
    },
  });

  if (isLoading) {
    return <div className="text-xs text-slate-400 p-6 animate-pulse">Loading GitHub integration details...</div>;
  }

  const isConfigured = Boolean(config?.owner && config?.repo);

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-slate-200/80 dark:border-slate-800/80 bg-white dark:bg-slate-900 p-6 shadow-2xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="p-1.5 rounded-lg bg-purple-100 dark:bg-purple-950/60 text-purple-700 dark:text-purple-300">
                <GitPullRequest className="h-4 w-4" />
              </span>
              <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                GitHub Repository Automation & Tracking
              </h3>
            </div>
            <p className="text-xs text-slate-400">
              Link pull requests, pushes, and git commits to tasks by referencing ticket keys like{' '}
              <span className="font-mono font-semibold text-slate-600 dark:text-slate-300">{projectKey}-1</span>.
            </p>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => syncMutation.mutate()}
              disabled={syncMutation.isPending || !isConfigured}
              className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold text-white transition shadow-2xs ${
                !isConfigured
                  ? 'bg-slate-300 dark:bg-slate-700 cursor-not-allowed opacity-60'
                  : 'bg-purple-600 hover:bg-purple-700 cursor-pointer'
              }`}
            >
              <RefreshCw className={`h-3.5 w-3.5 ${syncMutation.isPending ? 'animate-spin' : ''}`} />
              <span>{syncMutation.isPending ? 'Fetching Git Data...' : 'Sync Commits & Pulls'}</span>
            </button>
          </div>
        </div>

        {statusMsg && (
          <div
            className={`p-3 rounded-xl border text-xs flex items-center gap-2 ${
              statusMsg.type === 'success'
                ? 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-200'
                : 'bg-rose-50 dark:bg-rose-950/40 border-rose-200 dark:border-rose-900 text-rose-800 dark:text-rose-200'
            }`}
          >
            {statusMsg.type === 'success' ? (
              <Check className="h-4 w-4 text-emerald-600 shrink-0" />
            ) : (
              <AlertTriangle className="h-4 w-4 text-rose-600 shrink-0" />
            )}
            <span>{statusMsg.text}</span>
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2">
          <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200/80 dark:border-slate-800 text-xs">
            <div className="text-[10px] uppercase font-bold text-slate-400 mb-0.5">Status</div>
            <div className="font-semibold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
              <span className={`h-2 w-2 rounded-full ${isConfigured ? 'bg-emerald-500' : 'bg-slate-400'}`} />
              {isConfigured ? 'Connected' : 'Not Connected'}
            </div>
          </div>
          <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200/80 dark:border-slate-800 text-xs">
            <div className="text-[10px] uppercase font-bold text-slate-400 mb-0.5">Linked VCS Items</div>
            <div className="font-semibold text-slate-800 dark:text-slate-200">
              {config?.linkedVcsItemsCount ?? 0} PRs & Commits
            </div>
          </div>
          <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200/80 dark:border-slate-800 text-xs">
            <div className="text-[10px] uppercase font-bold text-slate-400 mb-0.5">Last Synced</div>
            <div className="font-semibold text-slate-800 dark:text-slate-200">
              {config?.lastSyncedAt ? new Date(config.lastSyncedAt).toLocaleString() : 'Never'}
            </div>
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-slate-200/80 dark:border-slate-800/80 bg-white dark:bg-slate-900 p-6 shadow-2xs space-y-4">
        <div>
          <h4 className="text-sm font-bold text-slate-900 dark:text-slate-100">Repository Settings</h4>
          <p className="text-xs text-slate-400">
            Specify the GitHub owner and repository name to fetch pulls and commits via GitHub REST API.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
              Repository Owner / Organization *
            </label>
            <input
              type="text"
              placeholder="e.g. torvalds or amrita-org"
              value={owner}
              onChange={(e) => setOwner(e.target.value)}
              disabled={!canManageProject}
              className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 text-xs text-slate-900 dark:text-slate-100 disabled:opacity-50"
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
              Repository Name *
            </label>
            <input
              type="text"
              placeholder="e.g. linux or task-manager"
              value={repo}
              onChange={(e) => setRepo(e.target.value)}
              disabled={!canManageProject}
              className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 text-xs text-slate-900 dark:text-slate-100 disabled:opacity-50"
            />
          </div>
        </div>

        <div>
          <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
            Personal Access Token (PAT) (Optional)
          </label>
          <input
            type="password"
            placeholder={config?.hasToken ? '•••••••••••••••• (saved)' : 'ghp_... (Required for private repositories)'}
            value={token}
            onChange={(e) => setToken(e.target.value)}
            disabled={!canManageProject}
            className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 text-xs text-slate-900 dark:text-slate-100 disabled:opacity-50"
          />
          <span className="block text-[11px] text-slate-400 mt-1">
            Leave blank if using a public repository. For private repos, generate a token with <code className="font-mono text-slate-600 dark:text-slate-300">repo</code> scope.
          </span>
        </div>

        {canManageProject && (
          <div className="flex justify-end pt-2">
            <button
              type="button"
              onClick={() => saveConfigMutation.mutate()}
              disabled={saveConfigMutation.isPending || !owner.trim() || !repo.trim()}
              className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-semibold text-xs shadow-xs disabled:opacity-50"
            >
              {saveConfigMutation.isPending ? 'Saving...' : 'Save GitHub Configuration'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ----------------------------------------------------
// EDIT PROJECT MODAL
// ----------------------------------------------------
function EditProjectModal({
  isOpen,
  onClose,
  project,
  availableUsers,
  roleTier,
  onSuccess,
}: {
  isOpen: boolean;
  onClose: () => void;
  project: any;
  availableUsers: any[];
  roleTier: number;
  onSuccess: () => void;
}) {
  const [name, setName] = useState(project.name || '');
  const [description, setDescription] = useState(project.description || '');
  const [status, setStatus] = useState(project.status || 'IN_PROGRESS');
  const [pmId, setPmId] = useState(project.projectManagerId || '');
  const [reviewerId, setReviewerId] = useState(project.reviewerId || '');
  const [deadline, setDeadline] = useState(
    project.deadline ? new Date(project.deadline).toISOString().split('T')[0] : ''
  );
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const isDeadlineLocked = Boolean(
    project.deadline &&
    project.deadlineSetByRoleTier &&
    roleTier < project.deadlineSetByRoleTier
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setIsSubmitting(true);
    setErrorMsg(null);
    try {
      const updates: any = {
        name: name.trim(),
        description: description.trim() || undefined,
        status,
        projectManagerId: pmId || null,
        reviewerId: reviewerId || null,
      };

      if (!isDeadlineLocked) {
        updates.deadline = deadline ? new Date(deadline).toISOString() : null;
      }

      await updateProject(project.key, updates);
      onSuccess();
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to update project');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl w-full max-w-lg p-6 shadow-xl space-y-4 max-h-[90vh] overflow-y-auto">
        <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
          Edit Project: {project.name} ({project.key})
        </h3>

        {errorMsg && (
          <div className="p-2.5 rounded-lg bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 text-rose-800 dark:text-rose-200 text-xs flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 shrink-0 text-rose-600" />
            <span>{errorMsg}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-3.5">
          <div>
            <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">Project Name *</label>
            <input
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 text-xs text-slate-900 dark:text-slate-100"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">Description</label>
            <textarea
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 text-xs text-slate-900 dark:text-slate-100"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">Status</label>
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
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1 flex items-center justify-between">
                <span>Deadline</span>
                {isDeadlineLocked && (
                  <span className="text-[10px] text-amber-600 dark:text-amber-400 font-bold flex items-center gap-1">
                    <Lock className="h-3 w-3" /> Locked
                  </span>
                )}
              </label>
              <input
                type="date"
                value={deadline}
                onChange={(e) => setDeadline(e.target.value)}
                disabled={isDeadlineLocked}
                className={`w-full px-3 py-2 rounded-xl border text-xs ${
                  isDeadlineLocked
                    ? 'border-amber-300 dark:border-amber-800 bg-amber-50/50 dark:bg-amber-950/30 text-amber-900 dark:text-amber-200 cursor-not-allowed opacity-80'
                    : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100'
                }`}
              />
              {isDeadlineLocked && (
                <span className="block text-[10px] text-amber-600 dark:text-amber-400 mt-1">
                  Immutable: Set by Tier {project.deadlineSetByRoleTier || 1} authority.
                </span>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">Project Manager</label>
              <select
                value={pmId}
                onChange={(e) => setPmId(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 text-xs text-slate-900 dark:text-slate-100"
              >
                <option value="">Unassigned</option>
                {availableUsers.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.fullName} ({u.email})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">Reviewer</label>
              <select
                value={reviewerId}
                onChange={(e) => setReviewerId(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 text-xs text-slate-900 dark:text-slate-100"
              >
                <option value="">Unassigned</option>
                {availableUsers.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.fullName} ({u.email})
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100 dark:border-slate-800">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-500"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-semibold text-xs shadow-xs"
            >
              {isSubmitting ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ----------------------------------------------------
// ADD MILESTONE MODAL
// ----------------------------------------------------
function AddMilestoneModal({
  isOpen,
  onClose,
  projectKey,
  onSuccess,
}: {
  isOpen: boolean;
  onClose: () => void;
  projectKey: string;
  onSuccess: () => void;
}) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [status, setStatus] = useState('PENDING');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    setIsSubmitting(true);
    try {
      await createMilestone(projectKey, {
        title: title.trim(),
        description: description.trim() || undefined,
        dueDate: dueDate ? new Date(dueDate).toISOString() : undefined,
        status,
      });
      onSuccess();
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl w-full max-w-md p-6 shadow-xl space-y-4">
        <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">Add Project Milestone</h3>
        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">Title *</label>
            <input
              type="text"
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Phase 1 Release Freeze"
              className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 text-xs text-slate-900 dark:text-slate-100"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">Description</label>
            <textarea
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Key deliverable details..."
              className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 text-xs text-slate-900 dark:text-slate-100"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">Due Date</label>
              <input
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 text-xs text-slate-900 dark:text-slate-100"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">Status</label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 text-xs text-slate-900 dark:text-slate-100"
              >
                <option value="PENDING">Pending</option>
                <option value="IN_PROGRESS">In Progress</option>
                <option value="COMPLETED">Completed</option>
              </select>
            </div>
          </div>

          <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100 dark:border-slate-800">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-500"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-semibold text-xs shadow-xs"
            >
              {isSubmitting ? 'Adding...' : 'Add Milestone'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ----------------------------------------------------
// ALLOCATE MEMBER MODAL
// ----------------------------------------------------
function AllocateMemberModal({
  isOpen,
  onClose,
  projectKey,
  availableUsers,
  roles,
  onSuccess,
}: {
  isOpen: boolean;
  onClose: () => void;
  projectKey: string;
  availableUsers: any[];
  roles: any[];
  onSuccess: () => void;
}) {
  const [userId, setUserId] = useState(availableUsers[0]?.id || '');
  const [roleId, setRoleId] = useState(roles[0]?.id || '');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!userId || !roleId) return;
    setIsSubmitting(true);
    try {
      await assignProjectMemberRole(projectKey, { userId, roleId });
      onSuccess();
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl w-full max-w-md p-6 shadow-xl space-y-4">
        <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">Allocate Member to Project</h3>
        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">User *</label>
            <select
              value={userId}
              onChange={(e) => setUserId(e.target.value)}
              className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 text-xs text-slate-900 dark:text-slate-100"
            >
              {availableUsers.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.fullName} ({u.email})
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">Project Role *</label>
            <select
              value={roleId}
              onChange={(e) => setRoleId(e.target.value)}
              className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 text-xs text-slate-900 dark:text-slate-100"
            >
              {roles.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100 dark:border-slate-800">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-500"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-semibold text-xs shadow-xs"
            >
              {isSubmitting ? 'Allocating...' : 'Allocate Member'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ----------------------------------------------------
// ASSIGN MULTIPLE TEAMS MODAL
// ----------------------------------------------------
function AssignTeamsModal({
  isOpen,
  onClose,
  projectKey,
  allTeams,
  currentTeamIds,
  onSuccess,
}: {
  isOpen: boolean;
  onClose: () => void;
  projectKey: string;
  allTeams: Team[];
  currentTeamIds: string[];
  onSuccess: () => void;
}) {
  const [selectedIds, setSelectedIds] = useState<string[]>(currentTeamIds);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  if (!isOpen) return null;

  const toggleTeam = (teamId: string) => {
    setSelectedIds((prev) =>
      prev.includes(teamId) ? prev.filter((id) => id !== teamId) : [...prev, teamId]
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setErrorMsg(null);
    try {
      await updateProjectTeams(projectKey, selectedIds);
      onSuccess();
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to assign teams');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl w-full max-w-lg p-6 shadow-xl space-y-4">
        <div>
          <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
            Assign Teams to Project
          </h3>
          <p className="text-xs text-slate-400 mt-0.5">
            Select one or more teams. Each team&apos;s tasks are isolated from other teams.
          </p>
        </div>

        {errorMsg && (
          <div className="p-2.5 rounded-lg bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 text-xs text-rose-700 dark:text-rose-300">
            {errorMsg}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="max-h-64 overflow-y-auto rounded-xl border border-slate-200 dark:border-slate-800 divide-y divide-slate-100 dark:divide-slate-800">
            {allTeams.map((team) => {
              const checked = selectedIds.includes(team.id);
              return (
                <div
                  key={team.id}
                  onClick={() => toggleTeam(team.id)}
                  className={`flex items-center justify-between px-3.5 py-2.5 cursor-pointer select-none transition text-xs ${
                    checked
                      ? 'bg-blue-50/70 dark:bg-blue-950/40'
                      : 'hover:bg-slate-50 dark:hover:bg-slate-800/50'
                  }`}
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-slate-900 dark:text-slate-100 truncate">
                        {team.name}
                      </span>
                      <span className="px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 font-mono text-[10px] text-slate-500">
                        {team.keyPrefix}
                      </span>
                    </div>
                    <div className="text-[11px] text-slate-400 mt-0.5">
                      {team.members?.length ?? 0} member{(team.members?.length ?? 0) !== 1 ? 's' : ''}
                      {team.lead ? ` · Lead: ${team.lead.fullName}` : ''}
                    </div>
                  </div>
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => {}}
                    className="h-4 w-4 rounded accent-blue-600 cursor-pointer shrink-0"
                  />
                </div>
              );
            })}
            {allTeams.length === 0 && (
              <div className="py-6 text-center text-xs text-slate-400">
                No teams found. Create teams in the Teams section first.
              </div>
            )}
          </div>

          <div className="flex items-center justify-between pt-3 border-t border-slate-100 dark:border-slate-800">
            <span className="text-[11px] text-slate-400">
              {selectedIds.length} team{selectedIds.length !== 1 ? 's' : ''} selected
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-500 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSubmitting}
                className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-semibold text-xs shadow-xs cursor-pointer"
              >
                {isSubmitting ? 'Saving...' : 'Save Teams'}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
