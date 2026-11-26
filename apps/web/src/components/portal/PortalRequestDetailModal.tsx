'use client';

import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  HelpdeskTicket,
  HelpdeskComment,
  fetchHelpdeskComments,
  createHelpdeskComment,
  updateHelpdeskTicket,
  fetchAvailableUsers,
  UserPersona,
} from '../../lib/api';
import { SLABadge } from '../sla/SLABadge';
import { HELPDESK_STATUS_BADGE } from './MyRequestsList';
import { usePermissions } from '../../hooks/usePermissions';
import { X, MessageSquare, Send, Calendar, Lock, Globe, AlertCircle } from 'lucide-react';

interface PortalRequestDetailModalProps {
  ticket: HelpdeskTicket | null;
  isAgent: boolean;
  onClose: () => void;
  onTicketUpdated: (updated: HelpdeskTicket) => void;
}

export function PortalRequestDetailModal({
  ticket,
  isAgent,
  onClose,
  onTicketUpdated,
}: PortalRequestDetailModalProps) {
  const queryClient = useQueryClient();
  const { roleTier } = usePermissions();
  const [replyText, setReplyText] = useState('');
  const [isInternal, setIsInternal] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const { data: comments = [], isLoading: isLoadingComments } = useQuery<HelpdeskComment[]>({
    queryKey: ['helpdeskComments', ticket?.ticketKey],
    queryFn: () => (ticket ? fetchHelpdeskComments(ticket.ticketKey) : Promise.resolve([])),
    enabled: !!ticket,
  });

  const { data: users = [] } = useQuery<UserPersona[]>({
    queryKey: ['availableUsers'],
    queryFn: fetchAvailableUsers,
    enabled: isAgent,
  });

  const updateMutation = useMutation({
    mutationFn: (updates: Parameters<typeof updateHelpdeskTicket>[1]) =>
      updateHelpdeskTicket(ticket!.ticketKey, updates),
    onSuccess: (updated) => {
      setActionError(null);
      queryClient.invalidateQueries({ queryKey: ['helpdeskTickets'] });
      onTicketUpdated(updated);
    },
    onError: (err: any) => {
      setActionError(err.message || 'Failed to update ticket');
    },
  });

  const replyMutation = useMutation({
    mutationFn: (payload: { body: string; isInternal: boolean }) =>
      createHelpdeskComment(ticket!.ticketKey, payload),
    onSuccess: () => {
      setReplyText('');
      queryClient.invalidateQueries({ queryKey: ['helpdeskComments', ticket?.ticketKey] });
    },
  });

  if (!ticket) return null;

  const isStatusLocked = (ticket.statusSetByRoleTier ?? 1) > roleTier;
  const isAssigneeLocked = (ticket.assigneeSetByRoleTier ?? 1) > roleTier;

  const statusInfo = HELPDESK_STATUS_BADGE[ticket.status] || {
    label: ticket.status,
    color: 'bg-slate-100 text-slate-700 border-slate-200',
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 dark:bg-black/60 backdrop-blur-xs">
      <div className="relative w-full max-w-2xl max-h-[90vh] flex flex-col rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/40">
          <div className="flex flex-wrap items-center gap-2.5">
            <span className="font-mono text-xs font-bold text-blue-600 dark:text-blue-400">
              {ticket.ticketKey}
            </span>
            <span className={`px-2.5 py-0.5 rounded-full border text-xs font-semibold ${statusInfo.color}`}>
              {statusInfo.label}
            </span>
            {ticket.slaResolutionDueAt && (
              <SLABadge
                dueAt={ticket.slaResolutionDueAt}
                isPaused={ticket.isSlaPaused}
                isResolved={ticket.status === 'RESOLVED' || ticket.status === 'CLOSED'}
                label="Target SLA:"
              />
            )}
          </div>

          <button
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition cursor-pointer"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-5">
          <div>
            <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100 mb-1.5">{ticket.title}</h2>
            <div className="flex flex-wrap items-center gap-2.5 text-xs text-slate-500 dark:text-slate-400 mb-4">
              <span className="flex items-center gap-1">
                <Calendar className="h-3.5 w-3.5" />
                {new Date(ticket.createdAt).toLocaleString()}
              </span>
              <span>•</span>
              <span>{ticket.category}</span>
              <span>•</span>
              <span>{ticket.department}</span>
              {ticket.requester && (
                <>
                  <span>•</span>
                  <span>Requester: <strong className="text-slate-700 dark:text-slate-200">{ticket.requester.fullName}</strong></span>
                </>
              )}
            </div>

            <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/30 text-xs text-slate-800 dark:text-slate-200 whitespace-pre-wrap leading-relaxed">
              {ticket.description || 'No additional details provided.'}
            </div>
          </div>

          {/* Error banner */}
          {actionError && (
            <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 text-xs text-rose-700 dark:text-rose-300 flex items-center gap-2">
              <AlertCircle className="h-4 w-4 shrink-0" />
              <span>{actionError}</span>
            </div>
          )}

          {/* Agent Triage Controls */}
          {isAgent ? (
            <div className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-800/30 grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
              <div>
                <label className="flex items-center justify-between text-[10px] font-semibold uppercase text-slate-400 mb-1">
                  <span>Status</span>
                  {isStatusLocked && (
                    <span className="inline-flex items-center gap-0.5 text-amber-600 dark:text-amber-400 normal-case font-medium">
                      <Lock className="h-2.5 w-2.5" /> Locked
                    </span>
                  )}
                </label>
                <select
                  value={ticket.status}
                  disabled={isStatusLocked || updateMutation.isPending}
                  onChange={(e) => updateMutation.mutate({ status: e.target.value as HelpdeskTicket['status'] })}
                  title={isStatusLocked ? 'Locked: Set by a higher authority' : undefined}
                  className="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-medium text-slate-800 dark:text-slate-200 disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  <option value="OPEN">Open</option>
                  <option value="IN_PROGRESS">In Progress</option>
                  <option value="WAITING_ON_USER">Waiting on User</option>
                  <option value="RESOLVED">Resolved</option>
                  <option value="CLOSED">Closed</option>
                </select>
              </div>
              <div>
                <label className="block text-[10px] font-semibold uppercase text-slate-400 mb-1">Priority</label>
                <select
                  value={ticket.priority}
                  disabled={updateMutation.isPending}
                  onChange={(e) => updateMutation.mutate({ priority: e.target.value as HelpdeskTicket['priority'] })}
                  className="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-medium text-slate-800 dark:text-slate-200"
                >
                  <option value="LOW">Low</option>
                  <option value="MEDIUM">Medium</option>
                  <option value="HIGH">High</option>
                  <option value="URGENT">Urgent</option>
                </select>
              </div>
              <div>
                <label className="flex items-center justify-between text-[10px] font-semibold uppercase text-slate-400 mb-1">
                  <span>Assigned Agent</span>
                  {isAssigneeLocked && (
                    <span className="inline-flex items-center gap-0.5 text-amber-600 dark:text-amber-400 normal-case font-medium">
                      <Lock className="h-2.5 w-2.5" /> Locked
                    </span>
                  )}
                </label>
                <select
                  value={ticket.assigneeId || ''}
                  disabled={isAssigneeLocked || updateMutation.isPending}
                  onChange={(e) => updateMutation.mutate({ assigneeId: e.target.value || null })}
                  title={isAssigneeLocked ? 'Locked: Assigned by a higher authority' : undefined}
                  className="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-medium text-slate-800 dark:text-slate-200 disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  <option value="">Unassigned</option>
                  {users.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.fullName}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-end">
              {isStatusLocked ? (
                <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 text-xs font-medium border border-slate-200 dark:border-slate-700">
                  <Lock className="h-3.5 w-3.5" />
                  <span>Status locked by higher authority</span>
                </span>
              ) : ticket.status !== 'CLOSED' ? (
                <button
                  type="button"
                  onClick={() => updateMutation.mutate({ status: 'CLOSED' })}
                  className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                >
                  Close Request
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => updateMutation.mutate({ status: 'OPEN' })}
                  className="px-3 py-1.5 rounded-lg border border-blue-200 dark:border-blue-800 text-xs font-semibold text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-950/40 cursor-pointer"
                >
                  Reopen Request
                </button>
              )}
            </div>
          )}

          {/* Conversation */}
          <div className="space-y-3 pt-2 border-t border-slate-100 dark:border-slate-800">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400 flex items-center gap-2">
              <MessageSquare className="h-3.5 w-3.5" />
              Conversation ({comments.length})
            </h3>

            {isLoadingComments ? (
              <p className="text-xs text-slate-400 italic">Loading messages...</p>
            ) : comments.length === 0 ? (
              <div className="p-4 rounded-xl border border-dashed border-slate-200 dark:border-slate-800 text-center text-xs text-slate-400">
                No replies yet. Add a message below to communicate with IT support.
              </div>
            ) : (
              <div className="space-y-2.5">
                {comments.map((c) => (
                  <div
                    key={c.id}
                    className={`p-3 rounded-xl border text-xs ${
                      c.isInternal
                        ? 'border-amber-200 dark:border-amber-900/60 bg-amber-50/50 dark:bg-amber-950/20'
                        : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-slate-900 dark:text-slate-100">
                          {c.author?.fullName || 'User'}
                        </span>
                        {c.isInternal && (
                          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-amber-100 dark:bg-amber-900/60 text-amber-800 dark:text-amber-300">
                            <Lock className="h-2.5 w-2.5" />
                            Internal Note
                          </span>
                        )}
                      </div>
                      <span className="text-[10px] text-slate-400 font-mono">
                        {new Date(c.createdAt).toLocaleString()}
                      </span>
                    </div>
                    <p className="text-slate-700 dark:text-slate-300 whitespace-pre-wrap leading-relaxed">
                      {c.body}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Reply Composer */}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!replyText.trim()) return;
            replyMutation.mutate({ body: replyText.trim(), isInternal });
          }}
          className="p-4 border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 space-y-2"
        >
          {isAgent && (
            <div className="flex items-center gap-2 text-[11px]">
              <button
                type="button"
                onClick={() => setIsInternal(false)}
                className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg font-semibold transition cursor-pointer ${
                  !isInternal
                    ? 'bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800'
                    : 'text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800'
                }`}
              >
                <Globe className="h-3 w-3" />
                Public Reply
              </button>
              <button
                type="button"
                onClick={() => setIsInternal(true)}
                className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg font-semibold transition cursor-pointer ${
                  isInternal
                    ? 'bg-amber-50 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800'
                    : 'text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800'
                }`}
              >
                <Lock className="h-3 w-3" />
                Internal Note
              </button>
            </div>
          )}

          <div className="flex items-center gap-2">
            <input
              type="text"
              placeholder={isInternal ? 'Write an internal note (hidden from requester)...' : 'Write a reply...'}
              value={replyText}
              onChange={(e) => setReplyText(e.target.value)}
              className="flex-1 px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs text-slate-900 dark:text-slate-100 focus:outline-none focus:border-blue-600"
            />
            <button
              type="submit"
              disabled={replyMutation.isPending || !replyText.trim()}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold disabled:opacity-40 cursor-pointer"
            >
              <Send className="h-3.5 w-3.5" />
              <span>Send</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
