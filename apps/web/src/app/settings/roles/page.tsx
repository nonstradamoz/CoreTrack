'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useProject } from '../../../context/ProjectContext';
import {
  fetchRoles,
  fetchPermissionDefinitions,
  fetchProjectMembers,
  assignProjectMemberRole,
  removeProjectMember,
  fetchAvailableUsers,
  Role,
  PermissionDefinition,
  ProjectMember,
} from '../../../lib/api';
import { useModuleAccess } from '../../../hooks/useModuleAccess';
import { AccessDenied } from '../../../components/auth/AccessDenied';
import { Permissions } from '../../../lib/permissions';
import {
  Shield,
  Plus,
  Check,
  Trash2,
  Users,
  UserPlus,
  Lock,
  Sparkles,
  Sliders,
  UserCheck,
  Search,
  AlertCircle,
  X,
  LayoutDashboard,
  FolderGit2,
  Table2,
  Calendar,
  Layers,
  BarChart3,
  Zap,
  LifeBuoy,
} from 'lucide-react';

const MODULE_ITEMS = [
  { key: 'dashboard', label: 'Dashboard', route: '/dashboard', bit: Permissions.PROJECT_VIEW, icon: LayoutDashboard, description: 'KPI metrics, project carousels, activity feed' },
  { key: 'board', label: 'Kanban Board', route: '/', bit: Permissions.PROJECT_VIEW, icon: FolderGit2, description: 'Card drag-and-drop, sprint tasks, workflow columns' },
  { key: 'table', label: 'All Tasks Table', route: '/table', bit: Permissions.TICKET_BATCH_EDIT, icon: Table2, description: 'High-density spreadsheet, bulk edits' },
  { key: 'timeline', label: 'Calendar & Schedule', route: '/timeline', bit: Permissions.PROJECT_VIEW, icon: Calendar, description: 'Schedule, dependency tracking, conflict alerts' },
  { key: 'backlog', label: 'Sprint Backlog', route: '/backlog', bit: Permissions.SPRINT_MANAGE, icon: Layers, description: 'Sprint creation, planning, backlog ordering' },
  { key: 'reports', label: 'Agile Reports', route: '/reports', bit: Permissions.PROJECT_VIEW, icon: BarChart3, description: 'Burndown, velocity, CFD, SLA compliance' },
  { key: 'automation', label: 'Automation Rules', route: '/automation', bit: Permissions.AUTOMATION_MANAGE, icon: Zap, description: 'Trigger-condition-action engine, CSV import' },
  { key: 'portal', label: 'ITSM Portal', route: '/portal', bit: Permissions.TICKET_CREATE, icon: LifeBuoy, description: 'Employee service desk & IT catalog requests' },
  { key: 'settings', label: 'Roles & Settings', route: '/settings/roles', bit: Permissions.SETTINGS_EDIT, icon: Shield, description: 'Organization RBAC & membership (Super Admin only)' },
];

