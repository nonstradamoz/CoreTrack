'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  fetchTeams,
  createTeam,
  updateTeam,
  deleteTeam,
  addTeamMember,
  removeTeamMember,
  updateTeamMemberRole,
  fetchAvailableUsers,
  fetchCurrentUser,
  Team,
  TeamMember,
} from '../../lib/api';
import { usePermissions } from '../../hooks/usePermissions';
import { Permissions } from '../../lib/permissions';
import {
  Users,
  Plus,
  Search,
  UserCheck,
  FolderGit2,
  ChevronRight,
  ShieldCheck,
  Edit2,
  Trash2,
  UserPlus,
  Briefcase,
  AlertCircle,
  Sparkles,
  Check,
  Building2,
  ListTodo,
} from 'lucide-react';

export default function TeamsPage() {
  const queryClient = useQueryClient();
  const { hasPermission, isOrgAdmin } = usePermissions();
  const canManageTeams = isOrgAdmin || hasPermission(Permissions.PROJECT_ADMIN);

  const [searchQuery, setSearchQuery] = useState('');
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [editingTeam, setEditingTeam] = useState<Team | null>(null);
  const [managingMembersTeam, setManagingMembersTeam] = useState<Team | null>(null);

  // Queries
  const { data: teams = [], isLoading } = useQuery({
    queryKey: ['teams'],
    queryFn: fetchTeams,
  });

  const { data: availableUsers = [] } = useQuery({
    queryKey: ['availableUsers'],
    queryFn: fetchAvailableUsers,
  });

  const { data: currentUser } = useQuery({
    queryKey: ['currentUser'],
    queryFn: fetchCurrentUser,
  });

  // Filter teams by search
  const filteredTeams = teams.filter((t) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    const matchName = t.name.toLowerCase().includes(q);
    const matchPrefix = t.keyPrefix.toLowerCase().includes(q);
    const matchLead = t.lead?.fullName.toLowerCase().includes(q);
    const matchDept = t.department?.name.toLowerCase().includes(q);
    return matchName || matchPrefix || matchLead || matchDept;
  });

  // Calculate metrics
  const totalTeams = teams.length;
  const totalLeads = teams.filter((t) => !!t.leadId).length;
  const uniqueMemberIds = new Set<string>();
  teams.forEach((t) => t.members.forEach((m) => uniqueMemberIds.add(m.userId)));
  const totalEmployeesAllocated = uniqueMemberIds.size;
  const totalAssignedTasks = teams.reduce((acc, t) => acc + (t.assignedTicketsCount || 0), 0);

  return (
    <div className="flex-1 flex flex-col h-full bg-[#F5F6F8] dark:bg-[#111318] overflow-y-auto">
      {/* Top Header Banner */}
      <div className="border-b border-slate-200/80 dark:border-slate-800/80 bg-white dark:bg-slate-900 px-6 py-5 transition-colors">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 max-w-7xl mx-auto">
          <div>
            <div className="flex items-center gap-2 text-xs text-slate-400 dark:text-slate-500 font-medium mb-1">
              <span>Organization</span>
              <ChevronRight className="h-3.5 w-3.5" />
              <span className="text-slate-900 dark:text-slate-200 font-semibold">Teams</span>
            </div>
            <h1 className="text-xl md:text-2xl font-bold text-slate-900 dark:text-slate-100 tracking-tight">
              Team Management & Allocations
            </h1>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Organize departments, assign team leads, allocate engineers, and monitor workloads
            </p>
          </div>

          <div className="flex items-center gap-3">
            {canManageTeams && (
              <button
                onClick={() => setIsCreateModalOpen(true)}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-semibold text-xs shadow-sm transition active:scale-95 cursor-pointer"
              >
                <Plus className="h-4 w-4" />
                <span>Create Team</span>
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="p-6 max-w-7xl mx-auto w-full space-y-6">
        {/* 1. AGGREGATE STATS CARDS */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800/80 shadow-2xs">
            <div className="flex items-center justify-between text-slate-400 text-xs font-semibold">
              <span>Teams & Squads</span>
              <Users className="h-4 w-4 text-blue-500" />
            </div>
            <div className="mt-2 text-2xl font-black text-slate-900 dark:text-slate-100 tracking-tight">
              {totalTeams}
            </div>
            <div className="mt-1 text-[11px] text-slate-400">Cross-functional units</div>
          </div>

          <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800/80 shadow-2xs">
            <div className="flex items-center justify-between text-slate-400 text-xs font-semibold">
              <span>Designated Leads</span>
              <UserCheck className="h-4 w-4 text-emerald-500" />
            </div>
            <div className="mt-2 text-2xl font-black text-emerald-600 dark:text-emerald-400 tracking-tight">
              {totalLeads} / {totalTeams}
            </div>
            <div className="mt-1 text-[11px] text-slate-400">Teams with assigned TL</div>
          </div>

          <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800/80 shadow-2xs">
            <div className="flex items-center justify-between text-slate-400 text-xs font-semibold">
              <span>Total Allocated Staff</span>
              <Briefcase className="h-4 w-4 text-indigo-500" />
            </div>
            <div className="mt-2 text-2xl font-black text-indigo-600 dark:text-indigo-400 tracking-tight">
              {totalEmployeesAllocated}
            </div>
            <div className="mt-1 text-[11px] text-slate-400">Unique personnel across squads</div>
          </div>

          <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800/80 shadow-2xs">
            <div className="flex items-center justify-between text-slate-400 text-xs font-semibold">
              <span>Assigned Workload</span>
              <ListTodo className="h-4 w-4 text-purple-500" />
            </div>
            <div className="mt-2 text-2xl font-black text-purple-600 dark:text-purple-400 tracking-tight">
              {totalAssignedTasks}
            </div>
            <div className="mt-1 text-[11px] text-slate-400">Total active task units</div>
          </div>
        </div>

        {/* 2. SEARCH & CONTROLS */}
        <div className="flex items-center justify-between gap-3">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
            <input
              type="text"
              placeholder="Search team by name, prefix, lead, or department..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-3 py-1.5 rounded-xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 text-xs text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:outline-hidden focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition shadow-2xs"
            />
          </div>
        </div>

        {/* 3. TEAMS CARDS GRID */}
        {isLoading ? (
          <div className="py-20 text-center text-xs text-slate-400">Loading enterprise teams...</div>
        ) : filteredTeams.length === 0 ? (
          <div className="py-16 text-center rounded-2xl border border-dashed border-slate-300 dark:border-slate-800 p-8 bg-white/50 dark:bg-slate-900/40">
            <Users className="h-10 w-10 text-slate-300 dark:text-slate-600 mx-auto mb-3" />
            <div className="text-sm font-bold text-slate-700 dark:text-slate-300">No teams found</div>
            <p className="text-xs text-slate-400 mt-1 max-w-sm mx-auto mb-4">
              {searchQuery ? `No teams match "${searchQuery}"` : 'No teams exist yet. Create the first team to begin allocations.'}
            </p>
            {canManageTeams && !searchQuery && (
              <button
                onClick={() => setIsCreateModalOpen(true)}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-semibold text-xs shadow-sm transition active:scale-95 cursor-pointer"
              >
                <Plus className="h-4 w-4" />
                <span>Create First Team</span>
              </button>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {filteredTeams.map((team) => {
              const isLead = currentUser && team.leadId === currentUser.id;
              const canEditThisTeam = canManageTeams || isLead;

              return (
                <div
                  key={team.id}
                  className="rounded-2xl border border-slate-200/80 dark:border-slate-800/80 bg-white dark:bg-slate-900 p-5 shadow-2xs hover:shadow-md hover:border-blue-300 dark:hover:border-blue-900/60 transition-all flex flex-col justify-between"
                >
                  <div>
                    {/* Header: KeyPrefix & Department */}
                    <div className="flex items-center justify-between gap-2 mb-2.5">
                      <div className="flex items-center gap-2">
                        <span className="px-2.5 py-0.5 rounded-md bg-blue-50 dark:bg-blue-950 text-[11px] font-mono font-bold text-blue-600 dark:text-blue-400 border border-blue-200 dark:border-blue-900">
                          {team.keyPrefix}
                        </span>
                        {team.department && (
                          <span className="text-[11px] text-slate-400 dark:text-slate-500 font-medium">
                            {team.department.name}
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-1.5 text-xs text-slate-400 font-medium">
                        <ListTodo className="h-3.5 w-3.5" />
                        <span>{team.assignedTicketsCount ?? 0} tasks</span>
                      </div>
                    </div>

                    {/* Team Name & Description */}
                    <h3 className="text-base font-bold text-slate-900 dark:text-slate-100 tracking-tight">
                      {team.name}
                    </h3>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 line-clamp-2 leading-relaxed">
                      {team.description || 'Cross-functional delivery squad managing platform architecture.'}
                    </p>

                    {/* Team Lead Card */}
                    <div className="mt-4 p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-800">
                      <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1.5 flex items-center justify-between">
                        <span>Team Lead</span>
                        <ShieldCheck className="h-3.5 w-3.5 text-emerald-500" />
                      </div>
                      {team.lead ? (
                        <div className="flex items-center gap-2.5">
                          <div className="h-7 w-7 rounded-full bg-emerald-600 text-white font-bold text-xs flex items-center justify-center shrink-0">
                            {team.lead.fullName[0]}
                          </div>
                          <div className="min-w-0">
                            <div className="text-xs font-bold text-slate-900 dark:text-slate-100 truncate">
                              {team.lead.fullName}
                            </div>
                            <div className="text-[10px] text-slate-400 truncate">{team.lead.email}</div>
                          </div>
                        </div>
                      ) : (
                        <div className="text-xs text-slate-400 italic">No Lead assigned</div>
                      )}
                    </div>

                    {/* Associated Projects */}
                    <div className="mt-3.5 space-y-1.5">
                      <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                        Allocated Projects ({team.projects.length})
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {team.projects.map((p) => (
                          <Link
                            key={p.id}
                            href={`/projects/${p.key}`}
                            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 text-[11px] font-semibold text-slate-700 dark:text-slate-300 hover:bg-blue-50 hover:text-blue-600 dark:hover:bg-blue-950/60 transition"
                          >
                            <FolderGit2 className="h-3 w-3" />
                            <span>{p.name}</span>
                          </Link>
                        ))}
                        {team.projects.length === 0 && (
                          <span className="text-xs text-slate-400 italic">No project allocated</span>
                        )}
                      </div>
                    </div>

                    {/* Member Stack */}
                    <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-800/80 flex items-center justify-between">
                      <div className="text-xs font-semibold text-slate-600 dark:text-slate-400">
                        <span>Members ({team.members.length})</span>
                      </div>
                      <div className="flex items-center -space-x-2">
                        {team.members.slice(0, 4).map((m) => (
                          <div
                            key={m.id}
                            title={m.user?.fullName}
                            className="h-6 w-6 rounded-full bg-blue-600 border-2 border-white dark:border-slate-900 text-[10px] font-bold text-white flex items-center justify-center shadow-2xs"
                          >
                            {m.user?.fullName ? m.user.fullName[0] : 'U'}
                          </div>
                        ))}
                        {team.members.length > 4 && (
                          <div className="h-6 w-6 rounded-full bg-slate-700 border-2 border-white dark:border-slate-900 text-[9px] font-bold text-white flex items-center justify-center">
                            +{team.members.length - 4}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Footer Action Buttons */}
                  <div className="mt-5 pt-3.5 border-t border-slate-100 dark:border-slate-800/80 flex items-center justify-between gap-2">
                    <button
                      onClick={() => setManagingMembersTeam(team)}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 text-xs font-semibold hover:bg-slate-200 dark:hover:bg-slate-700 transition cursor-pointer"
                    >
                      <UserPlus className="h-3.5 w-3.5" />
                      <span>Manage Members</span>
                    </button>

                    <div className="flex items-center gap-1">
                      {canEditThisTeam && (
                        <button
                          onClick={() => setEditingTeam(team)}
                          className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition cursor-pointer"
                          title="Edit Team"
                        >
                          <Edit2 className="h-3.5 w-3.5" />
                        </button>
                      )}

                      {canManageTeams && (
                        <button
                          onClick={async () => {
                            if (confirm(`Delete team "${team.name}"?`)) {
                              try {
                                await deleteTeam(team.id);
                                queryClient.invalidateQueries({ queryKey: ['teams'] });
                              } catch (err: any) {
                                alert(err.message || 'Cannot delete team');
                              }
                            }
                          }}
                          className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/60 transition cursor-pointer"
                          title="Delete Team"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* CREATE TEAM MODAL */}
      {isCreateModalOpen && (
        <CreateTeamModal
          isOpen={isCreateModalOpen}
          onClose={() => setIsCreateModalOpen(false)}
          availableUsers={availableUsers}
          onSuccess={() => {
            queryClient.invalidateQueries({ queryKey: ['teams'] });
            setIsCreateModalOpen(false);
          }}
        />
      )}

      {/* EDIT TEAM MODAL */}
      {editingTeam && (
        <EditTeamModal
          team={editingTeam}
          isOpen={!!editingTeam}
          onClose={() => setEditingTeam(null)}
          availableUsers={availableUsers}
          onSuccess={() => {
            queryClient.invalidateQueries({ queryKey: ['teams'] });
            setEditingTeam(null);
          }}
        />
      )}

      {/* MANAGE MEMBERS MODAL */}
      {managingMembersTeam && (
        <ManageTeamMembersModal
          team={managingMembersTeam}
          isOpen={!!managingMembersTeam}
          onClose={() => setManagingMembersTeam(null)}
          availableUsers={availableUsers}
          canManage={canManageTeams || (currentUser?.id === managingMembersTeam.leadId)}
          onSuccess={() => {
            queryClient.invalidateQueries({ queryKey: ['teams'] });
          }}
        />
      )}
    </div>
  );
}

// ----------------------------------------------------
// CREATE TEAM MODAL
// ----------------------------------------------------
function CreateTeamModal({
  isOpen,
  onClose,
  availableUsers,
  onSuccess,
}: {
  isOpen: boolean;
  onClose: () => void;
  availableUsers: any[];
  onSuccess: () => void;
}) {
  const [name, setName] = useState('');
  const [keyPrefix, setKeyPrefix] = useState('');
  const [description, setDescription] = useState('');
  const [leadId, setLeadId] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const handleNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setName(val);
    if (!keyPrefix || keyPrefix.length < 4) {
      const suggested = val
        .split(' ')
        .map((w) => w[0])
        .join('')
        .toUpperCase()
        .slice(0, 4);
      if (suggested) setKeyPrefix(suggested);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !keyPrefix.trim()) {
      setErrorMsg('Team Name and Key Prefix are required');
      return;
    }

    setIsSubmitting(true);
    setErrorMsg('');

    try {
      await createTeam({
        name: name.trim(),
        keyPrefix: keyPrefix.trim().toUpperCase(),
        description: description.trim() || undefined,
        leadId: leadId || undefined,
      });
      onSuccess();
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to create team');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl w-full max-w-md p-6 shadow-xl space-y-4">
        <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
          <div className="flex items-center gap-2">
            <Users className="h-5 w-5 text-blue-600" />
            <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">Create New Team</h2>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 text-xs">
            ✕
          </button>
        </div>

        {errorMsg && (
          <div className="p-3 rounded-xl bg-rose-50 text-rose-600 text-xs border border-rose-200">
            {errorMsg}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="grid grid-cols-3 gap-3">
            <div className="col-span-2">
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                Team Name *
              </label>
              <input
                type="text"
                required
                value={name}
                onChange={handleNameChange}
                placeholder="e.g. Cloud Infrastructure"
                className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 text-xs text-slate-900 dark:text-slate-100"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                Prefix *
              </label>
              <input
                type="text"
                required
                maxLength={5}
                value={keyPrefix}
                onChange={(e) => setKeyPrefix(e.target.value.toUpperCase())}
                placeholder="INFRA"
                className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 text-xs font-mono font-bold text-slate-900 dark:text-slate-100 uppercase"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
              Description
            </label>
            <textarea
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Responsibilities, squad missions..."
              className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 text-xs text-slate-900 dark:text-slate-100"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
              Designated Team Lead
            </label>
            <select
              value={leadId}
              onChange={(e) => setLeadId(e.target.value)}
              className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 text-xs text-slate-900 dark:text-slate-100"
            >
              <option value="">-- No Lead Assigned --</option>
              {availableUsers.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.fullName} ({u.email})
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
              {isSubmitting ? 'Creating Team...' : 'Create Team'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ----------------------------------------------------
// EDIT TEAM MODAL
// ----------------------------------------------------
function EditTeamModal({
  team,
  isOpen,
  onClose,
  availableUsers,
  onSuccess,
}: {
  team: Team;
  isOpen: boolean;
  onClose: () => void;
  availableUsers: any[];
  onSuccess: () => void;
}) {
  const [name, setName] = useState(team.name);
  const [description, setDescription] = useState(team.description || '');
  const [leadId, setLeadId] = useState(team.leadId || '');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      await updateTeam(team.id, {
        name: name.trim(),
        description: description.trim() || undefined,
        leadId: leadId || null,
      });
      onSuccess();
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl w-full max-w-md p-6 shadow-xl space-y-4">
        <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
          Edit Team ({team.keyPrefix})
        </h3>
        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
              Team Name
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

          <div>
            <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
              Team Lead
            </label>
            <select
              value={leadId}
              onChange={(e) => setLeadId(e.target.value)}
              className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 text-xs text-slate-900 dark:text-slate-100"
            >
              <option value="">-- No Lead Assigned --</option>
              {availableUsers.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.fullName} ({u.email})
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
              {isSubmitting ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ----------------------------------------------------
// MANAGE TEAM MEMBERS MODAL
// ----------------------------------------------------
function ManageTeamMembersModal({
  team,
  isOpen,
  onClose,
  availableUsers,
  canManage,
  onSuccess,
}: {
  team: Team;
  isOpen: boolean;
  onClose: () => void;
  availableUsers: any[];
  canManage: boolean;
  onSuccess: () => void;
}) {
  const [selectedUserId, setSelectedUserId] = useState(availableUsers[0]?.id || '');
  const [selectedRole, setSelectedRole] = useState<'MEMBER' | 'LEAD'>('MEMBER');
  const [isAdding, setIsAdding] = useState(false);

  const handleAddMember = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedUserId) return;
    setIsAdding(true);
    try {
      await addTeamMember(team.id, {
        userId: selectedUserId,
        role: selectedRole,
      });
      onSuccess();
    } finally {
      setIsAdding(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 overflow-y-auto">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl w-full max-w-lg p-6 shadow-xl space-y-4 my-8">
        <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
          <div>
            <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
              Manage Members: {team.name}
            </h3>
            <p className="text-xs text-slate-400">Allocate and organize personnel in this squad</p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 text-xs">
            ✕
          </button>
        </div>

        {/* Add Member Form */}
        {canManage && (
          <form
            onSubmit={handleAddMember}
            className="flex items-center gap-2 p-3 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200/80 dark:border-slate-800"
          >
            <select
              value={selectedUserId}
              onChange={(e) => setSelectedUserId(e.target.value)}
              className="flex-1 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs text-slate-900 dark:text-slate-100"
            >
              {availableUsers.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.fullName} ({u.email})
                </option>
              ))}
            </select>

            <select
              value={selectedRole}
              onChange={(e) => setSelectedRole(e.target.value as 'MEMBER' | 'LEAD')}
              className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs text-slate-900 dark:text-slate-100 font-semibold"
            >
              <option value="MEMBER">Member</option>
              <option value="LEAD">Team Lead</option>
            </select>

            <button
              type="submit"
              disabled={isAdding}
              className="px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-semibold text-xs shadow-2xs shrink-0 cursor-pointer"
            >
              {isAdding ? 'Adding...' : 'Add'}
            </button>
          </form>
        )}

        {/* Existing Members Roster */}
        <div className="space-y-2 max-h-72 overflow-y-auto">
          {team.members.map((m) => (
            <div
              key={m.id}
              className="flex items-center justify-between p-3 rounded-xl border border-slate-100 dark:border-slate-800/80 bg-white dark:bg-slate-900 text-xs"
            >
              <div className="flex items-center gap-2.5">
                <div className="h-7 w-7 rounded-full bg-blue-600 text-white text-[11px] font-bold flex items-center justify-center">
                  {m.user?.fullName ? m.user.fullName[0] : 'U'}
                </div>
                <div>
                  <div className="font-bold text-slate-900 dark:text-slate-100">
                    {m.user?.fullName || 'User'}
                  </div>
                  <div className="text-[10px] text-slate-400">{m.user?.email}</div>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <span
                  className={`px-2 py-0.5 rounded-md text-[10px] font-bold ${
                    m.role === 'LEAD'
                      ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400'
                      : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400'
                  }`}
                >
                  {m.role}
                </span>

                {canManage && (
                  <button
                    onClick={async () => {
                      if (confirm(`Remove ${m.user?.fullName || 'user'} from this team?`)) {
                        await removeTeamMember(team.id, m.userId);
                        onSuccess();
                      }
                    }}
                    className="p-1 text-slate-400 hover:text-rose-600 rounded-md transition cursor-pointer"
                    title="Remove from team"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            </div>
          ))}

          {team.members.length === 0 && (
            <div className="py-6 text-center text-xs text-slate-400 italic">
              No members allocated to this squad yet.
            </div>
          )}
        </div>

        <div className="flex justify-end pt-3 border-t border-slate-100 dark:border-slate-800">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-semibold text-xs"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
