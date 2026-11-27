'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { fetchCurrentUser, logoutUser, changeOwnPassword } from '../../lib/api';
import { useTheme } from '../theme/ThemeProvider';
import { Moon, Sun, ChevronDown, LogOut, KeyRound, X, AlertCircle, CheckCircle2, Eye, EyeOff, User } from 'lucide-react';

export function UserProfileMenu() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [isOpen, setIsOpen] = useState(false);
  const [isChangePwOpen, setIsChangePwOpen] = useState(false);
  const [currentPw, setCurrentPw] = useState('');
  const [newPw, setNewPw] = useState('');
  const [confirmPw, setConfirmPw] = useState('');
  const [showCurrentPw, setShowCurrentPw] = useState(false);
  const [showNewPw, setShowNewPw] = useState(false);
  const [showConfirmPw, setShowConfirmPw] = useState(false);
  const [pwError, setPwError] = useState<string | null>(null);
  const [pwSuccess, setPwSuccess] = useState<string | null>(null);
  const { theme, toggleTheme } = useTheme();

  const { data: currentUser } = useQuery({
    queryKey: ['currentUser'],
    queryFn: fetchCurrentUser,
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

  const getRoleLabel = (u: any) => {
    if (!u) return 'User';
    if (u.roleName) return u.roleName;
    const globalPerms = BigInt(u.globalPermissions || '0');
    if ((globalPerms & 1n) === 1n) return 'Super Admin';
    if (u.email?.includes('admin')) return 'Super Admin';
    if (u.email?.includes('engineer')) return 'Team Lead';
    return 'Employee';
  };

  const initials = currentUser?.fullName
    ? currentUser.fullName
        .split(' ')
        .map((n) => n[0])
        .join('')
        .toUpperCase()
    : 'U';

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

  return (
    <div className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 p-1 pl-1.5 pr-2.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800 shadow-2xs transition cursor-pointer"
      >
        <div className="h-6 w-6 rounded-md bg-blue-600 text-white font-semibold text-xs flex items-center justify-center">
          {initials}
        </div>
        <div className="hidden sm:flex flex-col text-left">
          <span className="text-xs font-semibold text-slate-900 dark:text-slate-100 leading-none">
            {currentUser?.fullName || 'Active User'}
          </span>
          <span className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5 leading-none">
            {getRoleLabel(currentUser)}
          </span>
        </div>
        <ChevronDown className="h-3 w-3 text-slate-400" />
      </button>

      {isOpen && (
        <div className="absolute right-0 mt-2 w-72 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xl z-50 overflow-hidden">
          {/* User Details */}
          <div className="p-3.5 border-b border-slate-100 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/40">
            <div className="flex items-center gap-2.5">
              <div className="h-9 w-9 rounded-lg bg-blue-600 text-white font-bold text-sm flex items-center justify-center">
                {initials}
              </div>
              <div className="min-w-0 flex-1">
                <span className="block text-xs font-bold text-slate-900 dark:text-slate-100 truncate">
                  {currentUser?.fullName || 'User'}
                </span>
                <span className="block text-[11px] text-slate-500 dark:text-slate-400 truncate">
                  {currentUser?.email || 'user@coretrack.internal'}
                </span>
              </div>
            </div>

            <div className="mt-2.5 flex items-center justify-between text-[10px] font-mono text-slate-500 bg-white dark:bg-slate-900 p-1.5 rounded-md border border-slate-200/80 dark:border-slate-800">
              <span>Assigned Role:</span>
              <span className="text-blue-600 dark:text-blue-400 font-semibold font-sans text-[11px]">
                {getRoleLabel(currentUser)}
              </span>
            </div>
          </div>

          {/* Theme & Password */}
          <div className="p-2 border-b border-slate-100 dark:border-slate-800 space-y-1">
            <button
              onClick={toggleTheme}
              className="w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition cursor-pointer"
            >
              <div className="flex items-center gap-2">
                {theme === 'dark' ? (
                  <Moon className="h-3.5 w-3.5 text-blue-400" />
                ) : (
                  <Sun className="h-3.5 w-3.5 text-amber-500" />
                )}
                <span>Theme</span>
              </div>
              <span className="text-[10px] font-mono capitalize px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400">
                {theme}
              </span>
            </button>

            <Link
              href="/profile"
              onClick={() => setIsOpen(false)}
              className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-xs text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
            >
              <User className="h-3.5 w-3.5 text-emerald-500" />
              <span>My Profile &amp; Statuses</span>
            </Link>

            <button
              onClick={() => {
                setIsOpen(false);
                setPwError(null);
                setPwSuccess(null);
                setIsChangePwOpen(true);
              }}
              className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-xs text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition cursor-pointer"
            >
              <KeyRound className="h-3.5 w-3.5 text-blue-500" />
              <span>Change Password</span>
            </button>
          </div>

          {/* Logout Action */}
          <div className="p-2">
            <button
              onClick={async () => {
                await logoutUser();
                queryClient.clear();
                setIsOpen(false);
                router.push('/login');
              }}
              className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-xs font-semibold text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition cursor-pointer"
            >
              <LogOut className="h-3.5 w-3.5" />
              <span>Log out</span>
            </button>
          </div>
        </div>
      )}

      {/* Change Password Modal */}
      {isChangePwOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-xs p-4">
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
                    className="absolute right-2.5 top-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer"
                    title={showCurrentPw ? 'Hide password' : 'View password'}
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
                    className="absolute right-2.5 top-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer"
                    title={showNewPw ? 'Hide password' : 'View password'}
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
                    className="absolute right-2.5 top-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer"
                    title={showConfirmPw ? 'Hide password' : 'View password'}
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