export default function RolesSettingsPage() {
  const queryClient = useQueryClient();
  const { activeProject } = useProject();
  const { canAccessSettings } = useModuleAccess();
  const projectKey = activeProject?.key || 'CORE';

  const [activeTab, setActiveTab] = useState<'ROLES' | 'MEMBERS'>('ROLES');
  const [selectedRoleId, setSelectedRoleId] = useState<string | null>(null);
  const [isAddMemberOpen, setIsAddMemberOpen] = useState(false);
  const [memberSearchQuery, setMemberSearchQuery] = useState('');
  const [newMemberUserId, setNewMemberUserId] = useState('');
  const [newMemberRoleId, setNewMemberRoleId] = useState('');

  // Queries
  const { data: roles = [], isLoading: isLoadingRoles } = useQuery({
    queryKey: ['roles', projectKey],
    queryFn: () => fetchRoles(projectKey),
  });

  const { data: definitions = [] } = useQuery({
    queryKey: ['permissionDefinitions'],
    queryFn: fetchPermissionDefinitions,
  });

  const { data: members = [], isLoading: isLoadingMembers } = useQuery({
    queryKey: ['projectMembers', projectKey],
    queryFn: () => fetchProjectMembers(projectKey),
  });

  const { data: allUsers = [] } = useQuery({
    queryKey: ['availableUsers'],
    queryFn: fetchAvailableUsers,
  });

  // Standard system roles only (no custom roles)
  const standardRoles = roles.filter((r) => r.isSystem);
  const selectedRole = standardRoles.find((r) => r.id === selectedRoleId) || standardRoles[0];
  const activeBits = selectedRole ? BigInt(selectedRole.permissions) : 0n;

  // Mutations
  const assignMemberMutation = useMutation({
    mutationFn: (data: { userId: string; roleId: string }) =>
      assignProjectMemberRole(projectKey, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['projectMembers', projectKey] });
      queryClient.invalidateQueries({ queryKey: ['roles', projectKey] });
      setIsAddMemberOpen(false);
      setNewMemberUserId('');
      setNewMemberRoleId('');
    },
  });

  const removeMemberMutation = useMutation({
    mutationFn: (userId: string) => removeProjectMember(projectKey, userId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['projectMembers', projectKey] });
      queryClient.invalidateQueries({ queryKey: ['roles', projectKey] });
    },
  });

  // Group definitions by category
  const categories: { key: PermissionDefinition['category']; label: string }[] = [
    { key: 'ORG', label: 'Organization & System' },
    { key: 'PROJECT', label: 'Project Management' },
    { key: 'TASK', label: 'Task Lifecycle' },
    { key: 'ITSM', label: 'ITSM & Approvals' },
  ];

  const filteredMembers = members.filter(
    (m) =>
      m.fullName.toLowerCase().includes(memberSearchQuery.toLowerCase()) ||
      m.email.toLowerCase().includes(memberSearchQuery.toLowerCase()) ||
      m.role.name.toLowerCase().includes(memberSearchQuery.toLowerCase())
  );

  const existingMemberUserIds = new Set(members.map((m) => m.userId));
  const assignableUsers = allUsers.filter((u) => !existingMemberUserIds.has(u.id));
  const membersWithSelectedRole = members.filter((m) => m.role.id === selectedRole?.id);

  if (!canAccessSettings()) return <AccessDenied module="Roles & Settings" requiredRole="Super Admin only" />;

  return (
    <div className="flex-1 flex flex-col min-w-0 space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-200 dark:border-slate-800">
        <div>
          <h1 className="text-xl md:text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100 flex items-center gap-2.5">
            <Shield className="h-6 w-6 text-blue-600 dark:text-blue-400" />
            <span>Roles & Permissions</span>
          </h1>
          <p className="text-xs md:text-sm text-slate-500 dark:text-slate-400 mt-1">
            View standard role capabilities and manage project member assignments for {projectKey}.
          </p>
        </div>

        <div className="flex items-center gap-2">
          {activeTab === 'MEMBERS' && (
            <button
              onClick={() => setIsAddMemberOpen(true)}
              className="px-3.5 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold flex items-center gap-1.5 shadow-2xs transition cursor-pointer"
            >
              <Plus className="h-3.5 w-3.5" />
              <span>Add Member</span>
            </button>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-slate-200 dark:border-slate-800 gap-6 text-xs font-semibold">
        <button
          onClick={() => setActiveTab('ROLES')}
          className={`pb-3 flex items-center gap-2 border-b-2 transition ${
            activeTab === 'ROLES'
              ? 'border-blue-600 text-blue-600 dark:text-blue-400 font-bold'
              : 'border-transparent text-slate-500 hover:text-slate-900 dark:hover:text-slate-200'
          }`}
        >
          <Sliders className="h-4 w-4" />
          <span>Roles ({standardRoles.length})</span>
        </button>

        <button
          onClick={() => setActiveTab('MEMBERS')}
          className={`pb-3 flex items-center gap-2 border-b-2 transition ${
            activeTab === 'MEMBERS'
              ? 'border-blue-600 text-blue-600 dark:text-blue-400 font-bold'
              : 'border-transparent text-slate-500 hover:text-slate-900 dark:hover:text-slate-200'
          }`}
        >
          <Users className="h-4 w-4" />
          <span>Project Members ({members.length})</span>
        </button>

        <Link
          href="/settings/users"
          className="pb-3 flex items-center gap-2 border-b-2 border-transparent text-slate-500 hover:text-blue-600 dark:hover:text-blue-400 transition"
        >
          <UserPlus className="h-4 w-4" />
          <span>User Directory & Add User</span>
        </Link>
      </div>

      {/* TAB 1: ROLE MATRIX */}
      {activeTab === 'ROLES' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Roles Roster */}
          <div className="lg:col-span-4 space-y-2.5">
            <div className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-2">
              Available Roles
            </div>

            {isLoadingRoles ? (
              <div className="p-8 text-center text-xs text-slate-400">Loading roles...</div>
            ) : (
              standardRoles.map((r) => {
                const isSelected = selectedRole?.id === r.id;
                return (
                  <div
                    key={r.id}
                    onClick={() => setSelectedRoleId(r.id)}
                    className={`p-3.5 rounded-xl border transition cursor-pointer flex items-center justify-between ${
                      isSelected
                        ? 'border-blue-600 bg-blue-50/50 dark:bg-blue-950/40 shadow-2xs'
                        : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:border-slate-300'
                    }`}
                  >
                    <div className="flex items-center gap-2.5 min-w-0 flex-1 pr-2">
                      <span
                        className="h-3 w-3 rounded-full shrink-0"
                        style={{ backgroundColor: r.color }}
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5">
                          <span className="text-xs font-bold text-slate-900 dark:text-slate-100 truncate">
                            {r.name}
                          </span>
                          {r.isSystem && (
                            <span className="px-1.5 py-0.2 rounded text-[9px] font-mono bg-slate-100 dark:bg-slate-800 text-slate-500 border border-slate-200 dark:border-slate-700 shrink-0">
                              System
                            </span>
                          )}
                        </div>
                        <p className="text-[11px] text-slate-400 truncate mt-0.5">
                          {r.description || 'No description'}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400">
                        {r.memberCount}
                      </span>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* Permission Matrix Detail */}
          <div className="lg:col-span-8 space-y-5">
            {selectedRole ? (
              <div className="p-5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-2xs space-y-6">
                {/* Header Meta */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-slate-100 dark:border-slate-800">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <span
                        className="h-3 w-3 rounded-full"
                        style={{ backgroundColor: selectedRole.color }}
                      />
                      <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">
                        {selectedRole.name}
                      </h2>
                      <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-400 border border-blue-200 dark:border-blue-900">
                        Standard Role
                      </span>
                    </div>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      {selectedRole.description}
                    </p>
                  </div>

                  <div className="flex items-center gap-2">
                    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 text-[11px] font-semibold border border-slate-200 dark:border-slate-700">
                      <Lock className="h-3 w-3" />
                      <span>Read-Only</span>
                    </span>
                  </div>
                </div>

                {/* 1. Module Access List (Only granted modules, no checkboxes) */}
                {(() => {
                  const grantedModules = MODULE_ITEMS.filter(
                    (mod) => (activeBits & mod.bit) === mod.bit || (activeBits & 1n) === 1n
                  );
                  return (
                    <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/40 dark:bg-slate-800/20 space-y-3">
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <Sliders className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-800 dark:text-slate-200">
                            Module Access ({grantedModules.length})
                          </h3>
                        </div>
                      </div>

                      {grantedModules.length === 0 ? (
                        <p className="text-xs text-slate-400 italic">No module access granted to this role.</p>
                      ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2.5">
                          {grantedModules.map((mod) => {
                            const Icon = mod.icon;
                            return (
                              <div
                                key={mod.key}
                                className="p-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-xs flex items-start gap-2.5 shadow-2xs"
                              >
                                <div className="p-1.5 rounded-lg bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 shrink-0">
                                  <Icon className="h-3.5 w-3.5" />
                                </div>
                                <div className="min-w-0 flex-1">
                                  <span className="font-bold text-slate-900 dark:text-slate-100 block truncate">
                                    {mod.label}
                                  </span>
                                  <span className="text-[10px] text-slate-400 block truncate mt-0.5 font-mono">
                                    {mod.route}
                                  </span>
                                  <span className="text-[10px] text-slate-500 dark:text-slate-400 block line-clamp-1 mt-0.5">
                                    {mod.description}
                                  </span>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })()}

                {/* 2. Granted Permissions List (Categorized, no checkboxes) */}
                <div className="pt-2 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-400">
                    Granted Permissions
                  </h3>
                </div>

                <div className="space-y-5">
                  {categories.map((cat) => {
                    const grantedDefs = definitions.filter((d) => {
                      if (d.category !== cat.key) return false;
                      const bitBigInt = BigInt(d.bit);
                      return (activeBits & bitBigInt) === bitBigInt || ((activeBits & 1n) === 1n && d.key !== 'ORG_ADMIN');
                    });
                    if (grantedDefs.length === 0) return null;

                    return (
                      <div key={cat.key} className="space-y-2">
                        <h4 className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                          {cat.label} ({grantedDefs.length})
                        </h4>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                          {grantedDefs.map((def) => (
                            <div
                              key={def.key}
                              className="p-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/30 text-xs"
                            >
                              <span className="font-semibold text-slate-800 dark:text-slate-200 block">
                                {def.name}
                              </span>
                              <span className="text-[11px] text-slate-400 block leading-tight mt-0.5">
                                {def.description}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* 3. Members Assigned to this Role / Access */}
                <div className="pt-4 border-t border-slate-100 dark:border-slate-800 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Users className="h-4 w-4 text-slate-500" />
                      <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300">
                        Members with this Access ({membersWithSelectedRole.length})
                      </h3>
                    </div>
                    <span className="text-[11px] text-slate-400">
                      Users actively assigned to {selectedRole.name} in {projectKey}
                    </span>
                  </div>

                  {membersWithSelectedRole.length === 0 ? (
                    <div className="p-4 rounded-xl border border-dashed border-slate-200 dark:border-slate-800 text-center text-xs text-slate-400">
                      No members are currently assigned to this role in {projectKey}.
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                      {membersWithSelectedRole.map((m) => (
                        <div
                          key={m.id}
                          className="p-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-800/40 flex items-center justify-between gap-2"
                        >
                          <div className="flex items-center gap-2.5 min-w-0">
                            <div className="h-7 w-7 rounded-full bg-blue-600 text-white font-bold text-xs flex items-center justify-center shrink-0">
                              {m.fullName.charAt(0).toUpperCase()}
                            </div>
                            <div className="min-w-0">
                              <span className="text-xs font-semibold text-slate-900 dark:text-slate-100 block truncate">
                                {m.fullName}
                              </span>
                              <span className="text-[10px] text-slate-400 font-mono block truncate">
                                {m.email}
                              </span>
                            </div>
                          </div>

                          <button
                            onClick={() => {
                              if (confirm(`Revoke ${m.fullName}'s access from project ${projectKey}?`)) {
                                removeMemberMutation.mutate(m.userId);
                              }
                            }}
                            className="px-2 py-1 rounded-md text-[11px] font-semibold text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/50 border border-rose-200 dark:border-rose-900/60 flex items-center gap-1 transition shrink-0 cursor-pointer"
                            title={`Revoke ${m.fullName}'s access`}
                          >
                            <Trash2 className="h-3 w-3" />
                            <span>Revoke Access</span>
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="p-12 text-center text-xs text-slate-400 border border-dashed rounded-2xl">
                Select a role to inspect its capability bitmask.
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 2: PROJECT MEMBERS */}
      {activeTab === 'MEMBERS' && (
        <div className="space-y-4">
          {/* Member Search Bar */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 p-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-2xs">
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-slate-400" />
              <input
                type="text"
                placeholder="Search project members by name, email, or role..."
                value={memberSearchQuery}
                onChange={(e) => setMemberSearchQuery(e.target.value)}
                className="w-full pl-8 pr-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:border-blue-600 focus:bg-white dark:focus:bg-slate-900 transition"
              />
            </div>
            <span className="text-xs text-slate-400">
              {filteredMembers.length} active members
            </span>
          </div>

          {/* Members Table */}
          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-2xs overflow-hidden">
            {isLoadingMembers ? (
              <div className="p-12 text-center text-xs text-slate-400">Loading members...</div>
            ) : filteredMembers.length === 0 ? (
              <div className="p-8 text-center text-xs text-slate-400">No project members found.</div>
            ) : (
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/40 text-slate-500 font-semibold">
                    <th className="py-2.5 px-4">Member</th>
                    <th className="py-2.5 px-4">Account Type</th>
                    <th className="py-2.5 px-4">Assigned Role ({projectKey})</th>
                    <th className="py-2.5 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {filteredMembers.map((m) => (
                    <tr key={m.id} className="hover:bg-slate-50/60 dark:hover:bg-slate-800/30 transition">
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-2.5">
                          <div className="h-7 w-7 rounded-full bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 font-bold text-xs flex items-center justify-center">
                            {m.fullName.charAt(0).toUpperCase()}
                          </div>
                          <div>
                            <span className="font-semibold text-slate-900 dark:text-slate-100 block">
                              {m.fullName}
                            </span>
                            <span className="text-[11px] text-slate-400 font-mono block">
                              {m.email}
                            </span>
                          </div>
                        </div>
                      </td>

                      <td className="py-3 px-4">
                        <span className="px-2 py-0.5 rounded text-[10px] font-mono font-medium bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
                          {m.userType}
                        </span>
                      </td>

                      <td className="py-3 px-4">
                        <select
                          value={m.role.id}
                          onChange={(e) =>
                            assignMemberMutation.mutate({
                              userId: m.userId,
                              roleId: e.target.value,
                            })
                          }
                          className="px-2 py-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-semibold text-slate-800 dark:text-slate-200 cursor-pointer focus:outline-none focus:border-blue-600"
                        >
                          {roles.map((r) => (
                            <option key={r.id} value={r.id}>
                              {r.name}
                            </option>
                          ))}
                        </select>
                      </td>

                      <td className="py-3 px-4 text-right">
                        <button
                          onClick={() => {
                            if (confirm(`Revoke access for ${m.fullName} from project ${projectKey}?`)) {
                              removeMemberMutation.mutate(m.userId);
                            }
                          }}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-950/40 hover:bg-rose-100 dark:hover:bg-rose-900/60 border border-rose-200 dark:border-rose-900/60 transition cursor-pointer"
                          title={`Revoke access for ${m.fullName}`}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                          <span>Revoke Access</span>
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      {/* ADD MEMBER MODAL */}
      {isAddMemberOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs">
          <div className="w-full max-w-md bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 p-5 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
              <h3 className="text-base font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                <UserCheck className="h-5 w-5 text-blue-600" />
                <span>Add Member to {projectKey}</span>
              </h3>
              <button
                onClick={() => setIsAddMemberOpen(false)}
                className="p-1 rounded text-slate-400 hover:text-slate-600"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (!newMemberUserId || !newMemberRoleId) return;
                assignMemberMutation.mutate({
                  userId: newMemberUserId,
                  roleId: newMemberRoleId,
                });
              }}
              className="space-y-4"
            >
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Select User
                </label>
                <select
                  required
                  value={newMemberUserId}
                  onChange={(e) => setNewMemberUserId(e.target.value)}
                  className="w-full px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs text-slate-900 dark:text-slate-100 focus:outline-none focus:border-blue-600 cursor-pointer"
                >
                  <option value="">-- Choose User --</option>
                  {assignableUsers.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.fullName} ({u.email})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Assign Initial Role
                </label>
                <select
                  required
                  value={newMemberRoleId}
                  onChange={(e) => setNewMemberRoleId(e.target.value)}
                  className="w-full px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs text-slate-900 dark:text-slate-100 focus:outline-none focus:border-blue-600 cursor-pointer"
                >
                  <option value="">-- Choose Role --</option>
                  {roles.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsAddMemberOpen(false)}
                  className="px-3.5 py-1.5 rounded-lg text-xs font-medium text-slate-600 dark:text-slate-400 hover:bg-slate-100 transition cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={assignMemberMutation.isPending}
                  className="px-4 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold shadow-2xs transition cursor-pointer disabled:opacity-50"
                >
                  {assignMemberMutation.isPending ? 'Assigning...' : 'Add Member'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
