'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useProject } from '../../../context/ProjectContext';
import {
  fetchRoles,
  fetchPermissionDefinitions,
  createRole,
  updateRole,
  deleteRole,
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
  { key: 'timeline', label: 'Timeline & Schedule', route: '/timeline', bit: Permissions.SPRINT_MANAGE, icon: Calendar, description: 'Gantt chart, dependency tracking, conflict alerts' },
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
  const [isCreateRoleOpen, setIsCreateRoleOpen] = useState(false);
  const [isAddMemberOpen, setIsAddMemberOpen] = useState(false);
  const [memberSearchQuery, setMemberSearchQuery] = useState('');
  const [newMemberUserId, setNewMemberUserId] = useState('');
  const [newMemberRoleId, setNewMemberRoleId] = useState('');

  // New Role Form State
  const [newRoleName, setNewRoleName] = useState('');
  const [newRoleDesc, setNewRoleDesc] = useState('');
  const [newRoleColor, setNewRoleColor] = useState('#2563EB');
  const [newRoleBits, setNewRoleBits] = useState<bigint>(0n);

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

  // Selected Role (default to first role)
  const selectedRole = roles.find((r) => r.id === selectedRoleId) || roles[0];
  const [stagedBits, setStagedBits] = useState<bigint | null>(null);

  const activeBits = stagedBits !== null ? stagedBits : selectedRole ? BigInt(selectedRole.permissions) : 0n;

  // Mutations
  const createRoleMutation = useMutation({
    mutationFn: (data: Parameters<typeof createRole>[0]) => createRole(data),
    onSuccess: (newRole) => {
      queryClient.invalidateQueries({ queryKey: ['roles', projectKey] });
      setSelectedRoleId(newRole.id);
      setIsCreateRoleOpen(false);
      resetNewRoleForm();
    },
  });

  const updateRoleMutation = useMutation({
    mutationFn: ({ roleId, permissions }: { roleId: string; permissions: string }) =>
      updateRole(roleId, { permissions }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['roles', projectKey] });
      setStagedBits(null);
    },
  });

  const deleteRoleMutation = useMutation({
    mutationFn: (roleId: string) => deleteRole(roleId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['roles', projectKey] });
      setSelectedRoleId(null);
    },
  });

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

  function resetNewRoleForm() {
    setNewRoleName('');
    setNewRoleDesc('');
    setNewRoleColor('#2563EB');
    setNewRoleBits(0n);
  }

  function togglePermissionBit(bit: bigint) {
    if (!selectedRole) return;
    const current = activeBits;
    const next = (current & bit) === bit ? current & ~bit : current | bit;
    setStagedBits(next);
  }

  function toggleNewRoleBit(bit: bigint) {
    const current = newRoleBits;
    const next = (current & bit) === bit ? current & ~bit : current | bit;
    setNewRoleBits(next);
  }

  function handleSaveStagedPermissions() {
    if (!selectedRole || stagedBits === null) return;
    updateRoleMutation.mutate({
      roleId: selectedRole.id,
      permissions: stagedBits.toString(),
    });
  }

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

  function handleDeleteRole(roleId: string, roleName: string) {
    if (confirm(`Permanently delete role "${roleName}" and revoke access for all assigned members?`)) {
      deleteRoleMutation.mutate(roleId);
    }
  }

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
            Configure dynamic role bitmasks and assign member capabilities for {projectKey}.
          </p>
        </div>

        <div className="flex items-center gap-2">
          {activeTab === 'ROLES' ? (
            <button
              onClick={() => {
                resetNewRoleForm();
                setIsCreateRoleOpen(true);
              }}
              className="px-3.5 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold flex items-center gap-1.5 shadow-2xs transition cursor-pointer"
            >
              <Plus className="h-3.5 w-3.5" />
              <span>New Role</span>
            </button>
          ) : (
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
          <span>Role Matrix ({roles.length})</span>
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
              roles.map((r) => {
                const isSelected = selectedRole?.id === r.id;
                return (
                  <div
                    key={r.id}
                    onClick={() => {
                      setSelectedRoleId(r.id);
                      setStagedBits(null);
                    }}
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
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeleteRole(r.id, r.name);
                        }}
                        className="p-1 text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 rounded transition cursor-pointer"
                        title={`Delete role ${r.name}`}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
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
                        {selectedRole.isSystem ? 'Standard Role' : 'Custom Role'}
                      </span>
                    </div>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      {selectedRole.description}
                    </p>
                  </div>

                  <div className="flex items-center gap-2">
                    {/* Delete Role Button — Available for each and every role */}
                    <button
                      onClick={() => handleDeleteRole(selectedRole.id, selectedRole.name)}
                      className="px-3 py-1.5 rounded-lg border border-rose-200 dark:border-rose-900 bg-rose-50/70 dark:bg-rose-950/40 text-rose-600 dark:text-rose-400 hover:bg-rose-100 dark:hover:bg-rose-900/60 text-xs font-semibold shadow-2xs transition flex items-center gap-1.5 cursor-pointer"
                      title={`Delete role ${selectedRole.name}`}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      <span>Delete Role</span>
                    </button>

                    {stagedBits !== null && (
                      <button
                        onClick={handleSaveStagedPermissions}
                        disabled={updateRoleMutation.isPending}
                        className="px-3.5 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold shadow-2xs transition flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                      >
                        <Check className="h-3.5 w-3.5" />
                        <span>{updateRoleMutation.isPending ? 'Saving...' : 'Save Matrix'}</span>
                      </button>
                    )}
                  </div>
                </div>

                {/* 1. High-Level Module Access Grid */}
                <div className="p-4 rounded-xl border border-blue-100 dark:border-blue-900/40 bg-blue-50/25 dark:bg-blue-950/20 space-y-3.5">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <Sliders className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                      <h3 className="text-xs font-bold uppercase tracking-wider text-slate-800 dark:text-slate-200">
                        Module Access Control Grid
                      </h3>
                    </div>
                    
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setStagedBits(0n)}
                        className="px-2.5 py-1 rounded-md border border-rose-200 dark:border-rose-900 bg-white dark:bg-slate-900 text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/50 text-[11px] font-semibold flex items-center gap-1 transition cursor-pointer"
                        title="Revoke all module access for this role"
                      >
                        <Trash2 className="h-3 w-3" />
                        <span>Revoke All Access</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          const allBits = MODULE_ITEMS.reduce((acc, m) => acc | m.bit, 0n);
                          setStagedBits(allBits);
                        }}
                        className="px-2.5 py-1 rounded-md border border-blue-200 dark:border-blue-900 bg-white dark:bg-slate-900 text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-950/50 text-[11px] font-semibold flex items-center gap-1 transition cursor-pointer"
                        title="Grant access to all modules"
                      >
                        <Check className="h-3 w-3" />
                        <span>Grant All</span>
                      </button>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2.5">
                    {MODULE_ITEMS.map((mod) => {
                      const Icon = mod.icon;
                      const hasAccess = (activeBits & mod.bit) === mod.bit || (activeBits & 1n) === 1n;

                      return (
                        <label
                          key={mod.key}
                          className={`p-3 rounded-xl border text-xs flex items-start gap-2.5 transition select-none cursor-pointer hover:border-blue-400 ${
                            hasAccess
                              ? 'border-blue-300 dark:border-blue-800 bg-white dark:bg-slate-900 shadow-2xs'
                              : 'border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-800/40 opacity-70'
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={hasAccess}
                            onChange={() => togglePermissionBit(mod.bit)}
                            className="mt-0.5 rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                          />
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-1.5">
                              <Icon className={`h-3.5 w-3.5 shrink-0 ${hasAccess ? 'text-blue-600 dark:text-blue-400' : 'text-slate-400'}`} />
                              <span className="font-bold text-slate-900 dark:text-slate-100 truncate">
                                {mod.label}
                              </span>
                            </div>
                            <span className="text-[10px] text-slate-400 block truncate mt-0.5 font-mono">
                              {mod.route}
                            </span>
                            <span className="text-[10px] text-slate-500 dark:text-slate-400 block line-clamp-1 mt-0.5">
                              {mod.description}
                            </span>
                          </div>
                        </label>
                      );
                    })}
                  </div>
                </div>

                {/* Granular Permission Bit Matrix Section Header */}
                <div className="pt-2 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-400">
                    Granular Bitmask Capabilities
                  </h3>
                  <span className="text-[10px] font-mono text-slate-400">
                    Bitmask: 0x{activeBits.toString(16)}
                  </span>
                </div>

                {/* Categorized Checkbox Matrix */}
                <div className="space-y-6">
                  {categories.map((cat) => {
                    const catDefs = definitions.filter((d) => d.category === cat.key);
                    if (catDefs.length === 0) return null;

                    return (
                      <div key={cat.key} className="space-y-2.5">
                        <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                          {cat.label}
                        </h3>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                          {catDefs.map((def) => {
                            const bitBigInt = BigInt(def.bit);
                            const isChecked = (activeBits & bitBigInt) === bitBigInt || ((activeBits & 1n) === 1n && def.key !== 'ORG_ADMIN');

                            return (
                              <label
                                key={def.key}
                                className={`p-3 rounded-xl border text-xs flex items-start gap-2.5 transition select-none cursor-pointer hover:border-blue-300 ${
                                  isChecked
                                    ? 'border-blue-200 dark:border-blue-900/60 bg-blue-50/30 dark:bg-blue-950/20'
                                    : 'border-slate-200 dark:border-slate-800 bg-slate-50/40 dark:bg-slate-800/20'
                                }`}
                              >
                                <input
                                  type="checkbox"
                                  checked={isChecked}
                                  onChange={() => togglePermissionBit(bitBigInt)}
                                  className="mt-0.5 rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                                />
                                <div className="min-w-0">
                                  <span className="font-semibold text-slate-800 dark:text-slate-200 block">
                                    {def.name}
                                  </span>
                                  <span className="text-[11px] text-slate-400 block leading-tight mt-0.5">
                                    {def.description}
                                  </span>
                                </div>
                              </label>
                            );
                          })}
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

      {/* CREATE ROLE MODAL */}
      {isCreateRoleOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs">
          <div className="w-full max-w-lg bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 p-5 space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
              <h3 className="text-base font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                <Shield className="h-5 w-5 text-blue-600" />
                <span>Create Custom Dynamic Role</span>
              </h3>
              <button
                onClick={() => setIsCreateRoleOpen(false)}
                className="p-1 rounded text-slate-400 hover:text-slate-600"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (!newRoleName.trim()) return;
                createRoleMutation.mutate({
                  name: newRoleName.trim(),
                  description: newRoleDesc.trim(),
                  color: newRoleColor,
                  permissions: newRoleBits.toString(),
                  projectKey,
                });
              }}
              className="space-y-4"
            >
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Role Name
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Release Specialist"
                  value={newRoleName}
                  onChange={(e) => setNewRoleName(e.target.value)}
                  className="w-full px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs text-slate-900 dark:text-slate-100 focus:outline-none focus:border-blue-600"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Description
                </label>
                <textarea
                  rows={2}
                  placeholder="Briefly state scope and duties of this role"
                  value={newRoleDesc}
                  onChange={(e) => setNewRoleDesc(e.target.value)}
                  className="w-full px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs text-slate-900 dark:text-slate-100 focus:outline-none focus:border-blue-600"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Role Color Tag
                </label>
                <div className="flex items-center gap-2">
                  {['#2563EB', '#0EA5E9', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899'].map(
                    (color) => (
                      <button
                        key={color}
                        type="button"
                        onClick={() => setNewRoleColor(color)}
                        className={`h-6 w-6 rounded-full border-2 transition ${
                          newRoleColor === color ? 'border-slate-900 dark:border-white scale-110' : 'border-transparent'
                        }`}
                        style={{ backgroundColor: color }}
                      />
                    )
                  )}
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-2">
                  Initial Permissions:
                </label>
                <div className="max-h-48 overflow-y-auto space-y-1.5 pr-1 border border-slate-200 dark:border-slate-800 rounded-xl p-2.5">
                  {definitions.map((def) => {
                    const bit = BigInt(def.bit);
                    const isChecked = (newRoleBits & bit) === bit;
                    return (
                      <label
                        key={def.key}
                        className="flex items-center gap-2 p-1.5 rounded hover:bg-slate-50 dark:hover:bg-slate-800 text-xs cursor-pointer"
                      >
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => toggleNewRoleBit(bit)}
                          className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                        />
                        <span className="font-medium text-slate-800 dark:text-slate-200">
                          {def.name}
                        </span>
                        <span className="text-[10px] text-slate-400 font-mono ml-auto">
                          [{def.category}]
                        </span>
                      </label>
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

              <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsCreateRoleOpen(false)}
                  className="px-3.5 py-1.5 rounded-lg text-xs font-medium text-slate-600 dark:text-slate-400 hover:bg-slate-100 transition cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={createRoleMutation.isPending}
                  className="px-4 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold shadow-2xs transition cursor-pointer disabled:opacity-50"
                >
                  {createRoleMutation.isPending ? 'Creating...' : 'Create Role'}
                </button>
              </div>
            </form>
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
