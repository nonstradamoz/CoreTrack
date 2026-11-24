'use client';

import React from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { fetchCurrentUser, fetchAvailableUsers, switchUser } from '../../lib/api';
import { Shield } from 'lucide-react';

export function UserPersonaSwitcher() {
  const queryClient = useQueryClient();

  const { data: currentUser } = useQuery({
    queryKey: ['currentUser'],
    queryFn: fetchCurrentUser,
  });

  const { data: availableUsers = [] } = useQuery({
    queryKey: ['availableUsers'],
    queryFn: fetchAvailableUsers,
  });

  const switchMutation = useMutation({
    mutationFn: (email: string) => switchUser(email),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['currentUser'] });
      queryClient.invalidateQueries({ queryKey: ['tickets'] });
      queryClient.invalidateQueries({ queryKey: ['sprints'] });
    },
  });

  const getRoleLabel = (u: any) => {
    if (u?.roleName) return u.roleName;
    const globalPerms = BigInt(u?.globalPermissions || '0');
    if ((globalPerms & 1n) === 1n) return 'Admin';
    if (u?.email?.includes('admin')) return 'Admin';
    if (u?.email?.includes('engineer')) return 'Engineer';
    return 'Requester';
  };

  const getRoleBadgeStyle = (email: string) => {
    if (email.includes('admin')) return 'bg-slate-900 text-white border-transparent';
    if (email.includes('engineer')) return 'bg-blue-50 text-blue-700 border-blue-200';
    return 'bg-slate-100 text-slate-700 border-slate-200';
  };

  return (
    <div className="flex items-center gap-2">
      <div className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white shadow-2xs hover:border-slate-300 transition">
        <Shield className="h-3.5 w-3.5 text-slate-500" />
        <span className="text-xs text-slate-500 font-medium hidden md:inline">Persona:</span>
        <select
          value={currentUser?.email || 'admin@coretrack.internal'}
          onChange={(e) => switchMutation.mutate(e.target.value)}
          disabled={switchMutation.isPending}
          className="bg-transparent text-xs font-semibold text-slate-900 focus:outline-none cursor-pointer"
        >
          {availableUsers.map((u) => (
            <option key={u.id} value={u.email} className="bg-white text-slate-900">
              {u.fullName} ({getRoleLabel(u)})
            </option>
          ))}
        </select>
      </div>

      {currentUser && (
        <span
          className={`hidden lg:inline-flex items-center px-2 py-0.5 rounded-md border text-[10px] font-mono font-medium ${getRoleBadgeStyle(
            currentUser.email
          )}`}
          title={`64-bit Capability Mask: 0x${BigInt(currentUser.globalPermissions || 0).toString(16)}`}
        >
          Mask: 0x{BigInt(currentUser.globalPermissions || 0).toString(16)}
        </span>
      )}
    </div>
  );
}
