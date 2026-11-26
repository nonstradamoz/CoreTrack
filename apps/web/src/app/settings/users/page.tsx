'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  fetchAvailableUsers,
  createUser,
  updateUser,
  deleteUser,
  switchUser,
  fetchTeams,
  fetchCurrentUser,
  UserPersona,
  CreateUserPayload,
} from '../../../lib/api';
import { useModuleAccess } from '../../../hooks/useModuleAccess';
import { AccessDenied } from '../../../components/auth/AccessDenied';
import {
  Users,
  UserPlus,
  User,
  Mail,
  Building2,
  Shield,
  Search,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  ChevronRight,
  UserCheck,
  X,
  ArrowRight,
  Check,
  Sparkles,
  Trash2,
} from 'lucide-react';

const ROLE_PRESETS = [
  {
    key: 'SUPER_ADMIN' as const,
    name: 'Super Admin',
    tier: 5,
    tag: 'Full Access',
    color: 'text-purple-600 dark:text-purple-400 border-purple-200 dark:border-purple-800 bg-purple-50/70 dark:bg-purple-950/40',
    description: 'System settings, roles & full bypass',
  },
  {
    key: 'ADMIN' as const,
    name: 'Admin',
    tier: 4,
    tag: 'Projects & Tasks',
    color: 'text-blue-600 dark:text-blue-400 border-blue-200 dark:border-blue-800 bg-blue-50/70 dark:bg-blue-950/40',
    description: 'All project, ticket & sprint admin',
  },
  {
    key: 'MANAGER' as const,
    name: 'Manager',
    tier: 3,
    tag: 'Lead & Workflows',
    color: 'text-emerald-600 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800 bg-emerald-50/70 dark:bg-emerald-950/40',
    description: 'Project lead, reports & automation',
  },
  {
    key: 'TEAM_LEAD' as const,
    name: 'Team Lead',
    tier: 2,
    tag: 'Sprint Lead',
    color: 'text-amber-600 dark:text-amber-400 border-amber-200 dark:border-amber-800 bg-amber-50/70 dark:bg-amber-950/40',
    description: 'Sprint planning & task review',
  },
  {
    key: 'EMPLOYEE' as const,
    name: 'Employee',
    tier: 1,
    tag: 'Standard Member',
    color: 'text-slate-600 dark:text-slate-400 border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/40',
    description: 'Kanban tasks & ITSM portal requests',
  },
];

