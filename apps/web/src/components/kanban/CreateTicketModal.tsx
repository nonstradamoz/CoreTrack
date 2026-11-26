'use client';

import React, { useState, useEffect } from 'react';
import { X, Plus, AlertCircle, User, Calendar, Sparkles, Users } from 'lucide-react';
import { Ticket, UserPersona, Team, fetchAvailableUsers, fetchTeams, fetchProjects, fetchCurrentUser } from '../../lib/api';
import { usePermissions } from '../../hooks/usePermissions';
import { Permissions } from '../../lib/permissions';

interface CreateTicketModalProps {
  projectId: string;
  defaultTeamId?: string;
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: {
    projectId: string;
    teamId?: string;
    title: string;
    description: string;
    ticketType: Ticket['ticketType'];
    priority: Ticket['priority'];
    status: Ticket['status'];
    storyPoints?: number;
    assigneeId?: string;
    dueDate?: string;
  }) => Promise<void>;
}

export function CreateTicketModal({
  projectId,
  defaultTeamId,
  isOpen,
  onClose,
  onSubmit,
}: CreateTicketModalProps) {
  const { hasPermission, roleTier } = usePermissions();
  const canCreateTask = hasPermission(Permissions.TICKET_CREATE);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [ticketType, setTicketType] = useState<Ticket['ticketType']>('TASK');
  const [priority, setPriority] = useState<Ticket['priority']>('MEDIUM');
  const [status, setStatus] = useState<Ticket['status']>('TODO');
  const [storyPoints, setStoryPoints] = useState<number | ''>(3);
  const [assigneeId, setAssigneeId] = useState('');
  const [teamId, setTeamId] = useState(defaultTeamId || '');
  const [dueDate, setDueDate] = useState('');
  const [availableUsers, setAvailableUsers] = useState<UserPersona[]>([]);
  const [projectTeamsList, setProjectTeamsList] = useState<Team[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      if (defaultTeamId) setTeamId(defaultTeamId);
      fetchAvailableUsers()
        .then((users) => setAvailableUsers(users))
        .catch(() => setAvailableUsers([]));

      Promise.all([fetchTeams(), fetchProjects(), fetchCurrentUser().catch(() => null)])
        .then(([allTeams, allProjects, currentUser]) => {
          const activeProj = allProjects.find((p) => p.id === projectId);
          const assignedIds = new Set((activeProj?.assignedTeams || []).map((t) => t.id));
          let scoped = assignedIds.size > 0
            ? allTeams.filter((t) => assignedIds.has(t.id))
            : allTeams;

          if (roleTier < 3 && currentUser) {
            const myTeams = scoped.filter(
              (t) => t.leadId === currentUser.id || t.members.some((m) => m.userId === currentUser.id)
            );
            if (myTeams.length > 0) {
              scoped = myTeams;
              if (!defaultTeamId) setTeamId(myTeams[0].id);
            }
          }
          setProjectTeamsList(scoped);
        })
        .catch(() => setProjectTeamsList([]));
    }
  }, [isOpen, projectId, defaultTeamId, roleTier]);

  if (!isOpen) return null;

  function handleAssigneeChange(newAssigneeId: string) {
    setAssigneeId(newAssigneeId);
    // Smart Auto-Default: if an assignee is picked and no deadline exists, auto-populate +7 days
    if (newAssigneeId && !dueDate) {
      const d = new Date();
      d.setDate(d.getDate() + 7);
      setDueDate(d.toISOString().split('T')[0]);
    }
  }

  function setDatePreset(daysFromNow: number) {
    const d = new Date();
    d.setDate(d.getDate() + daysFromNow);
    setDueDate(d.toISOString().split('T')[0]);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) {
      setError('Title is required');
      return;
    }

    try {
      setIsSubmitting(true);
      setError(null);
      await onSubmit({
        projectId,
        teamId: teamId || undefined,
        title: title.trim(),
        description: description.trim(),
        ticketType,
        priority,
        status,
        storyPoints: storyPoints === '' ? undefined : Number(storyPoints),
        assigneeId: assigneeId || undefined,
        dueDate: dueDate ? new Date(dueDate).toISOString() : undefined,
      });
      onClose();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to create task');
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 dark:bg-black/60 backdrop-blur-xs">
      <div className="relative w-full max-w-xl p-6 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-2xl max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-slate-100 dark:border-slate-800">
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded-lg bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-400">
              <Plus className="h-4 w-4" />
            </div>
            <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">Create New Task</h3>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {error && (
          <div className="mt-4 p-3 rounded-lg bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 text-rose-800 dark:text-rose-200 text-xs flex items-center gap-2">
            <AlertCircle className="h-4 w-4 shrink-0 text-rose-600" />
            <span>{error}</span>
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit} className="mt-4 space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
              Title <span className="text-rose-600">*</span>
            </label>
            <input
              type="text"
              required
              autoFocus
              placeholder="e.g. Implement Redis pub/sub presence clustering"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full px-3.5 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:border-blue-600 focus:ring-1 focus:ring-blue-600 transition"
            />
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">Type</label>
              <select
                value={ticketType}
                onChange={(e) => setTicketType(e.target.value as Ticket['ticketType'])}
                className="w-full px-2.5 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-medium text-slate-900 dark:text-slate-100 focus:outline-none focus:border-blue-600"
              >
                <option value="TASK">Task</option>
                <option value="BUG">Bug</option>
                <option value="STORY">Story</option>
                <option value="INCIDENT">Incident</option>
                <option value="EPIC">Epic</option>
                <option value="SERVICE_REQUEST">Service Req</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">Priority</label>
              <select
                value={priority}
                onChange={(e) => setPriority(e.target.value as Ticket['priority'])}
                className="w-full px-2.5 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-medium text-slate-900 dark:text-slate-100 focus:outline-none focus:border-blue-600"
              >
                <option value="LOW">Low</option>
                <option value="MEDIUM">Medium</option>
                <option value="HIGH">High</option>
                <option value="URGENT">Urgent</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">Status</label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value as Ticket['status'])}
                className="w-full px-2.5 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-medium text-slate-900 dark:text-slate-100 focus:outline-none focus:border-blue-600"
              >
                <option value="TODO">Todo</option>
                <option value="IN_PROGRESS">In Progress</option>
                <option value="IN_REVIEW">In Review</option>
                <option value="DONE">Done</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">Story Points</label>
              <input
                type="number"
                min="0"
                max="100"
                value={storyPoints}
                onChange={(e) => setStoryPoints(e.target.value === '' ? '' : Number(e.target.value))}
                className="w-full px-2.5 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-medium text-slate-900 dark:text-slate-100 focus:outline-none focus:border-blue-600"
              />
            </div>
          </div>

          {/* Assignee, Team & Deadline Policy Section */}
          <div className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/40 space-y-3">
            {projectTeamsList.length > 0 && (
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1 flex items-center gap-1.5">
                  <Users className="h-3.5 w-3.5 text-blue-600 dark:text-blue-400" />
                  Assigned Team
                </label>
                <select
                  value={teamId}
                  onChange={(e) => setTeamId(e.target.value)}
                  className="w-full px-2.5 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-medium text-slate-900 dark:text-slate-100 focus:outline-none focus:border-blue-600 shadow-2xs"
                >
                  {roleTier >= 3 && <option value="">General / All Teams</option>}
                  {projectTeamsList.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name} ({t.keyPrefix})
                    </option>
                  ))}
                </select>
              </div>
            )}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1 flex items-center gap-1.5">
                  <User className="h-3.5 w-3.5 text-blue-600 dark:text-blue-400" />
                  Assignee
                </label>
                <select
                  value={assigneeId}
                  onChange={(e) => handleAssigneeChange(e.target.value)}
                  className="w-full px-2.5 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-medium text-slate-900 dark:text-slate-100 focus:outline-none focus:border-blue-600 shadow-2xs"
                >
                  <option value="">Unassigned</option>
                  {availableUsers.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.fullName} ({u.email})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1 flex items-center gap-1.5">
                  <Calendar className="h-3.5 w-3.5 text-blue-600 dark:text-blue-400" />
                  Deadline (Due Date)
                  {assigneeId && (
                    <span className="text-[10px] font-bold text-blue-600 dark:text-blue-400 ml-auto">
                      Auto-Default Active
                    </span>
                  )}
                </label>
                <input
                  type="date"
                  value={dueDate}
                  onChange={(e) => setDueDate(e.target.value)}
                  className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs text-slate-900 dark:text-slate-100 focus:outline-none focus:border-blue-600 shadow-2xs"
                />
              </div>
            </div>

            {/* Quick Date Presets */}
            <div className="flex flex-wrap items-center justify-between gap-1.5 pt-1 text-[11px]">
              <span className="text-slate-500 dark:text-slate-400 flex items-center gap-1">
                <Sparkles className="h-3 w-3 text-blue-500" /> Quick presets:
              </span>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => setDatePreset(1)}
                  className="px-2 py-0.5 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 font-medium"
                >
                  Tomorrow
                </button>
                <button
                  type="button"
                  onClick={() => setDatePreset(3)}
                  className="px-2 py-0.5 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 font-medium"
                >
                  +3 Days
                </button>
                <button
                  type="button"
                  onClick={() => setDatePreset(7)}
                  className="px-2 py-0.5 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 font-medium"
                >
                  +1 Week
                </button>
                <button
                  type="button"
                  onClick={() => setDatePreset(14)}
                  className="px-2 py-0.5 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 font-medium"
                >
                  +2 Weeks
                </button>
                {dueDate && (
                  <button
                    type="button"
                    onClick={() => setDueDate('')}
                    className="px-1.5 py-0.5 text-rose-600 hover:underline font-semibold"
                  >
                    Clear
                  </button>
                )}
              </div>
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">Description</label>
            <textarea
              rows={4}
              placeholder="Provide context, acceptance criteria, or reproduction steps..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full px-3.5 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:border-blue-600 focus:ring-1 focus:ring-blue-600 transition"
            />
          </div>

          {/* Footer Actions */}
          <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-slate-100 dark:border-slate-800">
            <button
              type="button"
              onClick={onClose}
              className="px-3.5 py-2 rounded-lg text-xs font-medium text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting || !canCreateTask}
              title={!canCreateTask ? 'Requires Create Tasks permission' : undefined}
              className={`px-4 py-2 rounded-lg text-xs font-semibold bg-blue-600 hover:bg-blue-700 text-white shadow-2xs transition ${!canCreateTask ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer'
                } disabled:opacity-50`}
            >
              {isSubmitting ? 'Creating...' : 'Create Task'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
