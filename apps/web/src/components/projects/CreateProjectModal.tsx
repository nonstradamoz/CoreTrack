'use client';

import React, { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { createProject, fetchTeams, fetchAvailableUsers } from '../../lib/api';
import { RichTextEditor } from '../ui/RichText';
import { usePermissions } from '../../hooks/usePermissions';
import { FolderGit2, ShieldCheck } from 'lucide-react';

export interface CreateProjectModalProps {
  isOpen: boolean;
  onClose: () => void;
  teams?: any[];
  availableUsers?: any[];
  onSuccess?: () => void;
}

export function CreateProjectModal({
  isOpen,
  onClose,
  teams: initialTeams,
  availableUsers: initialUsers,
  onSuccess,
}: CreateProjectModalProps) {
  const queryClient = useQueryClient();

  // Fallback to fetch if not passed as props
  const { data: fetchedTeams = [] } = useQuery({
    queryKey: ['teams'],
    queryFn: fetchTeams,
    enabled: isOpen && !initialTeams,
  });

  const { data: fetchedUsers = [] } = useQuery({
    queryKey: ['availableUsers'],
    queryFn: fetchAvailableUsers,
    enabled: isOpen && !initialUsers,
  });

  const teams = initialTeams || fetchedTeams;
  const availableUsers = initialUsers || fetchedUsers;
  const { isOrgAdmin, roleTier } = usePermissions();
  const isSuperAdmin = isOrgAdmin || roleTier >= 5;
  const adminUsers = availableUsers.filter((u) => u.roleTier === 4);

  const [name, setName] = useState('');
  const [key, setKey] = useState('');
  const [description, setDescription] = useState('');
  const [primaryTeamId, setPrimaryTeamId] = useState(teams[0]?.id || '');
  const [projectManagerId, setProjectManagerId] = useState('');
  const [reviewerId, setReviewerId] = useState('');
  const [status, setStatus] = useState('NOT_STARTED');
  const [startDate, setStartDate] = useState('');
  const [deadline, setDeadline] = useState('');
  const [adminVisibleTo, setAdminVisibleTo] = useState<string[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  if (!isOpen) return null;

  const selectedTeam = teams.find((t) => t.id === primaryTeamId) || teams[0];

  const handleNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setName(val);
    if (!key || key.length < 5) {
      const suggested = val
        .split(' ')
        .map((w) => w[0])
        .join('')
        .toUpperCase()
        .slice(0, 5);
      if (suggested) setKey(suggested);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !key.trim()) {
      setErrorMsg('Please fill required fields (Name and Key)');
      return;
    }

    setIsSubmitting(true);
    setErrorMsg('');

    try {
      await createProject({
        name: name.trim(),
        key: key.trim().toUpperCase(),
        description: description.trim() || undefined,
        departmentId: selectedTeam?.departmentId || undefined,
        primaryTeamId: primaryTeamId && primaryTeamId.trim() !== '' ? primaryTeamId.trim() : undefined,
        projectManagerId: projectManagerId && projectManagerId.trim() !== '' ? projectManagerId.trim() : undefined,
        reviewerId: reviewerId && reviewerId.trim() !== '' ? reviewerId.trim() : undefined,
        status,
        startDate: startDate ? new Date(startDate).toISOString() : undefined,
        deadline: deadline ? new Date(deadline).toISOString() : undefined,
        ...(isSuperAdmin && adminVisibleTo.length > 0 ? { adminVisibleTo } : {}),
      });

      queryClient.invalidateQueries({ queryKey: ['projects'] });
      queryClient.invalidateQueries({ queryKey: ['projectMetrics'] });
      if (onSuccess) {
        onSuccess();
      } else {
        onClose();
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to create project');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 overflow-y-auto">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl w-full max-w-lg p-6 shadow-xl space-y-4 my-8">
        <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
          <div className="flex items-center gap-2">
            <FolderGit2 className="h-5 w-5 text-blue-600" />
            <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">Create New Project</h2>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 text-xs font-semibold cursor-pointer"
          >
            ✕
          </button>
        </div>

        {errorMsg && (
          <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/60 text-rose-600 dark:text-rose-400 text-xs font-medium border border-rose-200 dark:border-rose-900">
            {errorMsg}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-3 gap-3">
            <div className="col-span-2">
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                Project Name *
              </label>
              <input
                type="text"
                required
                value={name}
                onChange={handleNameChange}
                placeholder="e.g. NextGen Mobile App"
                className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 text-xs text-slate-900 dark:text-slate-100 focus:outline-hidden focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                Project Key *
              </label>
              <input
                type="text"
                required
                maxLength={6}
                value={key}
                onChange={(e) => setKey(e.target.value.toUpperCase())}
                placeholder="KEY"
                className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 text-xs font-mono font-bold text-slate-900 dark:text-slate-100 focus:outline-hidden focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 uppercase"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
              Description
            </label>
            <RichTextEditor
              value={description}
              onChange={setDescription}
              placeholder="Primary deliverables, goals, and architectural objectives..."
              minHeight="95px"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                Primary Team {teams.length > 0 ? '' : '(Optional)'}
              </label>
              <select
                value={primaryTeamId}
                onChange={(e) => setPrimaryTeamId(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 text-xs text-slate-900 dark:text-slate-100"
              >
                {teams.length === 0 ? (
                  <option value="">No teams available (standalone project)</option>
                ) : (
                  <>
                    <option value="">-- Select Team --</option>
                    {teams.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name} ({t.keyPrefix})
                      </option>
                    ))}
                  </>
                )}
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                Initial Status
              </label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 text-xs text-slate-900 dark:text-slate-100"
              >
                <option value="NOT_STARTED">Not Started</option>
                <option value="IN_PROGRESS">In Progress</option>
                <option value="ON_HOLD">On Hold</option>
                <option value="UNDER_REVIEW">Under Review</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                Project Manager
              </label>
              {(() => {
                const managerUsers = availableUsers.filter(
                  (u) => u.roleTier === 3 || (u.roleName || '').toLowerCase() === 'manager'
                );
                return (
                  <>
                    <select
                      value={projectManagerId}
                      onChange={(e) => setProjectManagerId(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 text-xs text-slate-900 dark:text-slate-100"
                    >
                      <option value="">-- Assign Manager --</option>
                      {managerUsers.map((u) => (
                        <option key={u.id} value={u.id}>
                          {u.fullName} ({u.email})
                        </option>
                      ))}
                    </select>
                    {managerUsers.length === 0 && (
                      <p className="text-[10px] text-amber-600 dark:text-amber-400 mt-1">
                        No users with the Manager role found. Assign the Manager role in Settings &rarr; Users first.
                      </p>
                    )}
                  </>
                );
              })()}
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                Project Reviewer
              </label>
              <select
                value={reviewerId}
                onChange={(e) => setReviewerId(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 text-xs text-slate-900 dark:text-slate-100"
              >
                <option value="">-- Assign Reviewer --</option>
                {availableUsers.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.fullName} ({u.email})
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                Start Date
              </label>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 text-xs text-slate-900 dark:text-slate-100"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                Target Deadline
              </label>
              <input
                type="date"
                value={deadline}
                onChange={(e) => setDeadline(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 text-xs text-slate-900 dark:text-slate-100"
              />
            </div>
          </div>

          {isSuperAdmin && adminUsers.length > 0 && (
            <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/60 p-3 space-y-2">
              <div className="flex items-center justify-between">
                <span className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-700 dark:text-slate-300">
                  <ShieldCheck className="h-3.5 w-3.5 text-indigo-500" />
                  Admin Visibility
                </span>
                <span className="text-[10px] text-slate-500 dark:text-slate-400">
                  {adminVisibleTo.length === 0 ? 'All Admins' : `${adminVisibleTo.length} selected`}
                </span>
              </div>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                Leave unchecked to allow all Admins, or select specific Admins who can view this project.
              </p>
              <div className="grid grid-cols-2 gap-1.5 max-h-28 overflow-y-auto pt-1">
                {adminUsers.map((u) => {
                  const checked = adminVisibleTo.includes(u.id);
                  return (
                    <label
                      key={u.id}
                      className="flex items-center gap-2 px-2 py-1.5 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs text-slate-700 dark:text-slate-300 cursor-pointer hover:border-indigo-400"
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={(e) => {
                          setAdminVisibleTo((prev) =>
                            e.target.checked ? [...prev, u.id] : prev.filter((id) => id !== u.id)
                          );
                        }}
                        className="h-3.5 w-3.5 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                      />
                      <span className="truncate">{u.fullName}</span>
                    </label>
                  );
                })}
              </div>
            </div>
          )}

          <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100 dark:border-slate-800">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-4 py-2 rounded-xl text-xs font-semibold bg-blue-600 hover:bg-blue-700 text-white shadow-2xs transition disabled:opacity-50 cursor-pointer"
            >
              {isSubmitting ? 'Creating Project...' : 'Create Project'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
