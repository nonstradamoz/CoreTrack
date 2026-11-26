'use client';

import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Ticket,
  fetchComments,
  createComment,
  updateTicket,
  fetchAvailableUsers,
  fetchTicketDependencies,
  createTicketDependency,
  deleteTicketDependency,
  deleteTicket,
  fetchTicketAttachments,
  presignTicketAttachment,
  fetchTicketApprovals,
  requestTicketApproval,
  submitApprovalDecision,
  fetchTicketVcsLinks,
  fetchProjects,
  searchProjectTasks,
  syncProjectGithub,
  TicketDependency,
  TicketAttachment,
  TicketApproval,
  TicketVcsLink,
} from '../../lib/api';
import { SLABadge } from '../sla/SLABadge';
import { usePermissions } from '../../hooks/usePermissions';
import { Permissions } from '../../lib/permissions';
import {
  X,
  MessageSquare,
  Lock,
  Globe,
  Send,
  Calendar,
  Layers,
  Clock,
  User,
  AlertTriangle,
  Tag,
  Shield,
  Hash,
  Link2,
  Paperclip,
  Download,
  Plus,
  Trash2,
  CheckCircle2,
  XCircle,
  GitPullRequest,
  GitCommit,
  GitFork,
  ExternalLink,
  ShieldCheck,
  Search,
  RefreshCw,
  FileText,
} from 'lucide-react';

interface TicketDetailModalProps {
  ticket: Ticket | null;
  onClose: () => void;
}

