'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  fetchMailStatus,
  fetchMailRecipients,
  sendMail,
  fetchMailLogs,
  resendMailLog,
  fetchTeams,
  setMailPrimaryProvider,
  SendMailPayload,
  MailStatus,
  MailRecipientDirectory,
  MailLogsResponse,
  Team,
} from '../../lib/api';
import { usePermissions } from '../../hooks/usePermissions';
import {
  Mail,
  Send,
  Users,
  FolderGit2,
  Globe,
  AtSign,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  Search,
  ShieldAlert,
  ArrowRight,
  Eye,
  EyeOff,
  AlertCircle,
  Server,
  Clock,
  X,
  UsersRound,
} from 'lucide-react';

// ─── Templates ────────────────────────────────────────────────────────────────

const QUICK_TEMPLATES = [
  {
    id: 'sprint_update',
    name: 'Sprint Milestone Sync',
    category: 'PROJECT_UPDATE',
    priority: 'NORMAL' as const,
    subject: 'Sprint Milestone Review & Alignment Sync',
    content: `Hello Team,\n\nWe have completed our latest sprint iteration checkpoint. Please ensure all in-progress tickets are updated on the Kanban board with accurate spent hours and blockers logged.\n\nKey Action Items:\n- Review outstanding tickets in the current sprint\n- Flag any critical path dependencies\n- Submit daily standup summaries before EOD\n\nThank you for your dedicated efforts!`,
    ctaText: 'Open Project Board',
  },
  {
    id: 'urgent_deadline',
    name: 'Urgent Delivery Notice',
    category: 'URGENT_NOTICE',
    priority: 'URGENT' as const,
    subject: 'CRITICAL: Delivery Target Deadline Approaching',
    content: `Attention Team Members,\n\nThis is an urgent directive regarding our upcoming deliverable deadline. All hands are required to focus on resolving unresolved high-priority bugs and unblocking peer pull requests.\n\nPlease reach out directly to the Project Manager if additional resources or approvals are required.`,
    ctaText: 'View Critical Deliverables',
  },
  {
    id: 'task_directive',
    name: 'Task Directive',
    category: 'TASK_DIRECTIVE',
    priority: 'HIGH' as const,
    subject: 'Task Assignment Directive & Code Quality Standards',
    content: `Hi there,\n\nPlease review your assigned tasks for this iteration. Ensure that all pull requests include test coverage and reference the corresponding ticket key (e.g. CORE-123).\n\nIf you have questions regarding acceptance criteria or architectural guidelines, please leave a comment on the ticket.`,
    ctaText: 'Open My Assigned Tasks',
  },
  {
    id: 'internal_memo',
    name: 'Internal Memo',
    category: 'INTERNAL_MEMO',
    priority: 'NORMAL' as const,
    subject: 'Internal Organization Update & Operational Notice',
    content: `Team,\n\nPlease be advised of the operational updates scheduled for this week. Normal development workflows will proceed without interruption.\n\nFeel free to reply directly to this mail or reach out in the management channel with questions.`,
    ctaText: 'Open CoreTrack Portal',
  },
];

// ─── Shared style tokens ───────────────────────────────────────────────────────

const inputCls =
  'w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800/60 text-xs text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-1 focus:ring-blue-600 focus:border-blue-600 transition';

const selectCls =
  'w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800/60 text-xs font-medium text-slate-700 dark:text-slate-300 focus:outline-none focus:ring-1 focus:ring-blue-600 focus:border-blue-600 transition';

const btnSecondary =
  'px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800 text-xs font-medium text-slate-700 dark:text-slate-300 flex items-center gap-1.5 transition cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed';

const btnPrimary =
  'px-4 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium flex items-center gap-1.5 transition cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed';

