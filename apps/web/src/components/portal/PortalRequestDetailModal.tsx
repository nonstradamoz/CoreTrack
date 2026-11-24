'use client';

import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Ticket, fetchComments, createComment, fetchTicketApprovals, TicketApproval } from '../../lib/api';
import { SLABadge } from '../sla/SLABadge';
import {
  X,
  MessageSquare,
  Send,
  Calendar,
  ShieldCheck,
  CheckCircle2,
  Clock,
  XCircle,
} from 'lucide-react';

interface PortalRequestDetailModalProps {
  ticket: Ticket | null;
  onClose: () => void;
}

const statusMap: Record<string, { label: string; color: string }> = {
  TODO: { label: 'Received by IT', color: 'bg-blue-50 dark:bg-blue-950/60 text-blue-800 dark:text-blue-300 border-blue-200 dark:border-blue-800' },
  PENDING_APPROVAL: { label: 'Pending Management Approval', color: 'bg-amber-50 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300 border-amber-200 dark:border-amber-800' },
  IN_PROGRESS: { label: 'Assigned / In Progress', color: 'bg-blue-50 dark:bg-blue-950/60 text-blue-800 dark:text-blue-300 border-blue-200 dark:border-blue-800' },
  IN_REVIEW: { label: 'Awaiting Verification', color: 'bg-purple-50 dark:bg-purple-950/60 text-purple-800 dark:text-purple-300 border-purple-200 dark:border-purple-800' },
  RESOLVED: { label: 'Resolved', color: 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800' },
  DONE: { label: 'Completed', color: 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800' },
  CANCELED: { label: 'Canceled', color: 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700' },
};

export function PortalRequestDetailModal({ ticket, onClose }: PortalRequestDetailModalProps) {
  const queryClient = useQueryClient();
  const [replyText, setReplyText] = useState('');

  const { data: comments = [], isLoading: isLoadingComments } = useQuery({
    queryKey: ['comments', ticket?.ticketKey],
    queryFn: () => (ticket ? fetchComments(ticket.ticketKey) : Promise.resolve([])),
    enabled: !!ticket,
  });

  const { data: approvals = [] } = useQuery<TicketApproval[]>({
    queryKey: ['ticketApprovals', ticket?.ticketKey],
    queryFn: () => (ticket ? fetchTicketApprovals(ticket.ticketKey) : Promise.resolve([])),
    enabled: !!ticket,
  });

  // Strict employee privacy filter: NEVER show INTERNAL_ONLY notes to the requester!
  const publicComments = comments.filter((c) => c.visibilityScope === 'PUBLIC');

  const replyMutation = useMutation({
    mutationFn: (body: string) =>
      createComment(ticket!.ticketKey, {
        body,
        visibilityScope: 'PUBLIC',
      }),
    onSuccess: () => {
      setReplyText('');
      queryClient.invalidateQueries({ queryKey: ['comments', ticket?.ticketKey] });
    },
  });

  if (!ticket) return null;

  const statusInfo = statusMap[ticket.status] || {
    label: ticket.status,
    color: 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700',
  };

  async function handleSendReply(e: React.FormEvent) {
    e.preventDefault();
    if (!replyText.trim()) return;
    await replyMutation.mutateAsync(replyText.trim());
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 dark:bg-black/60 backdrop-blur-xs">
      <div className="relative w-full max-w-2xl max-h-[90vh] flex flex-col rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-2xl overflow-hidden transition-colors">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/40">
          <div className="flex items-center gap-3">
            <span className="font-mono text-xs font-bold text-slate-500 dark:text-slate-400">
              {ticket.ticketKey}
            </span>
            <span className={`px-2.5 py-0.5 rounded-full border text-xs font-semibold ${statusInfo.color}`}>
              {statusInfo.label}
            </span>
            {ticket.slaResolutionDueAt && (
              <SLABadge
                dueAt={ticket.slaResolutionDueAt}
                isPaused={ticket.isSlaPaused}
                isResolved={ticket.status === 'DONE' || ticket.status === 'RESOLVED'}
                label="Target SLA:"
              />
            )}
          </div>

          <button
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          <div>
            <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100 mb-2">{ticket.title}</h2>
            <div className="flex items-center gap-3 text-xs text-slate-500 dark:text-slate-400 mb-4">
              <span className="flex items-center gap-1">
                <Calendar className="h-3.5 w-3.5" />
                Submitted {new Date(ticket.createdAt).toLocaleDateString()}
              </span>
              <span>•</span>
              <span className="capitalize">{ticket.ticketType.replace('_', ' ').toLowerCase()}</span>
            </div>

            <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/30 text-xs text-slate-800 dark:text-slate-200 whitespace-pre-wrap leading-relaxed">
              {ticket.description}
            </div>
          </div>

          {/* ITSM Staged Multi-Tier Approval Status */}
          {(approvals.length > 0 || ticket.status === 'PENDING_APPROVAL') && (
            <div className="p-4 rounded-xl border border-blue-200 dark:border-blue-900 bg-blue-50/40 dark:bg-blue-950/20 space-y-3">
              <div className="flex items-center gap-2">
                <ShieldCheck className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                <h3 className="text-xs font-bold text-slate-900 dark:text-slate-100">
                  Required Approvals Progress
                </h3>
              </div>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                {ticket.status === 'PENDING_APPROVAL'
                  ? 'This request requires formal management sign-off before IT execution begins. The SLA clock is currently paused.'
                  : 'All approval sign-offs completed.'}
              </p>

              <div className="space-y-2">
                {approvals.map((appr) => (
                  <div
                    key={appr.id}
                    className="p-2.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex items-center justify-between text-xs"
                  >
                    <div className="flex items-center gap-2">
                      <span className="font-mono font-bold text-[10px] px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
                        Tier {appr.tier}
                      </span>
                      <span className="text-slate-700 dark:text-slate-300">
                        Department / Manager Review
                      </span>
                    </div>

                    <div className="flex items-center gap-1.5">
                      {appr.status === 'APPROVED' ? (
                        <span className="flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800">
                          <CheckCircle2 className="h-3 w-3" /> Approved
                        </span>
                      ) : appr.status === 'REJECTED' ? (
                        <span className="flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-rose-50 dark:bg-rose-950/60 text-rose-700 dark:text-rose-400 border border-rose-200 dark:border-rose-800">
                          <XCircle className="h-3 w-3" /> Rejected
                        </span>
                      ) : (
                        <span className="flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-50 dark:bg-amber-950/60 text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-800">
                          <Clock className="h-3 w-3" /> Pending Review
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Public Updates and Messages */}
          <div className="pt-4 border-t border-slate-200 dark:border-slate-800">
            <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100 mb-3 flex items-center gap-2">
              <MessageSquare className="h-4 w-4 text-slate-500" />
              IT Team Updates & Conversation ({publicComments.length})
            </h3>

            {/* Conversation Stream */}
            <div className="space-y-3 mb-6">
              {isLoadingComments ? (
                <p className="text-xs text-slate-400">Loading conversation...</p>
              ) : publicComments.length === 0 ? (
                <div className="p-4 rounded-xl border border-dashed border-slate-200 dark:border-slate-800 text-center text-xs text-slate-400">
                  No messages yet. The IT support team will reply directly to this ticket.
                </div>
              ) : (
                publicComments.map((comment) => (
                  <div
                    key={comment.id}
                    className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-xs shadow-2xs"
                  >
                    <div className="flex items-center justify-between mb-1.5">
                      <div className="flex items-center gap-2">
                        <div className="h-5 w-5 rounded-full bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 flex items-center justify-center text-[10px] font-bold">
                          {(comment.authorName || 'S').charAt(0).toUpperCase()}
                        </div>
                        <span className="font-semibold text-slate-900 dark:text-slate-100">
                          {comment.authorName || 'IT Support Team'}
                        </span>
                      </div>
                      <span className="text-[10px] text-slate-400">
                        {new Date(comment.createdAt).toLocaleTimeString([], {
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </span>
                    </div>
                    <p className="text-slate-800 dark:text-slate-200 whitespace-pre-wrap pl-7">{comment.body}</p>
                  </div>
                ))
              )}
            </div>

            {/* Requester Reply Form */}
            <form onSubmit={handleSendReply} className="relative">
              <textarea
                rows={3}
                placeholder="Reply to the IT team or provide additional details..."
                value={replyText}
                onChange={(e) => setReplyText(e.target.value)}
                className="w-full p-3 pr-24 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:border-blue-600 transition"
              />
              <button
                type="submit"
                disabled={!replyText.trim() || replyMutation.isPending}
                className="absolute right-2.5 bottom-3.5 px-3.5 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold flex items-center gap-1.5 shadow-2xs disabled:opacity-40 transition"
              >
                <Send className="h-3 w-3" />
                <span>Send</span>
              </button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
