'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useQuery, useMutation } from '@tanstack/react-query';
import {
  fetchMyProfile,
  fetchTicket,
  changeOwnPassword,
  MyProfileResponse,
  Ticket,
} from '../../lib/api';
import { TicketDetailModal } from '../../components/kanban/TicketDetailModal';
import {
  CheckCircle2,
  Clock,
  AlertOctagon,
  ShieldCheck,
  Users,
  FolderGit2,
  KeyRound,
  Eye,
  EyeOff,
  X,
  AlertCircle,
  ArrowUpRight,
} from 'lucide-react';

export default function ProfilePage() {
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [selectedTicket, setSelectedTicket] = useState<Ticket | null>(null);
  const [isChangePwOpen, setIsChangePwOpen] = useState(false);
  const [currentPw, setCurrentPw] = useState('');
  const [newPw, setNewPw] = useState('');
  const [confirmPw, setConfirmPw] = useState('');
  const [showCurrentPw, setShowCurrentPw] = useState(false);
  const [showNewPw, setShowNewPw] = useState(false);
  const [showConfirmPw, setShowConfirmPw] = useState(false);
  const [pwError, setPwError] = useState<string | null>(null);
  const [pwSuccess, setPwSuccess] = useState<string | null>(null);

  const { data: profile, isLoading, isError } = useQuery<MyProfileResponse>({
    queryKey: ['myProfile'],
    queryFn: fetchMyProfile,
  });

  const changePwMutation = useMutation({
    mutationFn: () => changeOwnPassword(currentPw, newPw),
    onSuccess: (res) => {
      setPwError(null);
      setPwSuccess(res.message || 'Password updated.');
      setCurrentPw('');
      setNewPw('');
      setConfirmPw('');
      setTimeout(() => {
        setIsChangePwOpen(false);
        setPwSuccess(null);
      }, 1500);
    },
    onError: (err: Error) => {
      setPwSuccess(null);
      setPwError(err.message || 'Failed to update password.');
    },
  });

  const handleOpenTask = async (ticketKey: string) => {
    try {
      const full = await fetchTicket(ticketKey);
      setSelectedTicket(full);
    } catch {
      // ignore
    }
  };

  const handleChangePwSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setPwError(null);
    if (
      newPw.length < 8 ||
      !/[A-Z]/.test(newPw) ||
      !/[a-z]/.test(newPw) ||
      !/[0-9]/.test(newPw)
    ) {
      setPwError('New password must be 8+ characters with uppercase, lowercase, and a number.');
      return;
    }
    if (newPw !== confirmPw) {
      setPwError('New passwords do not match.');
      return;
    }
    changePwMutation.mutate();
  };

  if (isLoading) {
    return (
      <div className="p-8 text-center text-xs text-slate-400">Loading your profile...</div>
    );
  }

  if (isError || !profile) {
    return (
      <div className="p-8 text-center text-xs text-rose-500">
        Unable to load profile information.
      </div>
    );
  }

  const { user, teams, projects, stats, tasks } = profile;
  const initials = user.fullName
    .split(' ')
    .map((p) => p[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);

  const filteredTasks = tasks.filter((t) =>
    statusFilter === 'ALL' ? true : t.status.toUpperCase() === statusFilter
  );

  return (
    <div className="max-w-6xl mx-auto w-full space-y-6 pb-10">
      {/* Header Card */}
      <div className="rounded-2xl border border-slate-200/80 dark:border-slate-800/80 bg-white dark:bg-slate-900 p-6 shadow-2xs flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-4 min-w-0">
          <div className="h-14 w-14 rounded-2xl bg-blue-600 text-white font-bold text-lg flex items-center justify-center shrink-0 shadow-sm">
            {initials || 'U'}
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100 truncate">
                {user.fullName}
              </h1>
              <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-blue-50 text-blue-700 border border-blue-200 dark:bg-blue-950/60 dark:text-blue-300 dark:border-blue-800">
                {user.roleName}
              </span>
              <span
                className={`px-2 py-0.5 rounded-full text-[11px] font-semibold border ${
                  user.status === 'ACTIVE'
                    ? 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/60 dark:text-emerald-300 dark:border-emerald-800'
                    : 'bg-slate-100 text-slate-600 border-slate-200'
                }`}
              >
                {user.status}
              </span>
            </div>
            <p className="text-xs font-mono text-slate-500 dark:text-slate-400 mt-1">
              {user.email}
              {user.designation ? ` · ${user.designation}` : ''}
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={() => {
            setPwError(null);
            setPwSuccess(null);
            setIsChangePwOpen(true);
          }}
          className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-200 transition cursor-pointer"
        >
          <KeyRound className="h-3.5 w-3.5 text-blue-600 dark:text-blue-400" />
          <span>Change Password</span>
        </button>
      </div>

      {/* Live Status KPI Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
          <div className="flex items-center justify-between text-xs text-slate-500">
            <span>Assigned Tasks</span>
            <Clock className="h-4 w-4 text-blue-500" />
          </div>
          <div className="text-2xl font-extrabold text-slate-900 dark:text-slate-100 mt-1">
            {stats.totalAssigned}
          </div>
          <div className="text-[11px] text-slate-400 mt-0.5">
            {stats.inProgress} in progress · {stats.inReview} in review
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
          <div className="flex items-center justify-between text-xs text-slate-500">
            <span>Completed</span>
            <CheckCircle2 className="h-4 w-4 text-emerald-500" />
          </div>
          <div className="text-2xl font-extrabold text-emerald-600 dark:text-emerald-400 mt-1">
            {stats.completed}
          </div>
          <div className="text-[11px] text-slate-400 mt-0.5">
            {stats.storyPointsTotal} total story pts
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
          <div className="flex items-center justify-between text-xs text-slate-500">
            <span>Overdue &amp; Blocked</span>
            <AlertOctagon className="h-4 w-4 text-rose-500" />
          </div>
          <div className="text-2xl font-extrabold text-rose-600 dark:text-rose-400 mt-1">
            {stats.overdue + stats.blocked}
          </div>
          <div className="text-[11px] text-slate-400 mt-0.5">
            {stats.overdue} overdue · {stats.blocked} blocked
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
          <div className="flex items-center justify-between text-xs text-slate-500">
            <span>SLA Compliance</span>
            <ShieldCheck className="h-4 w-4 text-indigo-500" />
          </div>
          <div className="text-2xl font-extrabold text-indigo-600 dark:text-indigo-400 mt-1">
            {stats.slaComplianceRate}%
          </div>
          <div className="text-[11px] text-slate-400 mt-0.5">
            {stats.pendingApproval} pending approval
          </div>
        </div>
      </div>

      {/* Teams & Projects Row */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 space-y-3">
          <h2 className="text-sm font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
            <Users className="h-4 w-4 text-blue-500" />
            <span>My Teams ({teams.length})</span>
          </h2>
          {teams.length === 0 ? (
            <p className="text-xs text-slate-400 italic">Not assigned to any team yet.</p>
          ) : (
            <div className="space-y-2">
              {teams.map((t) => (
                <div
                  key={t.id}
                  className="flex items-center justify-between p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-800 text-xs"
                >
                  <span className="font-semibold text-slate-800 dark:text-slate-200">
                    {t.name} <span className="font-mono text-[10px] text-slate-400">({t.keyPrefix})</span>
                  </span>
                  <span
                    className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                      t.role === 'LEAD'
                        ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300'
                        : 'bg-slate-200/80 text-slate-700 dark:bg-slate-700 dark:text-slate-300'
                    }`}
                  >
                    {t.role}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 space-y-3">
          <h2 className="text-sm font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
            <FolderGit2 className="h-4 w-4 text-emerald-500" />
            <span>My Projects ({projects.length})</span>
          </h2>
          {projects.length === 0 ? (
            <p className="text-xs text-slate-400 italic">Not assigned to any project yet.</p>
          ) : (
            <div className="space-y-2">
              {projects.map((p) => (
                <Link
                  key={p.id}
                  href={`/projects/${p.key}`}
                  className="flex items-center justify-between p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-800 hover:border-blue-400 text-xs transition"
                >
                  <div className="min-w-0">
                    <span className="font-semibold text-slate-800 dark:text-slate-200 truncate">
                      {p.name}
                    </span>{' '}
                    <span className="font-mono text-[10px] text-slate-400">({p.key})</span>
                  </div>
                  <span className="text-[10px] font-semibold text-blue-600 dark:text-blue-400 shrink-0">
                    {p.relation}
                  </span>
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* My Tasks & Statuses */}
      <div className="rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-bold text-slate-900 dark:text-slate-100">
              My Tasks &amp; Statuses
            </h2>
            <p className="text-xs text-slate-400">Click any task to view or update its status</p>
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            {['ALL', 'TODO', 'IN_PROGRESS', 'IN_REVIEW', 'PENDING_APPROVAL', 'BLOCKED', 'DONE'].map(
              (st) => (
                <button
                  key={st}
                  type="button"
                  onClick={() => setStatusFilter(st)}
                  className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold transition cursor-pointer ${
                    statusFilter === st
                      ? 'bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900'
                      : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
                  }`}
                >
                  {st.replace('_', ' ')}
                </button>
              )
            )}
          </div>
        </div>

        {filteredTasks.length === 0 ? (
          <div className="p-10 text-center text-xs text-slate-400">
            No tasks match this status filter.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50/70 dark:bg-slate-800/40 border-b border-slate-100 dark:border-slate-800 text-slate-500">
                <tr>
                  <th className="px-5 py-2.5 font-medium">Task</th>
                  <th className="px-5 py-2.5 font-medium">Project</th>
                  <th className="px-5 py-2.5 font-medium">Status</th>
                  <th className="px-5 py-2.5 font-medium">Priority</th>
                  <th className="px-5 py-2.5 font-medium">Due Date</th>
                  <th className="px-5 py-2.5 font-medium text-right">Details</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {filteredTasks.map((t) => (
                  <tr
                    key={t.id}
                    onClick={() => handleOpenTask(t.ticketKey)}
                    className="hover:bg-slate-50/60 dark:hover:bg-slate-800/30 cursor-pointer"
                  >
                    <td className="px-5 py-3">
                      <span className="font-mono text-[11px] font-bold text-blue-600 dark:text-blue-400 mr-2">
                        {t.ticketKey}
                      </span>
                      <span className="font-medium text-slate-800 dark:text-slate-200">
                        {t.title}
                      </span>
                    </td>
                    <td className="px-5 py-3 font-mono text-[11px] text-slate-500">
                      {t.projectKey}
                    </td>
                    <td className="px-5 py-3">
                      <span className="px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-[10px] font-semibold">
                        {t.status.replace('_', ' ')}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-[11px] text-slate-600 dark:text-slate-300">
                      {t.priority}
                    </td>
                    <td className="px-5 py-3 font-mono text-[11px]">
                      {t.dueDate ? (
                        <span className={t.isOverdue ? 'text-rose-600 font-semibold' : 'text-slate-500'}>
                          {new Date(t.dueDate).toLocaleDateString()}
                          {t.isOverdue ? ' (Overdue)' : ''}
                        </span>
                      ) : (
                        <span className="text-slate-400">—</span>
                      )}
                    </td>
                    <td className="px-5 py-3 text-right">
                      <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-blue-600">
                        View <ArrowUpRight className="h-3 w-3" />
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {selectedTicket && (
        <TicketDetailModal ticket={selectedTicket} onClose={() => setSelectedTicket(null)} />
      )}

      {/* Change Password Modal */}
      {isChangePwOpen && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-900/50 backdrop-blur-xs p-4">
          <div className="w-full max-w-sm rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-2xl p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                <KeyRound className="h-4 w-4 text-blue-600" />
                <span>Change Password</span>
              </h3>
              <button
                type="button"
                onClick={() => setIsChangePwOpen(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 cursor-pointer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {pwError && (
              <div className="p-2.5 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 text-xs text-rose-700 dark:text-rose-300 flex items-center gap-2">
                <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                <span>{pwError}</span>
              </div>
            )}

            {pwSuccess && (
              <div className="p-2.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 text-xs text-emerald-700 dark:text-emerald-300 flex items-center gap-2">
                <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
                <span>{pwSuccess}</span>
              </div>
            )}

            <form onSubmit={handleChangePwSubmit} className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Current Password
                </label>
                <div className="relative">
                  <input
                    type={showCurrentPw ? 'text' : 'password'}
                    value={currentPw}
                    onChange={(e) => setCurrentPw(e.target.value)}
                    placeholder="Enter current password"
                    className="w-full pl-3 pr-9 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs text-slate-900 dark:text-slate-100"
                  />
                  <button
                    type="button"
                    onClick={() => setShowCurrentPw((v) => !v)}
                    className="absolute right-2.5 top-2 text-slate-400 hover:text-slate-600 cursor-pointer"
                  >
                    {showCurrentPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  New Password
                </label>
                <div className="relative">
                  <input
                    type={showNewPw ? 'text' : 'password'}
                    required
                    value={newPw}
                    onChange={(e) => setNewPw(e.target.value)}
                    placeholder="8+ chars, upper, lower, number"
                    className="w-full pl-3 pr-9 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs text-slate-900 dark:text-slate-100"
                  />
                  <button
                    type="button"
                    onClick={() => setShowNewPw((v) => !v)}
                    className="absolute right-2.5 top-2 text-slate-400 hover:text-slate-600 cursor-pointer"
                  >
                    {showNewPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Confirm New Password
                </label>
                <div className="relative">
                  <input
                    type={showConfirmPw ? 'text' : 'password'}
                    required
                    value={confirmPw}
                    onChange={(e) => setConfirmPw(e.target.value)}
                    placeholder="Re-enter new password"
                    className="w-full pl-3 pr-9 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs text-slate-900 dark:text-slate-100"
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirmPw((v) => !v)}
                    className="absolute right-2.5 top-2 text-slate-400 hover:text-slate-600 cursor-pointer"
                  >
                    {showConfirmPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsChangePwOpen(false)}
                  className="px-3 py-1.5 rounded-xl text-xs font-semibold text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={changePwMutation.isPending}
                  className="px-4 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold cursor-pointer disabled:opacity-50"
                >
                  {changePwMutation.isPending ? 'Saving...' : 'Update Password'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