function Badge({
  children,
  variant = 'neutral',
}: {
  children: React.ReactNode;
  variant?: 'neutral' | 'green' | 'red' | 'blue' | 'amber';
}) {
  const styles: Record<string, string> = {
    neutral: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300',
    green: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300',
    red: 'bg-rose-50 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300',
    blue: 'bg-blue-50 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300',
    amber: 'bg-amber-50 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300',
  };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium ${styles[variant]}`}>
      {children}
    </span>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function MailingPage() {
  const queryClient = useQueryClient();
  const { user, isOrgAdmin, roleTier, isLoading: isAuthLoading } = usePermissions();
  const isAuthorized = Boolean(isOrgAdmin || (roleTier !== undefined && roleTier >= 3));

  // Tab
  const [activeTab, setActiveTab] = useState<'compose' | 'logs' | 'gateways'>('compose');

  // Compose form
  const [recipientType, setRecipientType] = useState<'INDIVIDUAL' | 'INTERNAL_ALL' | 'PROJECT_TEAM' | 'TEAM_BROADCAST' | 'CUSTOM_EMAIL'>('INDIVIDUAL');
  const [selectedUserIds, setSelectedUserIds] = useState<string[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState('');
  const [selectedTeamId, setSelectedTeamId] = useState('');
  const [customEmails, setCustomEmails] = useState('');
  const [subject, setSubject] = useState('');
  const [category, setCategory] = useState('DIRECT_MAIL');
  const [priority, setPriority] = useState<'LOW' | 'NORMAL' | 'HIGH' | 'URGENT'>('NORMAL');
  const [content, setContent] = useState('');
  const [ctaText, setCtaText] = useState('Open CoreTrack');
  const [ctaUrl, setCtaUrl] = useState('');
  const [selectedGateway, setSelectedGateway] = useState<'' | 'RESEND' | 'MAILJET' | 'BREVO'>('');
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [userSearch, setUserSearch] = useState('');

  // Logs
  const [logsStatusFilter, setLogsStatusFilter] = useState<'ALL' | 'SENT' | 'FAILED'>('ALL');
  const [logsSearch, setLogsSearch] = useState('');
  const [logsPage, setLogsPage] = useState(1);

  // Feedback
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // ─── Queries ───────────────────────────────────────────────────────────────

  const { data: statusData } = useQuery<MailStatus>({
    queryKey: ['mailStatus'],
    queryFn: fetchMailStatus,
    enabled: isAuthorized,
  });

  const { data: recipientDirectory, isLoading: isRecipientsLoading } = useQuery<MailRecipientDirectory>({
    queryKey: ['mailRecipients'],
    queryFn: fetchMailRecipients,
    enabled: isAuthorized,
  });

  const { data: teams = [] } = useQuery<Team[]>({
    queryKey: ['teams'],
    queryFn: fetchTeams,
    enabled: isAuthorized,
  });

  const {
    data: logsData,
    isLoading: isLogsLoading,
    isError: isLogsError,
    error: logsError,
    refetch: refetchLogs,
  } = useQuery<MailLogsResponse>({
    queryKey: ['mailLogs', logsStatusFilter, logsSearch, logsPage],
    queryFn: () => fetchMailLogs({ status: logsStatusFilter, search: logsSearch, page: logsPage, limit: 15 }),
    enabled: isAuthorized && activeTab === 'logs',
  });

  // ─── Mutations ─────────────────────────────────────────────────────────────

  const sendMutation = useMutation({
    mutationFn: (payload: SendMailPayload) => sendMail(payload),
    onSuccess: (data) => {
      setFeedback({ type: 'success', message: data.message || `Mail sent to ${data.successCount} recipients.` });
      if (recipientType === 'CUSTOM_EMAIL') setCustomEmails('');
      if (recipientType === 'INDIVIDUAL') setSelectedUserIds([]);
      setSubject('');
      setContent('');
      queryClient.invalidateQueries({ queryKey: ['mailStatus'] });
      queryClient.invalidateQueries({ queryKey: ['mailLogs'] });
    },
    onError: (err: any) => {
      setFeedback({ type: 'error', message: err.message || 'Failed to send. Check provider configuration.' });
    },
  });

  const resendMutation = useMutation({
    mutationFn: (logId: string) => resendMailLog(logId),
    onSuccess: () => {
      setFeedback({ type: 'success', message: 'Re-dispatch completed.' });
      refetchLogs();
      queryClient.invalidateQueries({ queryKey: ['mailStatus'] });
    },
    onError: (err: any) => {
      setFeedback({ type: 'error', message: err.message || 'Re-dispatch failed.' });
    },
  });

  const selectGatewayMutation = useMutation({
    mutationFn: (provider: string) => setMailPrimaryProvider(provider),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['mailStatus'] });
      setFeedback({
        type: 'success',
        message: `Primary mail server switched to ${data.primaryProvider}.`,
      });
    },
    onError: (err: any) => {
      setFeedback({
        type: 'error',
        message: err.message || 'Failed to switch mail server.',
      });
    },
  });

  // ─── Helpers ───────────────────────────────────────────────────────────────

  function handleSelectTemplate(id: string) {
    const t = QUICK_TEMPLATES.find((x) => x.id === id);
    if (!t) return;
    setSubject(t.subject);
    setContent(t.content);
    setCategory(t.category);
    setPriority(t.priority);
    setCtaText(t.ctaText);
  }

  function toggleUser(userId: string) {
    setSelectedUserIds((prev) =>
      prev.includes(userId) ? prev.filter((id) => id !== userId) : [...prev, userId]
    );
  }

  function handleSend(e: React.FormEvent) {
    e.preventDefault();
    setFeedback(null);
    if (!subject.trim()) return setFeedback({ type: 'error', message: 'Please provide a subject line.' });
    if (!content.trim()) return setFeedback({ type: 'error', message: 'Please provide message content.' });
    if (recipientType === 'INDIVIDUAL' && selectedUserIds.length === 0)
      return setFeedback({ type: 'error', message: 'Select at least one recipient.' });
    if (recipientType === 'PROJECT_TEAM' && !selectedProjectId)
      return setFeedback({ type: 'error', message: 'Select a project to notify.' });
    if (recipientType === 'CUSTOM_EMAIL' && !customEmails.trim())
      return setFeedback({ type: 'error', message: 'Specify recipient email addresses.' });
    if (recipientType === 'TEAM_BROADCAST' && !selectedTeamId)
      return setFeedback({ type: 'error', message: 'Select a team to broadcast to.' });

    // Resolve TEAM_BROADCAST → INDIVIDUAL with the team's member IDs
    const resolvedType = recipientType === 'TEAM_BROADCAST' ? 'INDIVIDUAL' : recipientType;
    const resolvedUserIds = recipientType === 'TEAM_BROADCAST'
      ? (teams.find((t) => t.id === selectedTeamId)?.members || []).map((m) => m.userId)
      : recipientType === 'INDIVIDUAL' ? selectedUserIds : undefined;

    if (recipientType === 'TEAM_BROADCAST' && (!resolvedUserIds || resolvedUserIds.length === 0))
      return setFeedback({ type: 'error', message: 'The selected team has no members.' });

    sendMutation.mutate({
      recipientType: resolvedType as SendMailPayload['recipientType'],
      recipientUserIds: resolvedUserIds,
      projectId: recipientType === 'PROJECT_TEAM' ? selectedProjectId : undefined,
      customEmails: recipientType === 'CUSTOM_EMAIL' ? customEmails : undefined,
      subject: subject.trim(),
      category,
      priority,
      content: content.trim(),
      ctaText: ctaText.trim() || undefined,
      ctaUrl: ctaUrl.trim() || undefined,
      preferredProvider: selectedGateway || undefined,
    });
  }

  const filteredUsers = (recipientDirectory?.users || []).filter((u) => {
    if (!userSearch.trim()) return true;
    const q = userSearch.toLowerCase();
    return u.fullName.toLowerCase().includes(q) || u.email.toLowerCase().includes(q);
  });

  const telemetry = statusData?.telemetry;
  const primaryProvider = statusData?.primaryProvider || 'NONE';
  const failoverEnabled = statusData?.failoverEnabled || false;

  // ─── Loading / Access Guards ───────────────────────────────────────────────

  if (isAuthLoading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <RefreshCw className="h-5 w-5 text-blue-600 animate-spin" />
          <p className="text-xs text-slate-500">Verifying credentials…</p>
        </div>
      </div>
    );
  }

  if (!isAuthorized) {
    return (
      <div className="flex-1 flex items-center justify-center p-6">
        <div className="max-w-sm w-full text-center space-y-4">
          <div className="h-12 w-12 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 flex items-center justify-center mx-auto">
            <ShieldAlert className="h-6 w-6 text-rose-600 dark:text-rose-400" />
          </div>
          <div>
            <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">Access Restricted</h2>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              Mailing Center is restricted to <strong>Super Admins</strong>, <strong>Administrators</strong>, and <strong>Project Managers</strong> (Tier 3+).
            </p>
          </div>
          <div className="p-3 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 text-xs text-slate-600 dark:text-slate-400">
            <div>Account: <span className="font-medium text-slate-900 dark:text-slate-200">{user?.fullName || 'User'}</span></div>
            <div>Role: <span className="font-medium text-slate-900 dark:text-slate-200">{user?.roleName || 'Member'} · Tier {roleTier || 1}</span></div>
          </div>
          <Link
            href="/dashboard"
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium transition"
          >
            Return to Dashboard <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>
      </div>
    );
  }

  // ─── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="flex-1 min-w-0 w-full max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-7 space-y-7">

      {/* ── Page Header ─────────────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-lg font-semibold text-slate-900 dark:text-slate-100 tracking-tight">
              Mailing Center
            </h1>
            <span className="px-2 py-0.5 rounded text-[10px] font-medium border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-500 dark:text-slate-400 font-mono">
              {primaryProvider}
            </span>
            {failoverEnabled && (
              <span className="px-2 py-0.5 rounded text-[10px] font-medium bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-900">
                Failover ready
              </span>
            )}
          </div>
          <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
            Send direct emails or broadcast inside communications to teams and departments.
          </p>
        </div>

        <div className="text-right hidden sm:block">
          <p className="text-[11px] text-slate-400">Sending as</p>
          <p className="text-xs font-medium text-slate-700 dark:text-slate-300">{user?.fullName}</p>
          <p className="text-[10px] text-slate-400 font-mono">{user?.email}</p>
        </div>
      </div>

      {/* ── Feedback Banner ──────────────────────────────────────────────────── */}
      {feedback && (
        <div
          className={`flex items-center justify-between gap-3 px-4 py-3 rounded-lg border text-xs ${
            feedback.type === 'success'
              ? 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-900 text-emerald-800 dark:text-emerald-200'
              : 'bg-rose-50 dark:bg-rose-950/40 border-rose-200 dark:border-rose-900 text-rose-800 dark:text-rose-200'
          }`}
        >
          <div className="flex items-center gap-2 font-medium">
            {feedback.type === 'success' ? (
              <CheckCircle2 className="h-4 w-4 shrink-0" />
            ) : (
              <AlertCircle className="h-4 w-4 shrink-0" />
            )}
            {feedback.message}
          </div>
          <button onClick={() => setFeedback(null)} className="text-current opacity-50 hover:opacity-100 cursor-pointer">
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {/* ── Stat Row ────────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'Total Sent', value: telemetry?.totalDispatched ?? 0, sub: 'all time' },
          { label: 'Delivery Rate', value: `${telemetry?.successRate ?? 100}%`, sub: `${telemetry?.totalSent ?? 0} delivered`, green: true },
          { label: 'Failures', value: telemetry?.totalFailed ?? 0, sub: 'auto-failover active' },
          { label: 'Active Gateway', value: primaryProvider, sub: 'primary provider' },
        ].map((s) => (
          <div
            key={s.label}
            className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/60"
          >
            <p className="text-[11px] text-slate-500 dark:text-slate-400 font-medium">{s.label}</p>
            <p className={`mt-1 text-lg font-semibold leading-none ${s.green ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-900 dark:text-slate-100'}`}>
              {s.value}
            </p>
            <p className="mt-0.5 text-[11px] text-slate-400">{s.sub}</p>
          </div>
        ))}
      </div>

      {/* ── Tabs ─────────────────────────────────────────────────────────────── */}
      <div className="border-b border-slate-200 dark:border-slate-800">
        <nav className="-mb-px flex gap-0">
          {([
            { id: 'compose', label: 'Compose', icon: Send },
            { id: 'logs', label: 'Delivery Logs', icon: Clock },
            { id: 'gateways', label: 'Gateways', icon: Server },
          ] as const).map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => setActiveTab(id)}
              className={`flex items-center gap-2 px-4 py-2.5 text-xs font-medium border-b-2 transition whitespace-nowrap cursor-pointer ${
                activeTab === id
                  ? 'border-blue-600 text-blue-600 dark:text-blue-400 dark:border-blue-500'
                  : 'border-transparent text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200'
              }`}
            >
              <Icon className="h-3.5 w-3.5" />
              {label}
            </button>
          ))}
        </nav>
      </div>

      {/* ══════════════════════════════════════════════════════════════════════
          TAB 1 — Compose & Dispatch
      ══════════════════════════════════════════════════════════════════════ */}
      {activeTab === 'compose' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">

          {/* Left — Compose Form */}
          <form onSubmit={handleSend} className="lg:col-span-7 space-y-5">

            {/* Quick Templates */}
            <div className="space-y-2">
              <p className="text-xs font-medium text-slate-600 dark:text-slate-400">Quick templates</p>
              <div className="grid grid-cols-2 gap-2">
                {QUICK_TEMPLATES.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => handleSelectTemplate(t.id)}
                    className="text-left p-3 rounded-lg border border-slate-200 dark:border-slate-700 hover:border-blue-500 dark:hover:border-blue-500 bg-white dark:bg-slate-900 hover:bg-blue-50/40 dark:hover:bg-blue-950/20 transition cursor-pointer group"
                  >
                    <p className="text-xs font-medium text-slate-800 dark:text-slate-200 group-hover:text-blue-600 dark:group-hover:text-blue-400 truncate">
                      {t.name}
                    </p>
                    <p className="text-[10px] text-slate-400 mt-0.5 truncate">{t.subject}</p>
                  </button>
                ))}
              </div>
            </div>

            <div className="border-t border-slate-100 dark:border-slate-800 pt-5 space-y-5">

              {/* Recipient Type Selector */}
              <div className="space-y-2">
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                  Recipients
                </label>
                <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                  {([
                    { type: 'INDIVIDUAL', label: 'Direct Users', icon: Users, sub: 'Team members' },
                    { type: 'PROJECT_TEAM', label: 'Project Team', icon: FolderGit2, sub: 'Inside broadcast' },
                    { type: 'INTERNAL_ALL', label: 'All Staff', icon: Globe, sub: 'Org-wide' },
                    { type: 'CUSTOM_EMAIL', label: 'Custom Email', icon: AtSign, sub: 'Ad-hoc' },
                    { type: 'TEAM_BROADCAST', label: 'Team', icon: UsersRound, sub: 'Team broadcast' },
                  ] as const).map(({ type, label, icon: Icon, sub }) => (
                    <button
                      key={type}
                      type="button"
                      onClick={() => setRecipientType(type)}
                      className={`flex flex-col items-center gap-1.5 p-3 rounded-lg border text-center transition cursor-pointer ${
                        recipientType === type
                          ? 'border-blue-600 bg-blue-50/60 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300'
                          : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:border-slate-300 dark:hover:border-slate-600 bg-white dark:bg-slate-900'
                      }`}
                    >
                      <Icon className="h-4 w-4" />
                      <span className="text-[11px] font-medium">{label}</span>
                      <span className="text-[10px] text-slate-400">{sub}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Dynamic recipient picker */}
              {recipientType === 'INDIVIDUAL' && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-medium text-slate-700 dark:text-slate-300">
                      Select users
                      {selectedUserIds.length > 0 && (
                        <span className="ml-1.5 px-1.5 py-0.5 rounded-full text-[10px] font-semibold bg-blue-100 dark:bg-blue-950 text-blue-700 dark:text-blue-300">
                          {selectedUserIds.length}
                        </span>
                      )}
                    </label>
                    {selectedUserIds.length > 0 && (
                      <button
                        type="button"
                        onClick={() => setSelectedUserIds([])}
                        className="text-[11px] text-blue-600 hover:underline cursor-pointer"
                      >
                        Clear
                      </button>
                    )}
                  </div>
                  <div className="relative">
                    <Search className="h-3.5 w-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                    <input
                      type="text"
                      placeholder="Search by name or email…"
                      value={userSearch}
                      onChange={(e) => setUserSearch(e.target.value)}
                      className={`${inputCls} pl-8`}
                    />
                  </div>
                  <div className="max-h-44 overflow-y-auto rounded-lg border border-slate-200 dark:border-slate-700 divide-y divide-slate-100 dark:divide-slate-800">
                    {isRecipientsLoading ? (
                      <p className="py-6 text-center text-xs text-slate-400">Loading…</p>
                    ) : filteredUsers.length === 0 ? (
                      <p className="py-6 text-center text-xs text-slate-400">No matching users.</p>
                    ) : (
                      filteredUsers.map((u) => {
                        const selected = selectedUserIds.includes(u.id);
                        return (
                          <div
                            key={u.id}
                            onClick={() => toggleUser(u.id)}
                            className={`flex items-center justify-between px-3 py-2.5 cursor-pointer select-none transition text-xs ${
                              selected
                                ? 'bg-blue-50/80 dark:bg-blue-950/40'
                                : 'hover:bg-slate-50 dark:hover:bg-slate-800'
                            }`}
                          >
                            <div className="flex items-center gap-2.5 min-w-0">
                              <div className="h-6 w-6 rounded-full bg-blue-600 text-white text-[10px] font-semibold flex items-center justify-center shrink-0">
                                {u.fullName.charAt(0)}
                              </div>
                              <div className="min-w-0">
                                <p className="font-medium text-slate-800 dark:text-slate-200 truncate">{u.fullName}</p>
                                <p className="text-[10px] text-slate-400 font-mono truncate">{u.email}</p>
                              </div>
                            </div>
                            <input
                              type="checkbox"
                              checked={selected}
                              onChange={() => {}}
                              className="h-3.5 w-3.5 rounded accent-blue-600 cursor-pointer"
                            />
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>
              )}

              {recipientType === 'PROJECT_TEAM' && (
                <div className="space-y-1.5">
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                    Target project
                  </label>
                  <select
                    value={selectedProjectId}
                    onChange={(e) => setSelectedProjectId(e.target.value)}
                    className={selectCls}
                  >
                    <option value="">Select a project…</option>
                    {(recipientDirectory?.projects || []).map((p) => (
                      <option key={p.id} value={p.id}>{p.name} ({p.key})</option>
                    ))}
                  </select>
                </div>
              )}

              {recipientType === 'INTERNAL_ALL' && (
                <div className="flex items-center gap-2.5 px-3 py-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 text-xs text-slate-700 dark:text-slate-300">
                  <Globe className="h-4 w-4 text-slate-400 shrink-0" />
                  Broadcasting to <strong>all {recipientDirectory?.users?.length || 0} internal employees.</strong>
                </div>
              )}

              {recipientType === 'CUSTOM_EMAIL' && (
                <div className="space-y-1.5">
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                    Email addresses <span className="text-slate-400 font-normal">(comma-separated)</span>
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. alice@company.com, bob@company.com"
                    value={customEmails}
                    onChange={(e) => setCustomEmails(e.target.value)}
                    className={inputCls}
                  />
                </div>
              )}

              {recipientType === 'TEAM_BROADCAST' && (
                <div className="space-y-2">
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                    Select team
                  </label>
                  <select
                    value={selectedTeamId}
                    onChange={(e) => setSelectedTeamId(e.target.value)}
                    className={selectCls}
                  >
                    <option value="">Choose a team…</option>
                    {teams.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name} · {t.memberCount ?? t.members.length} members
                        {t.lead ? ` · Lead: ${t.lead.fullName}` : ''}
                      </option>
                    ))}
                  </select>
                  {selectedTeamId && (() => {
                    const team = teams.find((t) => t.id === selectedTeamId);
                    if (!team) return null;
                    return (
                      <div className="flex items-start gap-2.5 px-3 py-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 text-xs text-slate-600 dark:text-slate-400">
                        <UsersRound className="h-4 w-4 text-slate-400 shrink-0 mt-0.5" />
                        <span>
                          Broadcasting to <strong className="text-slate-700 dark:text-slate-300">{team.members.length} member{team.members.length !== 1 ? 's' : ''}</strong> of <strong className="text-slate-700 dark:text-slate-300">{team.name}</strong>
                          {team.lead ? <span className="text-slate-400"> · Lead: {team.lead.fullName}</span> : null}.
                        </span>
                      </div>
                    );
                  })()}
                </div>
              )}

              {/* Category + Priority */}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">Category</label>
                  <select value={category} onChange={(e) => setCategory(e.target.value)} className={selectCls}>
                    <option value="DIRECT_MAIL">Direct Mail</option>
                    <option value="INTERNAL_ANNOUNCEMENT">Internal Announcement</option>
                    <option value="PROJECT_UPDATE">Project Update</option>
                    <option value="URGENT_NOTICE">Urgent Notice</option>
                    <option value="TASK_DIRECTIVE">Task Directive</option>
                    <option value="INTERNAL_MEMO">Internal Memo</option>
                  </select>
                </div>
                <div className="space-y-1.5">
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">Priority</label>
                  <select value={priority} onChange={(e) => setPriority(e.target.value as any)} className={selectCls}>
                    <option value="LOW">Low</option>
                    <option value="NORMAL">Normal</option>
                    <option value="HIGH">High</option>
                    <option value="URGENT">Urgent</option>
                  </select>
                </div>
              </div>

              {/* Subject */}
              <div className="space-y-1.5">
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                  Subject <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="Clear, informative subject line…"
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  className={inputCls}
                />
              </div>

              {/* Body */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                    Message <span className="text-rose-500">*</span>
                  </label>
                  <span className="text-[11px] text-slate-400">{content.length} chars</span>
                </div>
                <textarea
                  rows={6}
                  required
                  placeholder="Write your message here. Paragraphs are formatted automatically."
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  className="w-full p-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800/60 text-xs text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-1 focus:ring-blue-600 focus:border-blue-600 resize-none leading-relaxed transition"
                />
              </div>

              {/* CTA row */}
              <div className="grid grid-cols-2 gap-3 pt-1 border-t border-slate-100 dark:border-slate-800">
                <div className="space-y-1.5">
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                    Button label
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Open Kanban Board"
                    value={ctaText}
                    onChange={(e) => setCtaText(e.target.value)}
                    className={inputCls}
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                    Button URL <span className="text-slate-400 font-normal">(optional)</span>
                  </label>
                  <input
                    type="text"
                    placeholder="Leave empty for CoreTrack home"
                    value={ctaUrl}
                    onChange={(e) => setCtaUrl(e.target.value)}
                    className={inputCls}
                  />
                </div>
              </div>

              {/* Gateway & Footer actions */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1 border-t border-slate-100 dark:border-slate-800">
                <div className="space-y-1.5">
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                    Mail Gateway
                  </label>
                  <select
                    value={selectedGateway}
                    onChange={(e) => setSelectedGateway(e.target.value as '' | 'RESEND' | 'MAILJET' | 'BREVO')}
                    className={inputCls}
                  >
                    <option value="">Auto ({primaryProvider})</option>
                    {(statusData?.providers || []).map((p) => (
                      <option key={p.name} value={p.name}>
                        {p.name} {p.isPrimary ? '(Primary)' : `(Priority ${p.priority})`}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="flex items-center justify-between pt-3 border-t border-slate-100 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsPreviewOpen((p) => !p)}
                  className={btnSecondary}
                >
                  {isPreviewOpen ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                  {isPreviewOpen ? 'Hide Preview' : 'Preview'}
                </button>

                <button
                  type="submit"
                  disabled={sendMutation.isPending}
                  className={`${btnPrimary} px-5`}
                >
                  {sendMutation.isPending ? (
                    <><RefreshCw className="h-3.5 w-3.5 animate-spin" /> Sending…</>
                  ) : (
                    <><Send className="h-3.5 w-3.5" /> Dispatch Mail</>
                  )}
                </button>
              </div>
            </div>
          </form>

          {/* Right — Live Preview */}
          <div className="lg:col-span-5 space-y-3 sticky top-6">
            <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 space-y-3">
              <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
                <div className="flex items-center gap-2">
                  <Mail className="h-3.5 w-3.5 text-blue-600" />
                  <span className="text-xs font-medium text-slate-700 dark:text-slate-300">Email Preview</span>
                </div>
                <span className="text-[10px] text-slate-400">Branded HTML card</span>
              </div>

              {/* Mock email */}
              <div className="rounded-lg overflow-hidden border border-slate-200 dark:border-slate-700 text-xs">
                {/* Email header */}
                <div className="bg-slate-900 text-white px-4 py-2.5 flex items-center justify-between">
                  <span className="font-bold text-blue-400 tracking-tight text-xs">CoreTrack</span>
                  <span className={`text-[9px] font-bold uppercase px-2 py-0.5 rounded-full text-white ${
                    priority === 'URGENT' ? 'bg-rose-600' :
                    category === 'PROJECT_UPDATE' ? 'bg-emerald-600' :
                    category === 'INTERNAL_ANNOUNCEMENT' ? 'bg-purple-600' : 'bg-blue-600'
                  }`}>
                    {category.replace(/_/g, ' ')}
                  </span>
                </div>

                {/* Email body */}
                <div className="p-4 bg-white dark:bg-slate-900 space-y-3">
                  <p className="font-semibold text-slate-900 dark:text-slate-100 leading-snug">
                    {priority === 'URGENT' ? `[URGENT] ` : ''}{subject || 'Subject line preview…'}
                  </p>
                  <p className="text-slate-500 text-[11px]">Hello Team Member,</p>
                  <div className="p-3 bg-slate-50 dark:bg-slate-800/60 rounded-lg border border-slate-200 dark:border-slate-700 text-[11px] text-slate-700 dark:text-slate-300 whitespace-pre-wrap leading-relaxed min-h-[60px]">
                    {content || 'Your formatted message will appear here…'}
                  </div>
                  <div className="pt-2 border-t border-slate-100 dark:border-slate-800 text-[10px] text-slate-500 space-y-0.5">
                    <div className="flex justify-between">
                      <span>Sent by:</span>
                      <span className="font-medium text-slate-700 dark:text-slate-300">{user?.fullName || 'Executive'}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Gateway:</span>
                      <span className="font-mono font-medium text-slate-700 dark:text-slate-300">{selectedGateway || primaryProvider}</span>
                    </div>
                  </div>
                  <div className="inline-block px-3 py-1.5 bg-blue-600 text-white rounded text-[11px] font-medium">
                    {ctaText || 'Open CoreTrack'} →
                  </div>
                </div>

                {/* Email footer */}
                <div className="px-4 py-2 bg-slate-100 dark:bg-slate-800 border-t border-slate-200 dark:border-slate-700 text-[10px] text-slate-400 text-center">
                  CoreTrack · Amrita Vishwa Vidyapeetham
                </div>
              </div>

              {/* Recipient summary */}
              <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 text-xs text-slate-600 dark:text-slate-400">
                <p className="font-medium text-slate-700 dark:text-slate-300 mb-0.5">Recipients</p>
                <p>
                  {recipientType === 'INDIVIDUAL' && `${selectedUserIds.length} user${selectedUserIds.length !== 1 ? 's' : ''} selected`}
                  {recipientType === 'PROJECT_TEAM' && (selectedProjectId ? 'All members of selected project' : 'Select a project to preview audience')}
                  {recipientType === 'INTERNAL_ALL' && 'All internal employees'}
                  {recipientType === 'CUSTOM_EMAIL' && (customEmails ? customEmails : 'Specify email addresses')}
                  {recipientType === 'TEAM_BROADCAST' && (() => {
                    const team = teams.find((t) => t.id === selectedTeamId);
                    return team ? `${team.name} · ${team.members.length} member${team.members.length !== 1 ? 's' : ''}` : 'Select a team';
                  })()}
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════════
          TAB 2 — Delivery Logs
      ══════════════════════════════════════════════════════════════════════ */}
      {activeTab === 'logs' && (
        <div className="space-y-4">

          {/* Toolbar */}
          <div className="flex flex-col sm:flex-row gap-2.5 items-stretch sm:items-center justify-between">
            <div className="relative max-w-xs flex-1">
              <Search className="h-3.5 w-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                placeholder="Search recipient, subject…"
                value={logsSearch}
                onChange={(e) => { setLogsSearch(e.target.value); setLogsPage(1); }}
                className={`${inputCls} pl-8`}
              />
            </div>
            <div className="flex items-center gap-2">
              <select
                value={logsStatusFilter}
                onChange={(e) => { setLogsStatusFilter(e.target.value as any); setLogsPage(1); }}
                className="px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-medium text-slate-700 dark:text-slate-300 focus:outline-none focus:ring-1 focus:ring-blue-600 transition"
              >
                <option value="ALL">All statuses</option>
                <option value="SENT">Sent</option>
                <option value="FAILED">Failed</option>
              </select>
              <button onClick={() => refetchLogs()} className={btnSecondary}>
                <RefreshCw className="h-3.5 w-3.5" />
                Refresh
              </button>
            </div>
          </div>

          {/* Table */}
          {isLogsError ? (
            <div className="py-12 px-4 flex flex-col items-center gap-2 rounded-xl border border-rose-200 dark:border-rose-900 bg-rose-50/70 dark:bg-rose-950/40 text-center">
              <AlertCircle className="h-6 w-6 text-rose-500" />
              <p className="text-sm font-medium text-rose-700 dark:text-rose-300">Failed to load delivery logs</p>
              <p className="text-xs text-rose-600 dark:text-rose-400">
                {(logsError as Error)?.message || 'Check your connection or permissions and try refreshing.'}
              </p>
            </div>
          ) : isLogsLoading ? (
            <div className="py-16 text-center">
              <RefreshCw className="h-5 w-5 animate-spin text-blue-600 mx-auto mb-2" />
              <p className="text-xs text-slate-400">Loading logs…</p>
            </div>
          ) : (logsData?.logs || []).length === 0 ? (
            <div className="py-16 flex flex-col items-center gap-3 rounded-xl border border-dashed border-slate-200 dark:border-slate-800">
              <Mail className="h-7 w-7 text-slate-300 dark:text-slate-700" />
              <p className="text-sm font-medium text-slate-600 dark:text-slate-400">No delivery logs</p>
              <p className="text-xs text-slate-400">No records match your current filter.</p>
            </div>
          ) : (
            <div className="rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden bg-white dark:bg-slate-900">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-800/50">
                    {['Recipient', 'Subject', 'Category', 'Gateway', 'Status', 'Dispatched', ''].map((h) => (
                      <th key={h} className="px-4 py-2.5 font-medium text-slate-500 dark:text-slate-400 whitespace-nowrap">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {(logsData?.logs || []).map((log) => (
                    <tr key={log.id} className="hover:bg-slate-50/60 dark:hover:bg-slate-800/30 transition">
                      <td className="px-4 py-3">
                        <p className="font-medium text-slate-800 dark:text-slate-200 truncate max-w-[120px]">
                          {log.recipientName || log.recipientEmail.split('@')[0]}
                        </p>
                        <p className="text-[10px] text-slate-400 font-mono truncate max-w-[120px]">{log.recipientEmail}</p>
                      </td>
                      <td className="px-4 py-3 max-w-[160px] truncate font-medium text-slate-700 dark:text-slate-300" title={log.subject}>
                        {log.subject}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <Badge variant="neutral">{log.notificationType.replace(/_/g, ' ')}</Badge>
                      </td>
                      <td className="px-4 py-3 font-mono text-[11px] text-slate-500 dark:text-slate-400 whitespace-nowrap">
                        {log.provider}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium ${
                          log.status === 'SENT'
                            ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300'
                            : 'bg-rose-50 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300'
                        }`}>
                          <span className={`h-1.5 w-1.5 rounded-full ${log.status === 'SENT' ? 'bg-emerald-500' : 'bg-rose-500'}`} />
                          {log.status}
                        </span>
                        {log.errorMessage && (
                          <p className="text-[10px] text-amber-600 dark:text-amber-400 mt-1 max-w-[180px] truncate" title={log.errorMessage}>
                            {log.errorMessage}
                          </p>
                        )}
                      </td>
                      <td className="px-4 py-3 text-[11px] text-slate-400 font-mono whitespace-nowrap">
                        {new Date(log.sentAt).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <button
                          onClick={() => resendMutation.mutate(log.id)}
                          disabled={resendMutation.isPending}
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-slate-200 dark:border-slate-700 text-[11px] font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition cursor-pointer disabled:opacity-40"
                        >
                          <RefreshCw className="h-3 w-3" />
                          Resend
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Pagination */}
          {logsData?.pagination && logsData.pagination.totalPages > 1 && (
            <div className="flex items-center justify-between text-xs text-slate-500">
              <span>Page {logsData.pagination.page} of {logsData.pagination.totalPages} · {logsData.pagination.total} records</span>
              <div className="flex items-center gap-2">
                <button
                  disabled={logsPage <= 1}
                  onClick={() => setLogsPage((p) => Math.max(1, p - 1))}
                  className={btnSecondary}
                >
                  Previous
                </button>
                <button
                  disabled={logsPage >= logsData.pagination.totalPages}
                  onClick={() => setLogsPage((p) => p + 1)}
                  className={btnSecondary}
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════════
          TAB 3 — Gateways
      ══════════════════════════════════════════════════════════════════════ */}
      {activeTab === 'gateways' && (
        <div className="space-y-5">
          <div>
            <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
              Multi-Provider Delivery Architecture
            </h2>
            <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400 max-w-2xl">
              CoreTrack features automatic sub-second gateway failover. If an enterprise SMTP quota exhausts or encounters transient network errors, transmission immediately falls over to the backup provider without losing message telemetry.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {(statusData?.allGateways || statusData?.providers || []).map((provider) => {
              const isSelected = provider.name === primaryProvider;
              const isConfigured = provider.configured !== false;
              return (
                <div
                  key={provider.name}
                  className={`p-4 rounded-xl border bg-white dark:bg-slate-900 space-y-3 transition ${
                    isSelected
                      ? 'border-blue-600 dark:border-blue-500 ring-1 ring-blue-600/20'
                      : 'border-slate-200 dark:border-slate-800'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-medium text-slate-400 uppercase tracking-wide">
                      {isSelected ? 'Primary Server' : isConfigured ? `Priority ${provider.priority}` : 'Not Configured'}
                    </span>
                    <span
                      className={`h-2 w-2 rounded-full ${
                        isSelected
                          ? 'bg-emerald-500 animate-pulse'
                          : isConfigured
                            ? 'bg-slate-300 dark:bg-slate-600'
                            : 'bg-slate-200 dark:bg-slate-700'
                      }`}
                    />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">{provider.name}</p>
                      {isSelected && (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-blue-50 dark:bg-blue-950 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800">
                          Active
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] font-mono text-slate-500 mt-0.5 truncate">From: {provider.from}</p>
                  </div>
                  <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                    {provider.name === 'RESEND' && 'High-throughput transactional gateway via smtp.resend.com.'}
                    {provider.name === 'MAILJET' && 'Enterprise failover relay via in-v3.mailjet.com.'}
                    {provider.name === 'BREVO' && 'Transactional HTTP v3 API relay via api.brevo.com.'}
                  </p>
                  <div className="pt-2.5 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-[11px]">
                    <span className={isConfigured ? 'font-medium text-emerald-600 dark:text-emerald-400' : 'text-slate-400'}>
                      {isSelected ? 'Selected' : isConfigured ? 'Ready' : 'Missing env keys'}
                    </span>
                    <button
                      type="button"
                      disabled={isSelected || !isConfigured || selectGatewayMutation.isPending}
                      onClick={() => selectGatewayMutation.mutate(provider.name)}
                      className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold transition ${
                        isSelected
                          ? 'bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 cursor-default'
                          : isConfigured
                            ? 'bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 hover:opacity-90 cursor-pointer'
                            : 'bg-slate-100 dark:bg-slate-800 text-slate-400 cursor-not-allowed'
                      }`}
                    >
                      {isSelected ? 'Using This Server' : isConfigured ? 'Use Server' : 'Unavailable'}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Audit compliance note */}
          <div className="flex items-start gap-3 p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-800/40">
            <ShieldAlert className="h-4 w-4 text-slate-500 dark:text-slate-400 shrink-0 mt-0.5" />
            <div className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
              <span className="font-semibold text-slate-700 dark:text-slate-300 block mb-0.5">Security & Audit Compliance</span>
              All communications triggered from this interface are timestamped, logged with cryptographic IDs, and tied to the dispatching executive (<span className="font-mono">{user?.email}</span>). Recipients receive official CoreTrack emails with sender attribution and security watermarks.
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
