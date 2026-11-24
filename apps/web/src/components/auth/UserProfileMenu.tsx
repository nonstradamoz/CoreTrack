'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { fetchCurrentUser, logoutUser } from '../../lib/api';
import { useTheme } from '../theme/ThemeProvider';
import { User, Shield, Moon, Sun, ChevronDown, LogOut } from 'lucide-react';

export function UserProfileMenu() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [isOpen, setIsOpen] = useState(false);
  const { theme, toggleTheme } = useTheme();

  const { data: currentUser } = useQuery({
    queryKey: ['currentUser'],
    queryFn: fetchCurrentUser,
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

  return (
    <div className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 p-1 pl-1.5 pr-2.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800 shadow-2xs transition"
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

          {/* Theme Switcher Toggle */}
          <div className="p-2 border-b border-slate-100 dark:border-slate-800">
            <button
              onClick={toggleTheme}
              className="w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
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
              className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-xs font-semibold text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition"
            >
              <LogOut className="h-3.5 w-3.5" />
              <span>Log out</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
