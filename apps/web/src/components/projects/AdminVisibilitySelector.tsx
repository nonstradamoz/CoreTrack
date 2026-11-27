'use client';

import React from 'react';
import { ShieldCheck } from 'lucide-react';

export type AdminAccessMode = 'NONE' | 'SELECTED' | 'ALL';

interface AdminVisibilitySelectorProps {
  mode: AdminAccessMode;
  onModeChange: (mode: AdminAccessMode) => void;
  selectedAdminIds: string[];
  onSelectedAdminIdsChange: (ids: string[]) => void;
  adminUsers: Array<{ id: string; fullName: string; email?: string }>;
}

/** Super-Admin-only control to restrict or grant Admin visibility on a project. */
export function AdminVisibilitySelector({
  mode,
  onModeChange,
  selectedAdminIds,
  onSelectedAdminIdsChange,
  adminUsers,
}: AdminVisibilitySelectorProps) {
  return (
    <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/60 p-3 space-y-2.5">
      <div className="flex items-center justify-between">
        <span className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-700 dark:text-slate-300">
          <ShieldCheck className="h-3.5 w-3.5 text-indigo-500" />
          Admin Visibility
        </span>
        <span className="text-[10px] font-medium text-slate-500 dark:text-slate-400">
          {mode === 'NONE'
            ? 'Super Admin Only'
            : mode === 'ALL'
              ? 'All Admins'
              : `${selectedAdminIds.length} Admin(s) selected`}
        </span>
      </div>

      <div className="grid grid-cols-3 gap-1.5">
        {(
          [
            { value: 'NONE', label: 'No Admins' },
            { value: 'SELECTED', label: 'Specific Admins' },
            { value: 'ALL', label: 'All Admins' },
          ] as const
        ).map((opt) => (
          <button
            key={opt.value}
            type="button"
            onClick={() => onModeChange(opt.value)}
            className={`px-2.5 py-1.5 rounded-lg text-[11px] font-semibold border transition cursor-pointer ${
              mode === opt.value
                ? 'bg-indigo-600 text-white border-indigo-600 shadow-2xs'
                : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-800 hover:border-indigo-400'
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>

      {mode === 'NONE' && (
        <p className="text-[11px] text-slate-500 dark:text-slate-400">
          Admins cannot view this project unless you explicitly permit them.
        </p>
      )}

      {mode === 'ALL' && (
        <p className="text-[11px] text-slate-500 dark:text-slate-400">
          Every Admin in the workspace can view and manage this project.
        </p>
      )}

      {mode === 'SELECTED' && (
        <div className="space-y-1.5">
          {adminUsers.length === 0 ? (
            <p className="text-[11px] text-amber-600 dark:text-amber-400">
              No Admin users found. Assign the Admin role in Settings &rarr; Users first.
            </p>
          ) : (
            <div className="grid grid-cols-2 gap-1.5 max-h-28 overflow-y-auto pt-0.5">
              {adminUsers.map((u) => {
                const checked = selectedAdminIds.includes(u.id);
                return (
                  <label
                    key={u.id}
                    className="flex items-center gap-2 px-2 py-1.5 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs text-slate-700 dark:text-slate-300 cursor-pointer hover:border-indigo-400"
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={(e) => {
                        onSelectedAdminIdsChange(
                          e.target.checked
                            ? [...selectedAdminIds, u.id]
                            : selectedAdminIds.filter((id) => id !== u.id)
                        );
                      }}
                      className="h-3.5 w-3.5 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                    />
                    <span className="truncate">{u.fullName}</span>
                  </label>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