export function TicketDetailModal({ ticket, onClose }: TicketDetailModalProps) {
  const queryClient = useQueryClient();
  const { hasPermission, roleTier, user } = usePermissions();
  const canApprove = hasPermission(Permissions.APPROVAL_REVIEW);
  const canPostInternal = hasPermission(Permissions.COMMENT_VIEW_INTERNAL);
  const [newComment, setNewComment] = useState('');
  const [commentScope, setCommentScope] = useState<'PUBLIC' | 'INTERNAL_ONLY'>('PUBLIC');
  const [conflictError, setConflictError] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Assignment & Task Editing Guard:
  // Regular employees (Tier 1) can only edit, change status, priority, or deadline on tasks assigned to themselves.
  const isAssignedToCurrentUser = Boolean(user?.id && ticket?.assigneeId === user.id);
  const isHigherAuthority = roleTier >= 2;
  const canEditTask = isHigherAuthority || isAssignedToCurrentUser || (!ticket?.assigneeId && ticket?.reporterId === user?.id);

  const isDeadlineLocked = Boolean(
    ticket?.dueDate &&
    ticket.dueDateSetByRoleTier &&
    roleTier < ticket.dueDateSetByRoleTier
  );

  // Assignment by Higher Authority Protection:
  // Tasks assigned by higher authorities cannot be deleted.
  const isAssigned = Boolean(ticket?.assigneeId);
  const assignerTier = ticket?.assignedByRoleTier || ticket?.dueDateSetByRoleTier || 1;
  const isAssignedByHigherAuthority = Boolean(
    isAssigned &&
    assignerTier > 1 &&
    roleTier < assignerTier
  );

  const deleteMutation = useMutation({
    mutationFn: () => deleteTicket(ticket!.ticketKey),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tickets'] });
      queryClient.invalidateQueries({ queryKey: ['projectMetrics'] });
      onClose();
    },
    onError: (err: Error) => {
      setDeleteError(err.message);
      setIsDeleting(false);
    },
  });

  const handleDeleteTicket = () => {
    if (isAssignedByHigherAuthority) {
      alert(`Cannot delete: This task was assigned by a higher authority (Tier ${assignerTier}) and cannot be deleted.`);
      return;
    }

    if (
      confirm(
        `Are you sure you want to delete task ${ticket?.displayKey || ticket?.ticketKey} ("${ticket?.title}")?\n\nThis will remove all associated comments, dependencies, and attachments. This action cannot be undone.`
      )
    ) {
      setIsDeleting(true);
      deleteMutation.mutate();
    }
  };

  const { data: comments = [], isLoading: isLoadingComments } = useQuery({
    queryKey: ['comments', ticket?.ticketKey],
    queryFn: () => (ticket ? fetchComments(ticket.ticketKey) : Promise.resolve([])),
    enabled: !!ticket,
  });

  const commentMutation = useMutation({
    mutationFn: ({ body, scope }: { body: string; scope: 'PUBLIC' | 'INTERNAL_ONLY' }) =>
      createComment(ticket!.ticketKey, { body, visibilityScope: scope }),
    onSuccess: () => {
      setNewComment('');
      queryClient.invalidateQueries({ queryKey: ['comments', ticket?.ticketKey] });
    },
  });

  const statusMutation = useMutation({
    mutationFn: (newStatus: Ticket['status']) =>
      updateTicket(ticket!.ticketKey, {
        status: newStatus,
        lockVersion: ticket!.lockVersion,
      }),
    onSuccess: (updated) => {
      setConflictError(null);
      queryClient.invalidateQueries({ queryKey: ['tickets'] });
      ticket!.status = updated.status;
      ticket!.lockVersion = updated.lockVersion;
    },
    onError: (err: Error) => {
      setConflictError(err.message);
    },
  });

  const { data: availableUsers = [] } = useQuery({
    queryKey: ['availableUsers'],
    queryFn: fetchAvailableUsers,
    enabled: !!ticket,
  });

  const assigneeMutation = useMutation({
    mutationFn: (newAssigneeId: string | null) => {
      // Smart Auto-Default: if assigning a member and ticket has no deadline, set default 7 days!
      let autoDueDate: string | undefined = undefined;
      if (newAssigneeId && !ticket!.dueDate) {
        const d = new Date();
        d.setDate(d.getDate() + 7);
        autoDueDate = d.toISOString();
      }
      return updateTicket(ticket!.ticketKey, {
        assigneeId: newAssigneeId,
        ...(autoDueDate ? { dueDate: autoDueDate } : {}),
        lockVersion: ticket!.lockVersion,
      });
    },
    onSuccess: (updated) => {
      setConflictError(null);
      queryClient.invalidateQueries({ queryKey: ['tickets'] });
      ticket!.assigneeId = updated.assigneeId;
      ticket!.dueDate = updated.dueDate;
      ticket!.assignee = updated.assignee;
      ticket!.lockVersion = updated.lockVersion;
    },
    onError: (err: Error) => {
      setConflictError(err.message);
    },
  });

  const dueDateMutation = useMutation({
    mutationFn: (newDueDate: string | null) =>
      updateTicket(ticket!.ticketKey, {
        dueDate: newDueDate,
        lockVersion: ticket!.lockVersion,
      }),
    onSuccess: (updated) => {
      setConflictError(null);
      queryClient.invalidateQueries({ queryKey: ['tickets'] });
      ticket!.dueDate = updated.dueDate;
      ticket!.lockVersion = updated.lockVersion;
    },
    onError: (err: Error) => {
      setConflictError(err.message);
    },
  });

  const priorityMutation = useMutation({
    mutationFn: (newPriority: Ticket['priority']) =>
      updateTicket(ticket!.ticketKey, {
        priority: newPriority,
        lockVersion: ticket!.lockVersion,
      }),
    onSuccess: (updated) => {
      setConflictError(null);
      queryClient.invalidateQueries({ queryKey: ['tickets'] });
      ticket!.priority = updated.priority;
      ticket!.lockVersion = updated.lockVersion;
    },
    onError: (err: Error) => {
      setConflictError(err.message);
    },
  });

  // Dependencies Query & Mutations
  const { data: depsData = { outward: [], inward: [] } } = useQuery({
    queryKey: ['ticketDependencies', ticket?.ticketKey],
    queryFn: () => (ticket ? fetchTicketDependencies(ticket.ticketKey) : Promise.resolve({ outward: [], inward: [] })),
    enabled: !!ticket,
  });

  const urlParams = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : null;
  const [depMode, setDepMode] = useState<'TASK' | 'TEXT'>(
    (urlParams?.get('depMode') as 'TASK' | 'TEXT') || 'TASK'
  );
  const [selectedProjectKey, setSelectedProjectKey] = useState<string>(
    ticket?.ticketKey ? ticket.ticketKey.split('-')[0] : 'CORE'
  );
  const [taskSearchQuery, setTaskSearchQuery] = useState('');
  const [linkTargetKey, setLinkTargetKey] = useState('');
  const [externalDepText, setExternalDepText] = useState('');
  const [linkType, setLinkType] = useState<'BLOCKS' | 'BLOCKED_BY' | 'RELATES_TO'>('BLOCKS');
  const [isLinking, setIsLinking] = useState(urlParams?.get('linking') === 'true');
  const [depError, setDepError] = useState<string | null>(null);

  const { data: allProjects = [] } = useQuery({
    queryKey: ['projects'],
    queryFn: fetchProjects,
    enabled: isLinking,
  });

  const { data: searchableTasks = [], isLoading: isLoadingProjectTasks } = useQuery({
    queryKey: ['projectTasks', selectedProjectKey, taskSearchQuery, ticket?.ticketKey],
    queryFn: () =>
      selectedProjectKey
        ? searchProjectTasks(selectedProjectKey, taskSearchQuery, ticket?.ticketKey)
        : Promise.resolve([]),
    enabled: isLinking && depMode === 'TASK' && !!selectedProjectKey,
  });

  const addDepMutation = useMutation({
    mutationFn: (data: {
      targetKey?: string;
      externalText?: string;
      type: 'BLOCKS' | 'BLOCKED_BY' | 'RELATES_TO';
    }) =>
      createTicketDependency(ticket!.ticketKey, {
        targetTicketKey: data.targetKey,
        externalText: data.externalText,
        dependencyType: data.type,
      }),
    onSuccess: () => {
      setDepError(null);
      setLinkTargetKey('');
      setExternalDepText('');
      setIsLinking(false);
      queryClient.invalidateQueries({ queryKey: ['ticketDependencies', ticket?.ticketKey] });
    },
    onError: (err: Error) => {
      setDepError(err.message);
    },
  });

  const removeDepMutation = useMutation({
    mutationFn: (depId: string) => deleteTicketDependency(ticket!.ticketKey, depId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ticketDependencies', ticket?.ticketKey] });
    },
  });

  // GitHub VCS Live Sync
  const [syncStatusMsg, setSyncStatusMsg] = useState<string | null>(null);
  const syncGithubMutation = useMutation({
    mutationFn: () => {
      const projKey = ticket!.ticketKey.split('-')[0];
      return syncProjectGithub(projKey);
    },
    onSuccess: (res) => {
      setSyncStatusMsg(`Synced ${res.syncedItemsCount} items (${res.matchedTicketsCount} matched)`);
      queryClient.invalidateQueries({ queryKey: ['ticketVcsLinks', ticket?.ticketKey] });
      queryClient.invalidateQueries({ queryKey: ['tickets'] });
      setTimeout(() => setSyncStatusMsg(null), 4000);
    },
    onError: (err: Error) => {
      setSyncStatusMsg(`Sync error: ${err.message}`);
      setTimeout(() => setSyncStatusMsg(null), 4000);
    },
  });

  // Attachments Query & Mutation
  const { data: attachments = [] } = useQuery({
    queryKey: ['ticketAttachments', ticket?.ticketKey],
    queryFn: () => (ticket ? fetchTicketAttachments(ticket.ticketKey) : Promise.resolve([])),
    enabled: !!ticket,
  });

  const uploadAttachmentMutation = useMutation({
    mutationFn: async (file: File) => {
      // 1. Get presigned upload URL from AWS S3 API
      const presigned = await presignTicketAttachment(ticket!.ticketKey, {
        fileName: file.name,
        fileSize: file.size,
        mimeType: file.type || 'application/octet-stream',
      });

      // 2. Direct binary PUT upload from browser directly to AWS S3 bucket
      if (presigned.uploadUrl) {
        try {
          await fetch(presigned.uploadUrl, {
            method: 'PUT',
            body: file,
            headers: {
              'Content-Type': file.type || 'application/octet-stream',
            },
          });
        } catch {
          // preserve registration
        }
      }
      return presigned;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ticketAttachments', ticket?.ticketKey] });
    },
  });

  // Approvals Query & Mutations
  const [isRequestingApproval, setIsRequestingApproval] = useState(false);
  const [approverEmailInput, setApproverEmailInput] = useState('');
  const [approverTierInput, setApproverTierInput] = useState(1);
  const [decisionComment, setDecisionComment] = useState('');

  const { data: approvals = [] } = useQuery<TicketApproval[]>({
    queryKey: ['ticketApprovals', ticket?.ticketKey],
    queryFn: () => (ticket ? fetchTicketApprovals(ticket.ticketKey) : Promise.resolve([])),
    enabled: !!ticket,
  });

  const approvalDecisionMutation = useMutation({
    mutationFn: (data: { approvalId: string; decision: 'APPROVED' | 'REJECTED'; comment?: string }) =>
      submitApprovalDecision(ticket!.ticketKey, data.approvalId, { decision: data.decision, comment: data.comment }),
    onSuccess: () => {
      setDecisionComment('');
      queryClient.invalidateQueries({ queryKey: ['ticketApprovals', ticket?.ticketKey] });
      queryClient.invalidateQueries({ queryKey: ['tickets'] });
      queryClient.invalidateQueries({ queryKey: ['comments', ticket?.ticketKey] });
    },
  });

  const requestApprovalMutation = useMutation({
    mutationFn: (data: { approverEmail?: string; tier?: number }) =>
      requestTicketApproval(ticket!.ticketKey, data),
    onSuccess: () => {
      setIsRequestingApproval(false);
      setApproverEmailInput('');
      queryClient.invalidateQueries({ queryKey: ['ticketApprovals', ticket?.ticketKey] });
      queryClient.invalidateQueries({ queryKey: ['tickets'] });
    },
  });

  // VCS / Git Links Query
  const { data: vcsLinks = [] } = useQuery<TicketVcsLink[]>({
    queryKey: ['ticketVcsLinks', ticket?.ticketKey],
    queryFn: () => (ticket ? fetchTicketVcsLinks(ticket.ticketKey) : Promise.resolve([])),
    enabled: !!ticket,
  });

  if (!ticket) return null;

  async function handleAddComment(e: React.FormEvent) {
    e.preventDefault();
    if (!newComment.trim()) return;
    await commentMutation.mutateAsync({ body: newComment.trim(), scope: commentScope });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 dark:bg-black/60 backdrop-blur-xs">
      <div className="relative w-full max-w-4xl max-h-[90vh] flex flex-col rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-2xl overflow-hidden transition-colors">
        {/* Modal Header */}
        <div className="flex items-center justify-between px-6 py-3.5 border-b border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/40">
          <div className="flex items-center gap-3">
            <span className="font-mono text-xs font-bold text-slate-500 dark:text-slate-400">
              {ticket.displayKey || ticket.ticketKey}
            </span>
            <span className="px-2 py-0.5 rounded bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-[10px] font-mono text-slate-600 dark:text-slate-300">
              v{ticket.lockVersion}
            </span>
            {ticket.slaResolutionDueAt && (
              <SLABadge
                dueAt={ticket.slaResolutionDueAt}
                isPaused={ticket.isSlaPaused}
                isResolved={ticket.status === 'DONE' || ticket.status === 'RESOLVED'}
                label="Resolution SLA:"
              />
            )}
          </div>

          <div className="flex items-center gap-2">
            {isAssignedByHigherAuthority ? (
              <div
                className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 text-[11px] font-semibold text-amber-700 dark:text-amber-400"
                title={`This task was assigned by a Tier ${assignerTier} authority and cannot be deleted by Tier ${roleTier}.`}
              >
                <Lock className="h-3 w-3 text-amber-600 dark:text-amber-400" />
                <span>Assigned by Tier {assignerTier}</span>
              </div>
            ) : null}

            <button
              type="button"
              onClick={handleDeleteTicket}
              disabled={isAssignedByHigherAuthority || isDeleting}
              title={
                isAssignedByHigherAuthority
                  ? `Cannot delete: Assigned by higher authority (Tier ${assignerTier})`
                  : 'Permanently delete this task'
              }
              className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold transition ${
                isAssignedByHigherAuthority
                  ? 'bg-slate-100 dark:bg-slate-800 text-slate-400 dark:text-slate-500 cursor-not-allowed border border-slate-200 dark:border-slate-700'
                  : 'bg-rose-50 hover:bg-rose-100 dark:bg-rose-950/40 dark:hover:bg-rose-900/60 text-rose-600 dark:text-rose-400 border border-rose-200 dark:border-rose-900/60 cursor-pointer'
              }`}
            >
              <Trash2 className="h-3.5 w-3.5" />
              <span>{isDeleting ? 'Deleting...' : 'Delete Task'}</span>
            </button>

            <button
              onClick={onClose}
              className="p-1 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition cursor-pointer"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* Delete Error Alert */}
        {deleteError && (
          <div className="p-3 mx-6 mt-4 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 text-rose-800 dark:text-rose-200 text-xs flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 shrink-0 text-rose-600" />
              <span>{deleteError}</span>
            </div>
            <button onClick={() => setDeleteError(null)} className="text-slate-400 hover:text-slate-600 cursor-pointer">
              <X className="h-4 w-4" />
            </button>
          </div>
        )}

        {/* Optimistic Conflict Alert */}
        {conflictError && (
          <div className="p-3 mx-6 mt-4 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 text-rose-800 dark:text-rose-200 text-xs flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 shrink-0 text-rose-600" />
            <span>{conflictError} Please refresh to see the latest version.</span>
          </div>
        )}

        {/* Read-Only Restriction Alert for Employees */}
        {!canEditTask && (
          <div className="p-3 mx-6 mt-4 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 text-amber-800 dark:text-amber-200 text-xs flex items-center gap-2">
            <Lock className="h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
            <span>
              <strong>Read-Only Mode:</strong> This task is assigned to {ticket?.assignee?.fullName || 'another team member'}. Only the assigned person or higher authorities can edit or update status, priority, or deadline.
            </span>
          </div>
        )}

        {/* Two-Column Jira/Linear Layout */}
        <div className="flex-1 min-h-0 flex flex-col md:flex-row overflow-y-auto md:overflow-hidden">
          {/* LEFT COLUMN: Main Stream (Title, Description, Comments) */}
          <div className="flex-1 p-4 md:p-6 space-y-6 md:border-r border-slate-200 dark:border-slate-800 md:overflow-y-auto">
            {/* ITSM Staged Multi-Tier Approvals Banner */}
            {(approvals.length > 0 || ticket.status === 'PENDING_APPROVAL') && (
              <div className="p-4 rounded-xl border border-blue-200 dark:border-blue-900 bg-blue-50/50 dark:bg-blue-950/20 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <ShieldCheck className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                    <div>
                      <h4 className="text-xs font-bold text-slate-900 dark:text-slate-100">
                        ITSM Staged Multi-Tier Approvals
                      </h4>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400">
                        {ticket.isSlaPaused
                          ? 'SLA clock is auto-paused pending formal sign-off.'
                          : 'All required management approval tiers recorded.'}
                      </p>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => setIsRequestingApproval(!isRequestingApproval)}
                    className="flex items-center gap-1 text-[11px] font-semibold text-blue-600 dark:text-blue-400 hover:underline"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    <span>{isRequestingApproval ? 'Cancel' : 'Add Stage'}</span>
                  </button>
                </div>

                {/* Inline Request New Approval Tier Form */}
                {isRequestingApproval && (
                  <div className="p-3 rounded-lg border border-blue-200 dark:border-blue-900 bg-white dark:bg-slate-900 space-y-2">
                    <div className="flex items-center gap-2">
                      <div className="w-20">
                        <label className="block text-[10px] text-slate-400 mb-0.5">Tier</label>
                        <input
                          type="number"
                          min="1"
                          max="5"
                          value={approverTierInput}
                          onChange={(e) => setApproverTierInput(parseInt(e.target.value) || 1)}
                          className="w-full px-2 py-1 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs text-slate-900 dark:text-slate-100"
                        />
                      </div>
                      <div className="flex-1">
                        <label className="block text-[10px] text-slate-400 mb-0.5">Approver Email (optional)</label>
                        <input
                          type="email"
                          placeholder="e.g. manager@amrita.edu"
                          value={approverEmailInput}
                          onChange={(e) => setApproverEmailInput(e.target.value)}
                          className="w-full px-2 py-1 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs text-slate-900 dark:text-slate-100"
                        />
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() =>
                        requestApprovalMutation.mutate({
                          tier: approverTierInput,
                          approverEmail: approverEmailInput.trim() || undefined,
                        })
                      }
                      disabled={requestApprovalMutation.isPending}
                      className="px-3 py-1 rounded bg-blue-600 text-white text-xs font-semibold hover:bg-blue-700 disabled:opacity-50"
                    >
                      Request Sign-off
                    </button>
                  </div>
                )}

                {/* Approval Tiers List */}
                <div className="space-y-2">
                  {approvals.map((appr) => {
                    const isPending = appr.status === 'PENDING';
                    const isApproved = appr.status === 'APPROVED';
                    return (
                      <div
                        key={appr.id}
                        className="p-3 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-2"
                      >
                        <div className="flex items-center gap-2">
                          <span className="px-2 py-0.5 rounded font-mono font-bold text-[10px] bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
                            Tier {appr.tier}
                          </span>
                          <span
                            className={`px-2 py-0.5 rounded-full font-semibold text-[10px] ${
                              isApproved
                                ? 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800'
                                : isPending
                                  ? 'bg-amber-50 dark:bg-amber-950/60 text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-800'
                                  : 'bg-rose-50 dark:bg-rose-950/60 text-rose-700 dark:text-rose-400 border border-rose-200 dark:border-rose-800'
                            }`}
                          >
                            {appr.status}
                          </span>
                          {appr.comment && (
                            <span className="text-slate-500 italic truncate max-w-[200px]">
                              "{appr.comment}"
                            </span>
                          )}
                        </div>

                        {/* Actions for Pending Decisions */}
                        {isPending && (
                          <div className="flex items-center gap-1.5 self-end sm:self-auto">
                            <button
                              type="button"
                              onClick={() =>
                                approvalDecisionMutation.mutate({
                                  approvalId: appr.id,
                                  decision: 'APPROVED',
                                })
                              }
                              disabled={approvalDecisionMutation.isPending || !canApprove}
                              title={!canApprove ? 'Requires Approval Review permission' : undefined}
                              className={`px-2.5 py-1 rounded-md bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs flex items-center gap-1 ${
                                !canApprove ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer'
                              }`}
                            >
                              <CheckCircle2 className="h-3.5 w-3.5" />
                              Approve
                            </button>
                            <button
                              type="button"
                              onClick={() =>
                                approvalDecisionMutation.mutate({
                                  approvalId: appr.id,
                                  decision: 'REJECTED',
                                })
                              }
                              disabled={approvalDecisionMutation.isPending || !canApprove}
                              title={!canApprove ? 'Requires Approval Review permission' : undefined}
                              className={`px-2.5 py-1 rounded-md bg-rose-600 hover:bg-rose-700 text-white font-semibold text-xs flex items-center gap-1 ${
                                !canApprove ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer'
                              }`}
                            >
                              <XCircle className="h-3.5 w-3.5" />
                              Reject
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Title & Description */}
            <div>
              <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100 mb-3 leading-snug">
                {ticket.title}
              </h2>
              <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/30 text-xs md:text-sm text-slate-800 dark:text-slate-200 leading-relaxed whitespace-pre-wrap">
                {ticket.description || (
                  <span className="text-slate-400 italic">No description provided.</span>
                )}
              </div>
            </div>

            {/* Linked Dependencies Section */}
            <div className="pt-4 border-t border-slate-200 dark:border-slate-800">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                  <Link2 className="h-4 w-4 text-blue-600" />
                  Task Dependencies ({depsData.outward.length + depsData.inward.length})
                </h3>
                <button
                  type="button"
                  onClick={() => setIsLinking(!isLinking)}
                  className="flex items-center gap-1 text-xs text-blue-600 dark:text-blue-400 font-semibold hover:underline"
                >
                  <Plus className="h-3.5 w-3.5" />
                  <span>{isLinking ? 'Cancel' : 'Add Dependency'}</span>
                </button>
              </div>

              {depError && (
                <div className="mb-3 p-2.5 rounded-lg bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 text-rose-800 dark:text-rose-200 text-xs flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 shrink-0 text-rose-600" />
                  <span>{depError}</span>
                </div>
              )}

              {/* Inline Link Dependency Form with Mode Switcher */}
              {isLinking && (
                <div className="mb-4 p-3.5 rounded-xl border border-blue-200 dark:border-blue-900 bg-blue-50/50 dark:bg-blue-950/30 space-y-3">
                  {/* Mode Tabs */}
                  <div className="flex items-center gap-2 border-b border-blue-200 dark:border-blue-900/60 pb-2">
                    <button
                      type="button"
                      onClick={() => setDepMode('TASK')}
                      className={`px-3 py-1 rounded-md text-xs font-semibold flex items-center gap-1.5 transition ${
                        depMode === 'TASK'
                          ? 'bg-blue-600 text-white shadow-2xs'
                          : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:text-slate-900'
                      }`}
                    >
                      <Link2 className="h-3.5 w-3.5" /> Link Project Task
                    </button>
                    <button
                      type="button"
                      onClick={() => setDepMode('TEXT')}
                      className={`px-3 py-1 rounded-md text-xs font-semibold flex items-center gap-1.5 transition ${
                        depMode === 'TEXT'
                          ? 'bg-blue-600 text-white shadow-2xs'
                          : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:text-slate-900'
                      }`}
                    >
                      <FileText className="h-3.5 w-3.5" /> Text Blocker / Note
                    </button>
                  </div>

                  {/* Relationship Type */}
                  <div className="flex items-center gap-2">
                    <label className="text-[11px] font-medium text-slate-600 dark:text-slate-400">Relationship:</label>
                    <select
                      value={linkType}
                      onChange={(e) => setLinkType(e.target.value as 'BLOCKS' | 'BLOCKED_BY' | 'RELATES_TO')}
                      className="px-2.5 py-1 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-semibold text-slate-800 dark:text-slate-200"
                    >
                      <option value="BLOCKS">Blocks (this task blocks target)</option>
                      <option value="BLOCKED_BY">Is Blocked By (target blocks this task)</option>
                      <option value="RELATES_TO">Relates To</option>
                    </select>
                  </div>

                  {/* Mode A: Select Project + Pick Specific Task */}
                  {depMode === 'TASK' && (
                    <div className="space-y-2">
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        <div>
                          <label className="block text-[10px] text-slate-500 font-medium mb-1">Target Project</label>
                          <select
                            value={selectedProjectKey}
                            onChange={(e) => {
                              setSelectedProjectKey(e.target.value);
                              setLinkTargetKey('');
                            }}
                            className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-semibold text-slate-800 dark:text-slate-200"
                          >
                            {allProjects.map((p) => (
                              <option key={p.key} value={p.key}>
                                {p.name} ({p.key})
                              </option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <label className="block text-[10px] text-slate-500 font-medium mb-1">Search Task (Title or Key)</label>
                          <div className="relative">
                            <Search className="h-3.5 w-3.5 absolute left-2.5 top-2 text-slate-400" />
                            <input
                              type="text"
                              placeholder="Type to filter tasks..."
                              value={taskSearchQuery}
                              onChange={(e) => setTaskSearchQuery(e.target.value)}
                              className="w-full pl-8 pr-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs text-slate-900 dark:text-slate-100"
                            />
                          </div>
                        </div>
                      </div>

                      {/* Task Selector Dropdown */}
                      <div>
                        <label className="block text-[10px] text-slate-500 font-medium mb-1">Select Task from {selectedProjectKey}</label>
                        {isLoadingProjectTasks ? (
                          <div className="text-xs text-slate-400 p-2">Loading project tasks...</div>
                        ) : searchableTasks.length === 0 ? (
                          <div className="text-xs text-slate-400 italic p-2 bg-white dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-800">
                            No other tasks found in project {selectedProjectKey}.
                          </div>
                        ) : (
                          <select
                            value={linkTargetKey}
                            onChange={(e) => setLinkTargetKey(e.target.value)}
                            className="w-full px-2.5 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-medium text-slate-900 dark:text-slate-100"
                          >
                            <option value="">-- Choose a task to link --</option>
                            {searchableTasks.map((t) => (
                              <option key={t.ticketKey} value={t.ticketKey}>
                                [{t.ticketKey}] {t.title} ({t.status})
                              </option>
                            ))}
                          </select>
                        )}
                      </div>

                      <div className="flex justify-end pt-1">
                        <button
                          type="button"
                          onClick={() => {
                            if (!linkTargetKey) return;
                            addDepMutation.mutate({ targetKey: linkTargetKey, type: linkType });
                          }}
                          disabled={addDepMutation.isPending || !linkTargetKey}
                          className="px-4 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold disabled:opacity-40"
                        >
                          {addDepMutation.isPending ? 'Linking...' : 'Link Task'}
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Mode B: Text Blocker Dependency */}
                  {depMode === 'TEXT' && (
                    <div className="space-y-2">
                      <label className="block text-[10px] text-slate-500 font-medium mb-1">
                        Blocker Description / External Dependency
                      </label>
                      <input
                        type="text"
                        placeholder="e.g. Waiting on client API key provision, Vendor license renewal required"
                        value={externalDepText}
                        onChange={(e) => setExternalDepText(e.target.value)}
                        className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs text-slate-900 dark:text-slate-100"
                      />
                      <div className="flex justify-end pt-1">
                        <button
                          type="button"
                          onClick={() => {
                            if (!externalDepText.trim()) return;
                            addDepMutation.mutate({ externalText: externalDepText.trim(), type: linkType });
                          }}
                          disabled={addDepMutation.isPending || !externalDepText.trim()}
                          className="px-4 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold disabled:opacity-40"
                        >
                          {addDepMutation.isPending ? 'Saving...' : 'Add Text Blocker'}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Dependency Badges */}
              <div className="space-y-2">
                {depsData.outward.length === 0 && depsData.inward.length === 0 ? (
                  <p className="text-xs text-slate-400 italic">No linked dependencies.</p>
                ) : (
                  <>
                    {depsData.outward.map((dep) => (
                      <div
                        key={dep.id}
                        className="flex items-center justify-between p-2.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/40 text-xs"
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="px-2 py-0.5 rounded text-[10px] uppercase font-bold bg-blue-100 dark:bg-blue-950/60 text-blue-700 dark:text-blue-400">
                            {dep.dependencyType.toLowerCase()}
                          </span>
                          {dep.externalText ? (
                            <div className="flex items-center gap-1.5 min-w-0">
                              <span className="px-1.5 py-0.5 rounded text-[10px] font-bold uppercase bg-amber-100 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300 border border-amber-200 dark:border-amber-800">
                                Text Blocker
                              </span>
                              <span className="font-medium text-slate-800 dark:text-slate-200 truncate">{dep.externalText}</span>
                            </div>
                          ) : (
                            <div className="flex items-center gap-2 min-w-0">
                              <span className="font-mono font-semibold text-slate-800 dark:text-slate-200">{dep.targetKey}</span>
                              <span className="truncate text-slate-600 dark:text-slate-400">{dep.targetTitle}</span>
                              {dep.targetStatus && (
                                <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300">
                                  {dep.targetStatus}
                                </span>
                              )}
                            </div>
                          )}
                        </div>
                        <button
                          onClick={() => removeDepMutation.mutate(dep.id)}
                          className="text-slate-400 hover:text-rose-600 p-1"
                          title="Remove dependency"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    ))}
                    {depsData.inward.map((dep) => (
                      <div
                        key={dep.id}
                        className="flex items-center justify-between p-2.5 rounded-lg border border-amber-200 dark:border-amber-900/60 bg-amber-50/50 dark:bg-amber-950/20 text-xs"
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="px-2 py-0.5 rounded text-[10px] uppercase font-bold bg-amber-100 dark:bg-amber-950/60 text-amber-800 dark:text-amber-400">
                            is blocked by
                          </span>
                          <span className="font-mono font-semibold text-slate-800 dark:text-slate-200">{dep.sourceKey}</span>
                          <span className="truncate text-slate-600 dark:text-slate-400">{dep.sourceTitle}</span>
                          {dep.sourceStatus && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300">
                              {dep.sourceStatus}
                            </span>
                          )}
                        </div>
                        <button
                          onClick={() => removeDepMutation.mutate(dep.id)}
                          className="text-slate-400 hover:text-rose-600 p-1"
                          title="Remove dependency"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    ))}
                  </>
                )}
              </div>
            </div>

            {/* Attachments Section */}
            <div className="pt-4 border-t border-slate-200 dark:border-slate-800">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                  <Paperclip className="h-4 w-4 text-slate-500" />
                  Attachments ({attachments.length})
                </h3>
                <label className="flex items-center gap-1 text-xs text-blue-600 dark:text-blue-400 font-semibold hover:underline cursor-pointer">
                  <Plus className="h-3.5 w-3.5" />
                  <span>Attach File</span>
                  <input
                    type="file"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) {
                        uploadAttachmentMutation.mutate(file);
                        e.target.value = '';
                      }
                    }}
                  />
                </label>
              </div>

              {attachments.length === 0 ? (
                <p className="text-xs text-slate-400 italic">No files attached to this task.</p>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {attachments.map((att) => (
                    <div
                      key={att.id}
                      className="flex items-center justify-between p-2.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/40 text-xs"
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <Paperclip className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                        <div className="min-w-0">
                          <span className="block truncate font-medium text-slate-800 dark:text-slate-200">
                            {att.fileName}
                          </span>
                          <span className="block text-[10px] text-slate-400">
                            {(att.fileSize / 1024).toFixed(1)} KB
                          </span>
                        </div>
                      </div>
                      <a
                        href={`http://localhost:9000/coretrack-attachments/${att.s3Key}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-blue-600 hover:text-blue-800 p-1"
                      >
                        <Download className="h-3.5 w-3.5" />
                      </a>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Git Development / Pull Requests / Commits */}
            <div className="pt-4 border-t border-slate-200 dark:border-slate-800">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                  <GitPullRequest className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                  Development & Git Links ({vcsLinks.length})
                </h3>
                <button
                  type="button"
                  onClick={() => syncGithubMutation.mutate()}
                  disabled={syncGithubMutation.isPending}
                  className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 transition"
                  title="Sync commits and pull requests from configured GitHub repo"
                >
                  <RefreshCw className={`h-3 w-3 ${syncGithubMutation.isPending ? 'animate-spin text-blue-600' : ''}`} />
                  <span>{syncGithubMutation.isPending ? 'Syncing...' : 'Sync GitHub'}</span>
                </button>
              </div>

              {syncStatusMsg && (
                <div className="mb-2 p-2 rounded-lg bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-900 text-blue-800 dark:text-blue-200 text-xs">
                  {syncStatusMsg}
                </div>
              )}

              {vcsLinks.length === 0 ? (
                <p className="text-xs text-slate-400 italic">
                  No linked Pull Requests or Git commits yet. Reference <span className="font-mono text-slate-500 font-semibold">{ticket.ticketKey}</span> in commits or PR branch names.
                </p>
              ) : (
                <div className="space-y-2">
                  {vcsLinks.map((link) => (
                    <div
                      key={link.id}
                      className="flex items-center justify-between p-2.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/40 text-xs"
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        {link.linkType === 'PULL_REQUEST' ? (
                          <GitPullRequest className="h-4 w-4 text-purple-600 shrink-0" />
                        ) : (
                          <GitCommit className="h-4 w-4 text-blue-600 shrink-0" />
                        )}
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="font-semibold text-slate-800 dark:text-slate-200 truncate">
                              {link.title}
                            </span>
                            {link.status && (
                              <span
                                className={`px-1.5 py-0.5 rounded text-[10px] font-bold uppercase ${
                                  link.status === 'MERGED'
                                    ? 'bg-purple-100 dark:bg-purple-950/60 text-purple-700 dark:text-purple-300'
                                    : link.status === 'OPEN'
                                      ? 'bg-blue-100 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300'
                                      : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400'
                                }`}
                              >
                                {link.status}
                              </span>
                            )}
                          </div>
                          {link.branchName && (
                            <span className="text-[10px] text-slate-400 font-mono">
                              {link.branchName}
                            </span>
                          )}
                        </div>
                      </div>

                      <a
                        href={link.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-blue-600 hover:text-blue-800 dark:text-blue-400 p-1 flex items-center gap-1 font-semibold"
                      >
                        <span>View</span>
                        <ExternalLink className="h-3 w-3" />
                      </a>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Comments & Discussion */}
            <div className="pt-4 border-t border-slate-200 dark:border-slate-800">
              <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100 mb-4 flex items-center gap-2">
                <MessageSquare className="h-4 w-4 text-slate-500" />
                Activity & Discussion ({comments.length})
              </h3>

              {/* Comment Stream */}
              <div className="space-y-3 mb-6">
                {isLoadingComments ? (
                  <p className="text-xs text-slate-400">Loading comments...</p>
                ) : comments.length === 0 ? (
                  <p className="text-xs text-slate-400 italic">No comments yet. Leave a note below.</p>
                ) : (
                  comments.map((comment) => {
                    const isInternal = comment.visibilityScope === 'INTERNAL_ONLY';
                    return (
                      <div
                        key={comment.id}
                        className={`p-3.5 rounded-xl border transition ${
                          isInternal
                            ? 'border-amber-200 dark:border-amber-900/60 bg-amber-50/70 dark:bg-amber-950/20 text-amber-950 dark:text-amber-200'
                            : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100'
                        }`}
                      >
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center gap-2">
                            <div className="h-5 w-5 rounded-full bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 flex items-center justify-center text-[10px] font-bold">
                              {(comment.authorName || 'U').charAt(0).toUpperCase()}
                            </div>
                            <span className="text-xs font-semibold">
                              {comment.authorName || 'Staff Member'}
                            </span>
                            <span className="text-[10px] text-slate-400">
                              {new Date(comment.createdAt).toLocaleTimeString([], {
                                hour: '2-digit',
                                minute: '2-digit',
                              })}
                            </span>
                          </div>

                          {isInternal ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-100 dark:bg-amber-950/60 border border-amber-300 dark:border-amber-800 text-amber-900 dark:text-amber-300 text-[10px] font-semibold">
                              <Lock className="h-3 w-3" /> Internal Staff Note
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 text-[10px]">
                              <Globe className="h-3 w-3" /> Public Reply
                            </span>
                          )}
                        </div>

                        <p className="text-xs whitespace-pre-wrap leading-relaxed pl-7">
                          {comment.body}
                        </p>
                      </div>
                    );
                  })
                )}
              </div>

              {/* Add Comment Box */}
              <form onSubmit={handleAddComment} className="space-y-3">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setCommentScope('PUBLIC')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition ${
                      commentScope === 'PUBLIC'
                        ? 'bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 shadow-2xs'
                        : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:text-slate-900'
                    }`}
                  >
                    <Globe className="h-3.5 w-3.5" /> Public Reply
                  </button>
                  <button
                    type="button"
                    onClick={() => canPostInternal && setCommentScope('INTERNAL_ONLY')}
                    disabled={!canPostInternal}
                    title={!canPostInternal ? 'Requires Internal Notes permission' : undefined}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition ${
                      !canPostInternal
                        ? 'opacity-40 cursor-not-allowed bg-slate-100 dark:bg-slate-800 text-slate-400'
                        : commentScope === 'INTERNAL_ONLY'
                        ? 'bg-amber-100 dark:bg-amber-950 text-amber-900 dark:text-amber-300 border border-amber-300 dark:border-amber-800 shadow-2xs cursor-pointer'
                        : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:text-slate-900 cursor-pointer'
                    }`}
                  >
                    <Lock className="h-3.5 w-3.5 text-amber-700 dark:text-amber-400" /> Internal Note (Staff Only)
                  </button>
                </div>

                <div className="relative">
                  <textarea
                    rows={3}
                    placeholder={
                      commentScope === 'INTERNAL_ONLY'
                        ? 'Write a private note visible to internal staff only...'
                        : 'Post a public reply visible to all collaborators...'
                    }
                    value={newComment}
                    onChange={(e) => setNewComment(e.target.value)}
                    className={`w-full p-3 pr-24 rounded-xl border text-xs text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:outline-none transition ${
                      commentScope === 'INTERNAL_ONLY'
                        ? 'border-amber-300 dark:border-amber-800 bg-amber-50/40 dark:bg-amber-950/20 focus:border-amber-500'
                        : 'border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 focus:border-blue-600'
                    }`}
                  />
                  <button
                    type="submit"
                    disabled={!newComment.trim() || commentMutation.isPending}
                    className="absolute right-2.5 bottom-3.5 px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold flex items-center gap-1.5 shadow-2xs disabled:opacity-40 transition"
                  >
                    <Send className="h-3 w-3" /> Post
                  </button>
                </div>
              </form>
            </div>
          </div>

          {/* RIGHT COLUMN: Contextual Properties Sidebar */}
          <div className="w-full md:w-72 p-4 md:p-6 bg-slate-50/50 dark:bg-slate-900/30 space-y-5 text-xs md:overflow-y-auto">
            <span className="block text-[10px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Task Properties
            </span>

            {/* Status Select */}
            <div>
              <label className="block text-slate-500 dark:text-slate-400 mb-1 font-medium">Status</label>
              <select
                value={ticket.status}
                onChange={(e) => statusMutation.mutate(e.target.value as Ticket['status'])}
                disabled={!canEditTask || statusMutation.isPending}
                title={!canEditTask ? 'Only assigned person or higher authorities can change status' : undefined}
                className={`w-full px-2.5 py-1.5 rounded-lg border text-xs font-semibold focus:outline-none shadow-2xs ${
                  !canEditTask
                    ? 'border-slate-200 dark:border-slate-800 bg-slate-100 dark:bg-slate-800 text-slate-400 dark:text-slate-500 cursor-not-allowed'
                    : 'border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:border-blue-600 cursor-pointer'
                }`}
              >
                <option value="TODO">To Do</option>
                <option value="PENDING_APPROVAL">Pending Approval</option>
                <option value="IN_PROGRESS">In Progress</option>
                <option value="IN_REVIEW">In Review</option>
                <option value="DONE">Done</option>
                <option value="CANCELED">Canceled</option>
              </select>
            </div>

            {/* Priority Select */}
            <div>
              <label className="block text-slate-500 dark:text-slate-400 mb-1 font-medium">Priority</label>
              <select
                value={ticket.priority}
                onChange={(e) => priorityMutation.mutate(e.target.value as Ticket['priority'])}
                disabled={!canEditTask || priorityMutation.isPending}
                title={!canEditTask ? 'Only assigned person or higher authorities can change priority' : undefined}
                className={`w-full px-2.5 py-1.5 rounded-lg border text-xs font-semibold focus:outline-none shadow-2xs ${
                  !canEditTask
                    ? 'border-slate-200 dark:border-slate-800 bg-slate-100 dark:bg-slate-800 text-slate-400 dark:text-slate-500 cursor-not-allowed'
                    : 'border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:border-blue-600 cursor-pointer'
                }`}
              >
                <option value="LOW">Low</option>
                <option value="MEDIUM">Medium</option>
                <option value="HIGH">High</option>
                <option value="URGENT">Urgent</option>
              </select>
            </div>

            {/* Assignee */}
            <div>
              <label className="block text-slate-500 dark:text-slate-400 mb-1 font-medium flex items-center gap-1">
                <User className="h-3 w-3 text-blue-500" /> Assignee
              </label>
              <select
                value={ticket.assigneeId || ''}
                onChange={(e) => assigneeMutation.mutate(e.target.value || null)}
                disabled={(!isHigherAuthority && ticket.assigneeId !== null) || assigneeMutation.isPending}
                title={!isHigherAuthority && ticket.assigneeId !== null ? 'Only higher authorities can reassign tasks' : undefined}
                className={`w-full px-2.5 py-1.5 rounded-lg border text-xs font-semibold focus:outline-none shadow-2xs ${
                  !isHigherAuthority && ticket.assigneeId !== null
                    ? 'border-slate-200 dark:border-slate-800 bg-slate-100 dark:bg-slate-800 text-slate-400 dark:text-slate-500 cursor-not-allowed'
                    : 'border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:border-blue-600 cursor-pointer'
                }`}
              >
                <option value="">Unassigned</option>
                {availableUsers.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.fullName} ({u.email})
                  </option>
                ))}
              </select>
            </div>

            {/* Deadline / Due Date */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-slate-500 dark:text-slate-400 font-medium flex items-center gap-1">
                  <Calendar className="h-3 w-3 text-blue-500" /> Deadline
                </label>
                {!canEditTask ? (
                  <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400 flex items-center gap-1">
                    <Lock className="h-3 w-3" /> Read-Only
                  </span>
                ) : isDeadlineLocked ? (
                  <span className="text-[10px] font-bold text-amber-600 dark:text-amber-400 flex items-center gap-1">
                    <Lock className="h-3 w-3" /> Locked
                  </span>
                ) : ticket.assigneeId ? (
                  <span className="text-[10px] font-bold text-blue-600 dark:text-blue-400">
                    Auto-Default Active
                  </span>
                ) : null}
              </div>
              <input
                type="date"
                value={ticket.dueDate ? new Date(ticket.dueDate).toISOString().split('T')[0] : ''}
                onChange={(e) => {
                  const val = e.target.value;
                  dueDateMutation.mutate(val ? new Date(val).toISOString() : null);
                }}
                disabled={!canEditTask || isDeadlineLocked || dueDateMutation.isPending}
                className={`w-full px-2.5 py-1.5 rounded-lg border text-xs font-semibold focus:outline-none shadow-2xs ${
                  !canEditTask || isDeadlineLocked
                    ? 'border-amber-300 dark:border-amber-800 bg-amber-50/50 dark:bg-amber-950/30 text-amber-900 dark:text-amber-200 cursor-not-allowed opacity-80'
                    : 'border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:border-blue-600'
                }`}
              />

              {!canEditTask && (
                <div className="mt-1.5 p-2 rounded-lg bg-slate-100 dark:bg-slate-800 text-[11px] text-slate-600 dark:text-slate-400 flex items-start gap-1.5">
                  <Lock className="h-3.5 w-3.5 shrink-0 mt-0.5 text-slate-500" />
                  <div>
                    <span className="font-semibold">Assigned Task:</span> Only {ticket.assignee?.fullName || 'assignee'} or higher authorities can change this deadline.
                  </div>
                </div>
              )}

              {canEditTask && isDeadlineLocked && (
                <div className="mt-1.5 p-2 rounded-lg bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 text-[11px] text-amber-800 dark:text-amber-200 flex items-start gap-1.5">
                  <Lock className="h-3.5 w-3.5 shrink-0 mt-0.5 text-amber-600 dark:text-amber-400" />
                  <div>
                    <span className="font-semibold">Immutable Deadline:</span> Set by higher authority (Tier {ticket.dueDateSetByRoleTier || 1}). Locked against changes.
                  </div>
                </div>
              )}

              {canEditTask && !isDeadlineLocked && (
                <div className="flex items-center gap-1 mt-1.5">
                  <button
                    type="button"
                    onClick={() => {
                      const d = new Date();
                      d.setDate(d.getDate() + 3);
                      dueDateMutation.mutate(d.toISOString());
                    }}
                    className="px-1.5 py-0.5 rounded border border-slate-200 dark:border-slate-700 text-[10px] text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 font-medium"
                  >
                    +3d
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const d = new Date();
                      d.setDate(d.getDate() + 7);
                      dueDateMutation.mutate(d.toISOString());
                    }}
                    className="px-1.5 py-0.5 rounded border border-slate-200 dark:border-slate-700 text-[10px] text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 font-medium"
                  >
                    +1w
                  </button>
                  {ticket.dueDate && (
                    <button
                      type="button"
                      onClick={() => dueDateMutation.mutate(null)}
                      className="px-1.5 py-0.5 text-[10px] text-rose-600 hover:underline ml-auto font-medium"
                    >
                      Clear
                    </button>
                  )}
                </div>
              )}
            </div>

            {/* Type */}
            <div>
              <label className="block text-slate-500 dark:text-slate-400 mb-1 font-medium">Type</label>
              <span className="inline-block px-2 py-1 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-200 font-mono font-medium">
                {ticket.ticketType}
              </span>
            </div>

            {/* Story Points */}
            <div>
              <label className="block text-slate-500 dark:text-slate-400 mb-1 font-medium">Story Points</label>
              <span className="inline-block px-2 py-1 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-200 font-mono font-medium">
                {ticket.storyPoints !== null && ticket.storyPoints !== undefined
                  ? `${ticket.storyPoints} pts`
                  : 'Unestimated'}
              </span>
            </div>

            {/* SLA Tracking */}
            {ticket.slaResolutionDueAt && (
              <div>
                <label className="block text-slate-500 dark:text-slate-400 mb-1 font-medium">SLA Resolution</label>
                <SLABadge
                  dueAt={ticket.slaResolutionDueAt}
                  isPaused={ticket.isSlaPaused}
                  isResolved={ticket.status === 'DONE' || ticket.status === 'RESOLVED'}
                />
              </div>
            )}

            {/* Task Assignment Authority & Protection */}
            {ticket.assigneeId && (
              <div className="pt-3 border-t border-slate-200 dark:border-slate-800">
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-slate-500 dark:text-slate-400 font-medium text-xs">Assignment Policy</span>
                  {isAssignedByHigherAuthority ? (
                    <span className="text-[10px] font-bold text-amber-600 dark:text-amber-400 flex items-center gap-1">
                      <Lock className="h-3 w-3" /> Protected
                    </span>
                  ) : null}
                </div>
                <div
                  className={`p-2.5 rounded-xl border text-xs ${
                    isAssignedByHigherAuthority
                      ? 'border-amber-200 dark:border-amber-900/60 bg-amber-50/60 dark:bg-amber-950/30 text-amber-900 dark:text-amber-200'
                      : 'border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/40 text-slate-700 dark:text-slate-300'
                  }`}
                >
                  <div className="flex items-center gap-1.5 font-semibold text-[11px]">
                    <Shield className="h-3.5 w-3.5 text-blue-600 dark:text-blue-400" />
                    <span>Assigned by Authority Tier {assignerTier}</span>
                  </div>
                  <p className="mt-1 text-[11px] leading-relaxed opacity-90">
                    {isAssignedByHigherAuthority
                      ? `Assigned by higher authority (Tier ${assignerTier}). Deletion is blocked for Tier ${roleTier}.`
                      : `Standard assigned task.`}
                  </p>
                </div>
              </div>
            )}

            {/* Timestamps */}
            <div className="pt-4 border-t border-slate-200 dark:border-slate-800 space-y-2 text-[11px] text-slate-500 dark:text-slate-400">
              <div className="flex justify-between">
                <span>Created:</span>
                <span className="font-mono text-slate-700 dark:text-slate-300">
                  {new Date(ticket.createdAt).toLocaleDateString()}
                </span>
              </div>
              <div className="flex justify-between">
                <span>Updated:</span>
                <span className="font-mono text-slate-700 dark:text-slate-300">
                  {new Date(ticket.updatedAt).toLocaleDateString()}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