export default function UserManagementPage() {
  const queryClient = useQueryClient();
  const router = useRouter();
  const { canAccessSettings, isLoading: isAccessLoading } = useModuleAccess();

  // Modal State
  const [isAddUserOpen, setIsAddUserOpen] = useState(false);

  // Form State
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [designation, setDesignation] = useState('');
  const [role, setRole] = useState<'SUPER_ADMIN' | 'ADMIN' | 'MANAGER' | 'TEAM_LEAD' | 'EMPLOYEE'>('EMPLOYEE');
  const [userType, setUserType] = useState<'INTERNAL_EMPLOYEE' | 'EXTERNAL_GUEST'>('INTERNAL_EMPLOYEE');
  const [selectedTeamId, setSelectedTeamId] = useState('');
  const [sendInviteEmail, setSendInviteEmail] = useState(true);

  // Reset Password Modal State
  const [resetPasswordUser, setResetPasswordUser] = useState<UserPersona | null>(null);
  const [resetPasswordValue, setResetPasswordValue] = useState('');

  // Filter State
  const [searchQuery, setSearchQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState('ALL');
  const [statusFilter, setStatusFilter] = useState('ALL');

  // Feedback State
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Close modal on Escape
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape' && isAddUserOpen) {
        setIsAddUserOpen(false);
      }
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isAddUserOpen]);

  // Queries
  const { data: usersList = [], isLoading: isLoadingUsers, refetch: refetchUsers } = useQuery({
    queryKey: ['availableUsers'],
    queryFn: fetchAvailableUsers,
  });

  const { data: currentUser } = useQuery({
    queryKey: ['currentUser'],
    queryFn: fetchCurrentUser,
  });

  const { data: teams = [] } = useQuery({
    queryKey: ['teams'],
    queryFn: fetchTeams,
    enabled: isAddUserOpen,
  });

  // Create User Mutation
  const createUserMutation = useMutation({
    mutationFn: (payload: CreateUserPayload) => createUser(payload),
    onSuccess: (newUser) => {
      setFeedback({
        type: 'success',
        message: `User account for "${newUser.fullName}" was created successfully.`,
      });
      // Reset form
      setFullName('');
      setEmail('');
      setPassword('');
      setDesignation('');
      setRole('EMPLOYEE');
      setUserType('INTERNAL_EMPLOYEE');
      setSelectedTeamId('');
      setIsAddUserOpen(false);
      queryClient.invalidateQueries({ queryKey: ['availableUsers'] });
      queryClient.invalidateQueries({ queryKey: ['mailRecipients'] });
      window.scrollTo({ top: 0, behavior: 'smooth' });
    },
    onError: (err: any) => {
      setFeedback({
        type: 'error',
        message: err.message || 'Failed to create user account.',
      });
    },
  });

  // Update User Mutation (Status, Role, Designation & Password Reset)
  const updateUserMutation = useMutation({
    mutationFn: ({
      id,
      status,
      role: nextRole,
      designation: nextDesignation,
      password: nextPassword,
    }: {
      id: string;
      status?: 'ACTIVE' | 'INACTIVE';
      role?: 'SUPER_ADMIN' | 'ADMIN' | 'MANAGER' | 'TEAM_LEAD' | 'EMPLOYEE';
      designation?: string | null;
      password?: string;
    }) => updateUser(id, { status, role: nextRole, designation: nextDesignation, password: nextPassword }),
    onSuccess: (updated) => {
      setFeedback({
        type: 'success',
        message: `Account for ${updated.email} updated (${updated.roleName || 'Employee'} · ${updated.status}).`,
      });
      setResetPasswordUser(null);
      setResetPasswordValue('');
      queryClient.invalidateQueries({ queryKey: ['availableUsers'] });
      queryClient.invalidateQueries({ queryKey: ['teams'] });
      queryClient.invalidateQueries({ queryKey: ['currentUser'] });
    },
    onError: (err: any) => {
      setFeedback({
        type: 'error',
        message: err.message || 'Failed to update user account.',
      });
    },
  });

  // Delete User Mutation
  const deleteUserMutation = useMutation({
    mutationFn: (id: string) => deleteUser(id),
    onSuccess: () => {
      setFeedback({
        type: 'success',
        message: 'User account permanently deleted.',
      });
      queryClient.invalidateQueries({ queryKey: ['availableUsers'] });
      queryClient.invalidateQueries({ queryKey: ['teams'] });
      queryClient.invalidateQueries({ queryKey: ['mailRecipients'] });
    },
    onError: (err: any) => {
      setFeedback({
        type: 'error',
        message: err.message || 'Failed to delete user.',
      });
    },
  });

  // Switch User Session Mutation -> redirect to switched user's dashboard
  const switchUserMutation = useMutation({
    mutationFn: (userEmail: string) => switchUser(userEmail),
    onSuccess: () => {
      queryClient.invalidateQueries();
      router.push('/dashboard');
    },
  });

  // Handle Create User Submit
  const handleCreateUser = (e: React.FormEvent) => {
    e.preventDefault();
    setFeedback(null);

    if (!fullName.trim()) {
      setFeedback({ type: 'error', message: 'Full Name is required.' });
      return;
    }
    if (!email.trim() || !email.includes('@')) {
      setFeedback({ type: 'error', message: 'A valid work email address is required.' });
      return;
    }
    if (
      password.length < 8 ||
      !/[A-Z]/.test(password) ||
      !/[a-z]/.test(password) ||
      !/[0-9]/.test(password)
    ) {
      setFeedback({
        type: 'error',
        message: 'Initial password must be 8+ characters with an uppercase letter, lowercase letter, and number.',
      });
      return;
    }

    createUserMutation.mutate({
      fullName: fullName.trim(),
      email: email.trim().toLowerCase(),
      password,
      designation: designation.trim() || undefined,
      role,
      userType,
      teamId: selectedTeamId || undefined,
      sendInviteEmail,
    });
  };

  // Filtered Users
  const filteredUsers = usersList.filter((u) => {
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const matchName = u.fullName?.toLowerCase().includes(q);
      const matchEmail = u.email?.toLowerCase().includes(q);
      if (!matchName && !matchEmail) return false;
    }
    if (roleFilter !== 'ALL') {
      const tierMap: Record<string, number> = {
        SUPER_ADMIN: 5,
        ADMIN: 4,
        MANAGER: 3,
        TEAM_LEAD: 2,
        EMPLOYEE: 1,
      };
      if (u.roleTier !== tierMap[roleFilter]) return false;
    }
    if (statusFilter !== 'ALL') {
      if ((u.status || 'ACTIVE') !== statusFilter) return false;
    }
    return true;
  });

  // Dynamic Avatar Initials for live preview
  const previewInitials = fullName.trim()
    ? fullName
      .trim()
      .split(' ')
      .map((n) => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2)
    : 'U';

  const selectedPreset = ROLE_PRESETS.find((r) => r.key === role) || ROLE_PRESETS[4];

  // Metrics
  const totalUsers = usersList.length;
  const activeCount = usersList.filter((u) => (u.status || 'ACTIVE') === 'ACTIVE').length;
  const internalCount = usersList.filter((u) => u.userType === 'INTERNAL_EMPLOYEE').length;
  const externalCount = usersList.filter((u) => u.userType === 'EXTERNAL_GUEST').length;

  if (isAccessLoading) {
    return (
      <div className="flex-1 flex items-center justify-center h-full bg-[#F5F6F8] dark:bg-[#111318]">
        <div className="text-xs text-slate-400 font-medium animate-pulse">Verifying access privileges...</div>
      </div>
    );
  }

  if (!canAccessSettings()) {
    return <AccessDenied module="User Directory & Management" requiredRole="Super Admin" />;
  }

  return (
    <div className="flex-1 flex flex-col h-full bg-[#F5F6F8] dark:bg-[#111318] overflow-y-auto">
      {/* ── TOP HEADER BANNER ── */}
      <div className="border-b border-slate-200/80 dark:border-slate-800/80 bg-white dark:bg-slate-900 px-6 py-5 transition-colors">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 max-w-7xl mx-auto">
          <div>
            <div className="flex items-center gap-2 text-xs text-slate-400 dark:text-slate-500 font-medium mb-1">
              <span>Settings</span>
              <ChevronRight className="h-3.5 w-3.5" />
              <span>Organization</span>
              <ChevronRight className="h-3.5 w-3.5" />
              <span className="text-slate-900 dark:text-slate-200 font-semibold">Users Directory</span>
            </div>
            <div className="flex items-center gap-3">
              <h1 className="text-xl md:text-2xl font-bold text-slate-900 dark:text-slate-100 tracking-tight">
                Users & Provisioning
              </h1>
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-purple-50 dark:bg-purple-950/80 text-purple-700 dark:text-purple-300 border border-purple-200 dark:border-purple-800">
                <Shield className="h-3 w-3" />
                <span>Super Admin</span>
              </span>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Manage organization members, assign capability tiers, and provision new accounts.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={() => {
                setFeedback(null);
                setIsAddUserOpen(true);
              }}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-semibold text-xs shadow-sm hover:shadow transition active:scale-95 cursor-pointer"
            >
              <UserPlus className="h-4 w-4" />
              <span>Add User</span>
            </button>
          </div>
        </div>
      </div>

      {/* ── MAIN CONTENT CONTAINER ── */}
      <div className="p-6 max-w-7xl mx-auto w-full space-y-6">
        {/* Feedback Alert */}
        {feedback && (
          <div
            className={`p-3.5 rounded-xl border flex items-start justify-between gap-3 text-xs animate-in fade-in transition ${feedback.type === 'success'
                ? 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-200'
                : 'bg-rose-50 dark:bg-rose-950/40 border-rose-200 dark:border-rose-800 text-rose-800 dark:text-rose-200'
              }`}
          >
            <div className="flex items-center gap-2.5">
              {feedback.type === 'success' ? (
                <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
              ) : (
                <AlertCircle className="h-4 w-4 shrink-0 text-rose-600 dark:text-rose-400" />
              )}
              <span className="font-medium">{feedback.message}</span>
            </div>
            <button
              onClick={() => setFeedback(null)}
              className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer"
            >
              &times;
            </button>
          </div>
        )}

        {/* 1. AGGREGATE STATS CARDS */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-2xl p-4 shadow-2xs">
            <div className="flex items-center justify-between text-slate-400 mb-1.5">
              <span className="text-[11px] font-bold uppercase tracking-wider">Total Users</span>
              <Users className="h-4 w-4 text-blue-500" />
            </div>
            <div className="text-2xl font-bold text-slate-900 dark:text-slate-100">{totalUsers}</div>
            <div className="text-[11px] text-slate-400 mt-0.5">{activeCount} active accounts</div>
          </div>

          <div className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-2xl p-4 shadow-2xs">
            <div className="flex items-center justify-between text-slate-400 mb-1.5">
              <span className="text-[11px] font-bold uppercase tracking-wider">Internal Employees</span>
              <Building2 className="h-4 w-4 text-emerald-500" />
            </div>
            <div className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">{internalCount}</div>
            <div className="text-[11px] text-slate-400 mt-0.5">Faculty & engineers</div>
          </div>

          <div className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-2xl p-4 shadow-2xs">
            <div className="flex items-center justify-between text-slate-400 mb-1.5">
              <span className="text-[11px] font-bold uppercase tracking-wider">External Guests</span>
              <UserCheck className="h-4 w-4 text-amber-500" />
            </div>
            <div className="text-2xl font-bold text-slate-900 dark:text-slate-100">{externalCount}</div>
            <div className="text-[11px] text-slate-400 mt-0.5">Contractors & reviewers</div>
          </div>

          <div className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-2xl p-4 shadow-2xs">
            <div className="flex items-center justify-between text-slate-400 mb-1.5">
              <span className="text-[11px] font-bold uppercase tracking-wider">Logged In As</span>
              <Shield className="h-4 w-4 text-purple-500" />
            </div>
            <div className="text-sm font-bold text-slate-900 dark:text-slate-100 truncate">
              {currentUser?.fullName || 'Super Admin'}
            </div>
            <div className="text-[11px] text-purple-600 dark:text-purple-400 font-medium truncate mt-0.5">
              {currentUser?.email || 'admin@coretrack.internal'}
            </div>
          </div>
        </div>

        {/* 2. USER DIRECTORY TABLE */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-2xl p-6 shadow-2xs space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                Directory Directory ({filteredUsers.length} of {totalUsers})
              </h3>
              <p className="text-xs text-slate-400">
                Search, inspect roles, and manage access statuses across all accounts.
              </p>
            </div>

            {/* Filter Bar */}
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative">
                <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-slate-400" />
                <input
                  type="text"
                  placeholder="Search by name or email..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-8 pr-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/50 text-xs text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500 w-48 sm:w-60"
                />
              </div>

              <select
                value={roleFilter}
                onChange={(e) => setRoleFilter(e.target.value)}
                className="px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/50 text-xs text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="ALL">All Roles</option>
                <option value="SUPER_ADMIN">Super Admin (Tier 5)</option>
                <option value="ADMIN">Admin (Tier 4)</option>
                <option value="MANAGER">Manager (Tier 3)</option>
                <option value="TEAM_LEAD">Team Lead (Tier 2)</option>
                <option value="EMPLOYEE">Employee (Tier 1)</option>
              </select>

              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/50 text-xs text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="ALL">All Statuses</option>
                <option value="ACTIVE">Active</option>
                <option value="INACTIVE">Inactive</option>
              </select>

              <button
                onClick={() => refetchUsers()}
                className="p-2 rounded-xl border border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-500 hover:text-slate-900 dark:hover:text-slate-100 transition cursor-pointer"
                title="Refresh directory"
              >
                <RefreshCw className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>

          {/* Table */}
          <div className="border border-slate-200/80 dark:border-slate-800 rounded-xl overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-slate-200/80 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/50 text-slate-500 font-bold uppercase text-[10px] tracking-wider">
                  <th className="py-3 px-4">User</th>
                  <th className="py-3 px-4">Designation</th>
                  <th className="py-3 px-4">Role & Tier</th>
                  <th className="py-3 px-4">Type</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4">Provisioned</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">
                {isLoadingUsers ? (
                  <tr>
                    <td colSpan={7} className="text-center py-8 text-slate-400">
                      <RefreshCw className="h-5 w-5 animate-spin mx-auto mb-2 text-blue-600" />
                      Loading user accounts...
                    </td>
                  </tr>
                ) : filteredUsers.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="text-center py-8 text-slate-400">
                      <div className="max-w-xs mx-auto space-y-2">
                        <Users className="h-8 w-8 text-slate-300 dark:text-slate-700 mx-auto" />
                        <div className="font-semibold text-slate-700 dark:text-slate-300">No users found</div>
                        <p className="text-[11px] text-slate-400">
                          Try adjusting your filters or click below to add a new team member.
                        </p>
                        <button
                          onClick={() => setIsAddUserOpen(true)}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-600 text-white font-semibold text-xs shadow-2xs"
                        >
                          <UserPlus className="h-3.5 w-3.5" />
                          <span>Add User</span>
                        </button>
                      </div>
                    </td>
                  </tr>
                ) : (
                  filteredUsers.map((u) => {
                    const initials = u.fullName
                      ? u.fullName
                        .split(' ')
                        .map((n) => n[0])
                        .join('')
                        .toUpperCase()
                        .slice(0, 2)
                      : 'U';
                    const isSelf = currentUser?.email === u.email;
                    const isActive = (u.status || 'ACTIVE') === 'ACTIVE';

                    return (
                      <tr key={u.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/40 transition">
                        {/* User Identity */}
                        <td className="py-3 px-4">
                          <div className="flex items-center gap-3">
                            <div className="h-8 w-8 rounded-full bg-blue-600 text-white font-bold text-xs flex items-center justify-center shrink-0">
                              {initials}
                            </div>
                            <div className="min-w-0">
                              <div className="font-semibold text-slate-900 dark:text-slate-100 truncate flex items-center gap-1.5">
                                <span>{u.fullName}</span>
                                {isSelf && (
                                  <span className="text-[9px] font-bold bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300 px-1.5 py-0.2 rounded">
                                    You
                                  </span>
                                )}
                              </div>
                              <div className="text-[11px] text-slate-400 font-mono truncate">{u.email}</div>
                            </div>
                          </div>
                        </td>

                        {/* Designation (Editable Text Input) */}
                        <td className="py-3 px-4">
                          <input
                            type="text"
                            key={`${u.id}-${u.designation || ''}`}
                            defaultValue={u.designation || ''}
                            placeholder="e.g. Developer"
                            onBlur={(e) => {
                              const val = e.target.value.trim();
                              if (val !== (u.designation || '')) {
                                updateUserMutation.mutate({
                                  id: u.id,
                                  designation: val || null,
                                });
                              }
                            }}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                (e.target as HTMLInputElement).blur();
                              }
                            }}
                            className="w-32 px-2.5 py-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-[11px] text-slate-800 dark:text-slate-200 placeholder-slate-400 focus:outline-none focus:border-blue-600"
                          />
                        </td>

                        {/* Role & Tier (Editable) */}
                        <td className="py-3 px-4">
                          {(() => {
                            const currentRoleKey =
                              u.roleTier === 5
                                ? 'SUPER_ADMIN'
                                : u.roleTier === 4
                                  ? 'ADMIN'
                                  : u.roleTier === 3
                                    ? 'MANAGER'
                                    : u.roleTier === 2
                                      ? 'TEAM_LEAD'
                                      : 'EMPLOYEE';
                            return (
                              <select
                                value={currentRoleKey}
                                disabled={updateUserMutation.isPending}
                                onChange={(e) =>
                                  updateUserMutation.mutate({
                                    id: u.id,
                                    role: e.target.value as
                                      | 'SUPER_ADMIN'
                                      | 'ADMIN'
                                      | 'MANAGER'
                                      | 'TEAM_LEAD'
                                      | 'EMPLOYEE',
                                  })
                                }
                                className="px-2.5 py-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-[11px] font-semibold text-slate-800 dark:text-slate-200 focus:outline-none focus:border-blue-600 cursor-pointer disabled:opacity-50"
                              >
                                <option value="SUPER_ADMIN">Super Admin (Tier 5)</option>
                                <option value="ADMIN">Admin (Tier 4)</option>
                                <option value="MANAGER">Manager (Tier 3)</option>
                                <option value="TEAM_LEAD">Team Lead (Tier 2)</option>
                                <option value="EMPLOYEE">Employee (Tier 1)</option>
                              </select>
                            );
                          })()}
                        </td>

                        {/* Account Type */}
                        <td className="py-3 px-4">
                          <span className="text-[11px] text-slate-600 dark:text-slate-400">
                            {u.userType === 'INTERNAL_EMPLOYEE' ? 'Internal' : 'External'}
                          </span>
                        </td>

                        {/* Status */}
                        <td className="py-3 px-4">
                          <span
                            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold ${isActive
                                ? 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-900/50'
                                : 'bg-slate-100 dark:bg-slate-800 text-slate-500 border border-slate-200 dark:border-slate-700'
                              }`}
                          >
                            <span className={`h-1.5 w-1.5 rounded-full ${isActive ? 'bg-emerald-500' : 'bg-slate-400'}`}></span>
                            {isActive ? 'ACTIVE' : 'INACTIVE'}
                          </span>
                        </td>

                        {/* Provisioned */}
                        <td className="py-3 px-4 text-slate-400 text-[11px]">
                          {u.createdAt
                            ? new Date(u.createdAt).toLocaleDateString([], {
                              month: 'short',
                              day: 'numeric',
                              year: 'numeric',
                            })
                            : 'Standard'}
                        </td>

                        {/* Actions */}
                        <td className="py-3 px-4 text-right">
                          <div className="flex items-center justify-end gap-2">
                            {!isSelf && (
                              <button
                                onClick={() => switchUserMutation.mutate(u.email)}
                                disabled={switchUserMutation.isPending}
                                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-[11px] font-semibold text-slate-600 dark:text-slate-300 transition cursor-pointer"
                                title={`Switch session to test ${u.fullName}'s view`}
                              >
                                <ArrowRight className="h-3 w-3" />
                                <span>Switch</span>
                              </button>
                            )}

                            <button
                              type="button"
                              onClick={() => {
                                setResetPasswordUser(u);
                                setResetPasswordValue('');
                              }}
                              className="px-2 py-1 rounded-lg text-[11px] font-semibold text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-950/40 transition cursor-pointer"
                              title={`Set or reset password for ${u.fullName}`}
                            >
                              Password
                            </button>

                            {!isSelf && (
                              <button
                                onClick={() =>
                                  updateUserMutation.mutate({
                                    id: u.id,
                                    status: isActive ? 'INACTIVE' : 'ACTIVE',
                                  })
                                }
                                disabled={updateUserMutation.isPending}
                                className={`px-2 py-1 rounded-lg text-[11px] font-semibold transition cursor-pointer ${isActive
                                    ? 'text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-950/40'
                                    : 'text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-950/40'
                                  }`}
                              >
                                {isActive ? 'Deactivate' : 'Activate'}
                              </button>
                            )}

                            {!isSelf && (
                              <button
                                onClick={() => {
                                  if (confirm(`Permanently delete user "${u.fullName}" (${u.email})? This cannot be undone.`)) {
                                    deleteUserMutation.mutate(u.id);
                                  }
                                }}
                                disabled={deleteUserMutation.isPending}
                                className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-semibold text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition cursor-pointer disabled:opacity-40"
                                title={`Delete ${u.fullName}`}
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                                <span>Delete</span>
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* ── REDESIGNED SIMPLE, MINIMAL, USER-FRIENDLY & ATTRACTIVE MODAL ── */}
      {isAddUserOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-xs animate-in fade-in duration-150">
          <div
            className="w-full max-w-lg bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-2xl overflow-hidden animate-in zoom-in-95 duration-150"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="flex items-center justify-between px-6 pt-6 pb-4 border-b border-slate-100 dark:border-slate-800/80">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-xl bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 flex items-center justify-center shrink-0">
                  <UserPlus className="h-5 w-5" />
                </div>
                <div>
                  <h2 className="text-base font-bold text-slate-900 dark:text-slate-100 leading-snug">
                    Add New User
                  </h2>
                  <p className="text-xs text-slate-400">
                    Invite a team member and assign organizational access
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setIsAddUserOpen(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition cursor-pointer"
                title="Close"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Live Interactive Preview Pill */}
            <div className="px-6 pt-4">
              <div className="flex items-center justify-between p-3 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-800 text-xs">
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="h-8 w-8 rounded-full bg-blue-600 text-white font-bold text-xs flex items-center justify-center shrink-0 shadow-2xs">
                    {previewInitials}
                  </div>
                  <div className="min-w-0">
                    <div className="font-bold text-slate-900 dark:text-slate-100 truncate">
                      {fullName.trim() || 'New User'}
                    </div>
                    <div className="text-[11px] text-slate-400 truncate font-mono">
                      {email.trim() || 'email@company.com'}
                    </div>
                  </div>
                </div>

                <div className={`px-2 py-0.5 rounded-full text-[10px] font-bold border shrink-0 ${selectedPreset.color}`}>
                  {selectedPreset.name} &bull; Tier {selectedPreset.tier}
                </div>
              </div>
            </div>

            {/* Modal Form */}
            <form onSubmit={handleCreateUser} className="p-6 space-y-4">
              {/* Full Name & Email Inputs */}
              <div className="space-y-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Full Name <span className="text-rose-500">*</span>
                  </label>
                  <div className="relative">
                    <User className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                    <input
                      type="text"
                      placeholder="e.g. Dr. Rajesh Kumar"
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                      required
                      autoFocus
                      className="w-full pl-9 pr-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-xs text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 transition"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Designation <span className="text-slate-400 font-normal">(Optional)</span>
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Developer, Designer, Marketing"
                    value={designation}
                    onChange={(e) => setDesignation(e.target.value)}
                    className="w-full px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-xs text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 transition"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Work Email <span className="text-rose-500">*</span>
                  </label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                    <input
                      type="email"
                      placeholder="e.g. rajesh@amrita.edu"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      required
                      className="w-full pl-9 pr-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-xs text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 transition"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Initial Password <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="password"
                    placeholder="8+ chars, uppercase, lowercase, number"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    className="w-full px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-xs text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 transition"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Designation <span className="text-slate-400 font-normal">(Optional)</span>
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Developer, Designer, Marketing"
                    value={designation}
                    onChange={(e) => setDesignation(e.target.value)}
                    className="w-full px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-xs text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 transition"
                  />
                </div>
              </div>

              {/* Role Selection (Minimal Segmented Pill Grid) */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                    Workspace Role <span className="text-rose-500">*</span>
                  </label>
                  <span className="text-[11px] text-slate-400">
                    {selectedPreset.description}
                  </span>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {ROLE_PRESETS.map((preset) => {
                    const isSelected = role === preset.key;
                    return (
                      <button
                        key={preset.key}
                        type="button"
                        onClick={() => setRole(preset.key)}
                        className={`flex items-center justify-between px-3 py-2 rounded-xl border text-left transition cursor-pointer select-none ${isSelected
                            ? 'border-blue-600 bg-blue-50/70 dark:bg-blue-950/60 text-blue-900 dark:text-blue-100 font-bold shadow-2xs'
                            : 'border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700 bg-slate-50/50 dark:bg-slate-800/30 text-slate-600 dark:text-slate-400'
                          }`}
                      >
                        <div className="truncate">
                          <div className="text-xs truncate">{preset.name}</div>
                          <div className="text-[9px] text-slate-400 font-medium">Tier {preset.tier}</div>
                        </div>
                        {isSelected ? (
                          <div className="h-4 w-4 rounded-full bg-blue-600 text-white flex items-center justify-center shrink-0 ml-1">
                            <Check className="h-2.5 w-2.5" />
                          </div>
                        ) : (
                          <div className="h-4 w-4 rounded-full border border-slate-300 dark:border-slate-700 shrink-0 ml-1" />
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Optional Team Allocation & Account Type */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Assign Team (Optional)
                  </label>
                  <div className="relative">
                    {/* <Building2 className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" /> */}
                    <select
                      value={selectedTeamId}
                      onChange={(e) => setSelectedTeamId(e.target.value)}
                      className="w-full pl-9 pr-3 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-xs text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="">No team assigned</option>
                      {teams.map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.name} ({t.keyPrefix})
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Employment Type
                  </label>
                  <select
                    value={userType}
                    onChange={(e) => setUserType(e.target.value as any)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-xs text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="INTERNAL_EMPLOYEE">Internal Employee</option>
                    <option value="EXTERNAL_GUEST">External Guest / Contractor</option>
                  </select>
                </div>
              </div>

              {/* Send Invitation Email Checkbox */}
              <div className="pt-2">
                <label className="flex items-center gap-2.5 text-xs text-slate-600 dark:text-slate-400 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={sendInviteEmail}
                    onChange={(e) => setSendInviteEmail(e.target.checked)}
                    className="h-4 w-4 rounded text-blue-600 focus:ring-blue-500 cursor-pointer"
                  />
                  <span>Send welcome invitation email with login link</span>
                </label>
              </div>

              {/* Modal Footer Actions */}
              <div className="flex items-center justify-end gap-2.5 pt-4 border-t border-slate-100 dark:border-slate-800/80">
                <button
                  type="button"
                  onClick={() => setIsAddUserOpen(false)}
                  className="px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition cursor-pointer"
                >
                  Cancel
                </button>

                <button
                  type="submit"
                  disabled={createUserMutation.isPending}
                  className="inline-flex items-center gap-2 px-5 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-semibold text-xs shadow-sm transition active:scale-95 cursor-pointer"
                >
                  {createUserMutation.isPending ? (
                    <>
                      <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                      <span>Creating...</span>
                    </>
                  ) : (
                    <>
                      <Check className="h-3.5 w-3.5" />
                      <span>Add User</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      {/* RESET USER PASSWORD MODAL */}
      {resetPasswordUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-xs">
          <div className="w-full max-w-sm rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-2xl p-6 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                  Set / Reset Password
                </h3>
                <p className="text-[11px] text-slate-400 truncate">{resetPasswordUser.email}</p>
              </div>
              <button
                type="button"
                onClick={() => setResetPasswordUser(null)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 cursor-pointer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (
                  resetPasswordValue.length < 8 ||
                  !/[A-Z]/.test(resetPasswordValue) ||
                  !/[a-z]/.test(resetPasswordValue) ||
                  !/[0-9]/.test(resetPasswordValue)
                ) {
                  setFeedback({
                    type: 'error',
                    message: 'Password must be 8+ characters with an uppercase letter, lowercase letter, and number.',
                  });
                  return;
                }
                updateUserMutation.mutate({
                  id: resetPasswordUser.id,
                  password: resetPasswordValue,
                });
              }}
              className="space-y-3"
            >
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  New Password
                </label>
                <input
                  type="password"
                  required
                  autoFocus
                  value={resetPasswordValue}
                  onChange={(e) => setResetPasswordValue(e.target.value)}
                  placeholder="8+ chars, uppercase, lowercase, number"
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs text-slate-900 dark:text-slate-100"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setResetPasswordUser(null)}
                  className="px-3 py-1.5 rounded-xl text-xs font-semibold text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={updateUserMutation.isPending}
                  className="px-4 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold cursor-pointer disabled:opacity-50"
                >
                  {updateUserMutation.isPending ? 'Saving...' : 'Save Password'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
