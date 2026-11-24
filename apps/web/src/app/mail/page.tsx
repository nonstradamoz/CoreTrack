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
  SendMailPayload,
  MailStatus,
  MailRecipientDirectory,
  MailLogsResponse,
  MailLog,
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
  Filter,
  ShieldAlert,
  ChevronRight,
  Radio,
  FileText,
  Sparkles,
  ExternalLink,
  Layers,
  Clock,
  Eye,
  EyeOff,
  Inbox,
  AlertCircle,
  Server,
  ArrowRight,
} from 'lucide-react';

// Pre-built Quick Templates
const QUICK_TEMPLATES = [
  {
    id: 'sprint_update',
    name: 'Sprint & Milestone Sync',
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
    name: 'Task Directive & Code Review',
    category: 'TASK_DIRECTIVE',
    priority: 'HIGH' as const,
    subject: 'Task Assignment Directive & Code Quality Standards',
    content: `Hi there,\n\nPlease review your assigned tasks for this iteration. Ensure that all pull requests include test coverage and reference the corresponding ticket key (e.g. CORE-123).\n\nIf you have questions regarding acceptance criteria or architectural guidelines, please leave a comment on the ticket.`,
    ctaText: 'Open My Assigned Tasks',
  },
  {
    id: 'internal_memo',
    name: 'General Internal Memo',
    category: 'INTERNAL_MEMO',
    priority: 'NORMAL' as const,
    subject: 'Internal Organization Update & Operational Notice',
    content: `Team,\n\nPlease be advised of the operational updates scheduled for this week. Normal development workflows will proceed without interruption.\n\nFeel free to reply directly to this mail or reach out in the management channel with questions.`,
    ctaText: 'Open CoreTrack Portal',
  },
];

export default function MailingPage() {
  const queryClient = useQueryClient();
  const { user, isOrgAdmin, roleTier, isLoading: isAuthLoading } = usePermissions();

  // Tier check: Super Admin (5), Admin (4), Project Manager (3)
  const isAuthorized = Boolean(isOrgAdmin || (roleTier !== undefined && roleTier >= 3));

  // Active Tab
  const [activeTab, setActiveTab] = useState<'compose' | 'logs' | 'gateways'>('compose');

  // Form State
  const [recipientType, setRecipientType] = useState<'INDIVIDUAL' | 'INTERNAL_ALL' | 'PROJECT_TEAM' | 'CUSTOM_EMAIL'>('INDIVIDUAL');
  const [selectedUserIds, setSelectedUserIds] = useState<string[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<string>('');
  const [customEmails, setCustomEmails] = useState<string>('');
  const [subject, setSubject] = useState<string>('');
  const [category, setCategory] = useState<string>('DIRECT_MAIL');
  const [priority, setPriority] = useState<'LOW' | 'NORMAL' | 'HIGH' | 'URGENT'>('NORMAL');
  const [content, setContent] = useState<string>('');
  const [ctaText, setCtaText] = useState<string>('Open CoreTrack');
  const [ctaUrl, setCtaUrl] = useState<string>('');
  const [isPreviewOpen, setIsPreviewOpen] = useState<boolean>(false);

  // User search within Recipient picker
  const [userSearch, setUserSearch] = useState<string>('');

  // Logs state
  const [logsStatusFilter, setLogsStatusFilter] = useState<'ALL' | 'SENT' | 'FAILED'>('ALL');
  const [logsSearch, setLogsSearch] = useState<string>('');
  const [logsPage, setLogsPage] = useState<number>(1);

  // Success / Error Feedback
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Queries
  const { data: statusData, isLoading: isStatusLoading } = useQuery<MailStatus>({
    queryKey: ['mailStatus'],
    queryFn: fetchMailStatus,
    enabled: isAuthorized,
  });

  const { data: recipientDirectory, isLoading: isRecipientsLoading } = useQuery<MailRecipientDirectory>({
    queryKey: ['mailRecipients'],
    queryFn: fetchMailRecipients,
    enabled: isAuthorized,
  });

  const { data: logsData, isLoading: isLogsLoading, refetch: refetchLogs } = useQuery<MailLogsResponse>({
    queryKey: ['mailLogs', logsStatusFilter, logsSearch, logsPage],
    queryFn: () =>
      fetchMailLogs({
        status: logsStatusFilter,
        search: logsSearch,
        page: logsPage,
        limit: 15,
      }),
    enabled: isAuthorized && activeTab === 'logs',
  });

  // Send Mutation
  const sendMutation = useMutation({
    mutationFn: (payload: SendMailPayload) => sendMail(payload),
    onSuccess: (data) => {
      setFeedback({
        type: 'success',
        message: data.message || `Mail successfully sent to ${data.successCount} recipients!`,
      });
      // Clear or reset fields
      if (recipientType === 'CUSTOM_EMAIL') setCustomEmails('');
      if (recipientType === 'INDIVIDUAL') setSelectedUserIds([]);
      setSubject('');
      setContent('');
      queryClient.invalidateQueries({ queryKey: ['mailStatus'] });
      queryClient.invalidateQueries({ queryKey: ['mailLogs'] });
      window.scrollTo({ top: 0, behavior: 'smooth' });
    },
    onError: (err: any) => {
      setFeedback({
        type: 'error',
        message: err.message || 'Failed to dispatch email. Check provider configuration.',
      });
      window.scrollTo({ top: 0, behavior: 'smooth' });
    },
  });

  // Resend Mutation
  const resendMutation = useMutation({
    mutationFn: (logId: string) => resendMailLog(logId),
    onSuccess: () => {
      setFeedback({
        type: 'success',
        message: 'Re-dispatch completed successfully.',
      });
      refetchLogs();
      queryClient.invalidateQueries({ queryKey: ['mailStatus'] });
    },
    onError: (err: any) => {
      setFeedback({
        type: 'error',
        message: err.message || 'Re-dispatch failed.',
      });
    },
  });

  // Handle template selection
  const handleSelectTemplate = (templateId: string) => {
    const tmpl = QUICK_TEMPLATES.find((t) => t.id === templateId);
    if (!tmpl) return;
    setSubject(tmpl.subject);
    setContent(tmpl.content);
    setCategory(tmpl.category);
    setPriority(tmpl.priority);
    setCtaText(tmpl.ctaText);
  };

  // Toggle user selection
  const toggleUserSelection = (userId: string) => {
    setSelectedUserIds((prev) =>
      prev.includes(userId) ? prev.filter((id) => id !== userId) : [...prev, userId]
    );
  };

  // Filter available users
  const filteredUsers = (recipientDirectory?.users || []).filter((u) => {
    if (!userSearch.trim()) return true;
    const term = userSearch.toLowerCase();
    return u.fullName.toLowerCase().includes(term) || u.email.toLowerCase().includes(term);
  });

  // Handle Send Submit
  const handleSend = (e: React.FormEvent) => {
    e.preventDefault();
    setFeedback(null);

    if (!subject.trim()) {
      setFeedback({ type: 'error', message: 'Please provide a subject line.' });
      return;
    }
    if (!content.trim()) {
      setFeedback({ type: 'error', message: 'Please provide message content.' });
      return;
    }

    if (recipientType === 'INDIVIDUAL' && selectedUserIds.length === 0) {
      setFeedback({ type: 'error', message: 'Please select at least one recipient user.' });
      return;
    }

    if (recipientType === 'PROJECT_TEAM' && !selectedProjectId) {
      setFeedback({ type: 'error', message: 'Please select a project to notify its team.' });
      return;
    }

    if (recipientType === 'CUSTOM_EMAIL' && !customEmails.trim()) {
      setFeedback({ type: 'error', message: 'Please specify recipient email addresses.' });
      return;
    }

    sendMutation.mutate({
      recipientType,
      recipientUserIds: recipientType === 'INDIVIDUAL' ? selectedUserIds : undefined,
      projectId: recipientType === 'PROJECT_TEAM' ? selectedProjectId : undefined,
      customEmails: recipientType === 'CUSTOM_EMAIL' ? customEmails : undefined,
      subject: subject.trim(),
      category,
      priority,
      content: content.trim(),
      ctaText: ctaText.trim() || undefined,
      ctaUrl: ctaUrl.trim() || undefined,
    });
  };

  // 1. Loading State
  if (isAuthLoading) {
    return (
      <div className="flex-1 flex items-center justify-center h-full bg-[#F5F6F8] dark:bg-[#111318]">
        <div className="flex flex-col items-center gap-3">
          <RefreshCw className="h-6 w-6 text-blue-600 animate-spin" />
          <p className="text-xs font-semibold text-slate-500">Authenticating Executive Credentials...</p>
        </div>
      </div>
    );
  }

  // 2. Unauthorized View
  if (!isAuthorized) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-6 bg-[#F5F6F8] dark:bg-[#111318]">
        <div className="max-w-md w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-8 text-center shadow-sm">
          <div className="h-14 w-14 rounded-2xl bg-rose-50 dark:bg-rose-950/50 text-rose-600 flex items-center justify-center mx-auto mb-4 border border-rose-200 dark:border-rose-900/50">
            <ShieldAlert className="h-7 w-7" />
          </div>
          <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100 mb-2">
            Access Restricted: Executive Mail Hub
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed mb-6">
            The Direct & Inside Mailing module is restricted to <strong>Super Admins</strong>, <strong>Administrators</strong>, and <strong>Project Managers</strong> (Tier 3+).
          </p>
          <div className="p-3 bg-slate-50 dark:bg-slate-800/60 rounded-xl border border-slate-200/80 dark:border-slate-700/60 text-xs text-slate-600 dark:text-slate-400 mb-6">
            <div>Your Account: <span className="font-semibold text-slate-900 dark:text-slate-200">{user?.fullName || 'User'}</span></div>
            <div>Detected Role: <span className="font-semibold text-slate-900 dark:text-slate-200">{user?.roleName || 'Member'} (Tier {roleTier || 1})</span></div>
          </div>
          <Link
            href="/dashboard"
            className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-semibold text-xs transition active:scale-95 shadow-sm"
          >
            <span>Return to Dashboard</span>
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </div>
    );
  }

  const telemetry = statusData?.telemetry;
  const primaryProvider = statusData?.primaryProvider || 'LOCAL';
  const failoverEnabled = statusData?.failoverEnabled || false;

  return (
    <div className="flex-1 flex flex-col h-full bg-[#F5F6F8] dark:bg-[#111318] overflow-y-auto">
      {/* ── TOP HEADER BANNER ── */}
      <div className="border-b border-slate-200/80 dark:border-slate-800/80 bg-white dark:bg-slate-900 px-6 py-5 transition-colors">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 max-w-7xl mx-auto">
          <div>
            <div className="flex items-center gap-2 text-xs text-slate-400 dark:text-slate-500 font-medium mb-1">
              <span>Organization</span>
              <ChevronRight className="h-3.5 w-3.5" />
              <span>Communications</span>
              <ChevronRight className="h-3.5 w-3.5" />
              <span className="text-slate-900 dark:text-slate-200 font-semibold">Mailing Center</span>
            </div>
            <div className="flex items-center gap-3">
              <h1 className="text-xl md:text-2xl font-bold text-slate-900 dark:text-slate-100 tracking-tight">
                Mailing Center & Inside Communications
              </h1>
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold bg-blue-50 dark:bg-blue-950/80 text-blue-600 dark:text-blue-400 border border-blue-200 dark:border-blue-900/50">
                <Radio className="h-3 w-3 animate-pulse text-emerald-500" />
                <span>{user?.roleName || 'Executive Authority'}</span>
              </span>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Send direct emails to users or broadcast inside communications across project teams and departments.
            </p>
          </div>

          {/* Mail Gateway Status Pill */}
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 px-3.5 py-1.5 rounded-xl bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700/80 text-xs">
              <span className="h-2 w-2 rounded-full bg-emerald-500 shrink-0"></span>
              <span className="text-slate-500 dark:text-slate-400 font-medium">Gateway:</span>
              <span className="font-bold text-slate-800 dark:text-slate-200">{primaryProvider}</span>
              {failoverEnabled && (
                <span className="text-[10px] bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-400 font-bold px-1.5 py-0.5 rounded">
                  Failover Ready
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ── MAIN CONTENT CONTAINER ── */}
      <div className="p-6 max-w-7xl mx-auto w-full space-y-6">
        {/* Feedback Alert Banner */}
        {feedback && (
          <div
            className={`p-4 rounded-xl border flex items-start justify-between gap-3 text-xs animate-in fade-in transition ${
              feedback.type === 'success'
                ? 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-200'
                : 'bg-rose-50 dark:bg-rose-950/40 border-rose-200 dark:border-rose-800 text-rose-800 dark:text-rose-200'
            }`}
          >
            <div className="flex items-center gap-2.5">
              {feedback.type === 'success' ? (
                <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
              ) : (
                <AlertCircle className="h-4 w-4 shrink-0 text-rose-600 dark:text-rose-400" />
              )}
              <span className="font-medium">{feedback.message}</span>
            </div>
            <button
              onClick={() => setFeedback(null)}
              className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
            >
              &times;
            </button>
          </div>
        )}

        {/* 1. AGGREGATE TELEMETRY KPI CARDS */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-2xl p-4 shadow-2xs">
            <div className="flex items-center justify-between text-slate-400 mb-2">
              <span className="text-[11px] font-bold uppercase tracking-wider">Total Dispatches</span>
              <Send className="h-4 w-4 text-blue-500" />
            </div>
            <div className="text-2xl font-bold text-slate-900 dark:text-slate-100">
              {telemetry?.totalDispatched ?? 0}
            </div>
            <div className="text-[11px] text-slate-400 mt-1">Direct & inside notifications</div>
          </div>

          <div className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-2xl p-4 shadow-2xs">
            <div className="flex items-center justify-between text-slate-400 mb-2">
              <span className="text-[11px] font-bold uppercase tracking-wider">Delivery Rate</span>
              <CheckCircle2 className="h-4 w-4 text-emerald-500" />
            </div>
            <div className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">
              {telemetry ? `${telemetry.successRate}%` : '100%'}
            </div>
            <div className="text-[11px] text-slate-400 mt-1">{telemetry?.totalSent ?? 0} successful transmissions</div>
          </div>

          <div className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-2xl p-4 shadow-2xs">
            <div className="flex items-center justify-between text-slate-400 mb-2">
              <span className="text-[11px] font-bold uppercase tracking-wider">Delivery Failures</span>
              <AlertTriangle className="h-4 w-4 text-amber-500" />
            </div>
            <div className="text-2xl font-bold text-slate-900 dark:text-slate-100">
              {telemetry?.totalFailed ?? 0}
            </div>
            <div className="text-[11px] text-slate-400 mt-1">Automatic failover monitored</div>
          </div>

          <div className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-2xl p-4 shadow-2xs">
            <div className="flex items-center justify-between text-slate-400 mb-2">
              <span className="text-[11px] font-bold uppercase tracking-wider">Active Gateway</span>
              <Server className="h-4 w-4 text-purple-500" />
            </div>
            <div className="text-lg font-bold text-slate-900 dark:text-slate-100 truncate">
              {primaryProvider}
            </div>
            <div className="text-[11px] text-emerald-600 dark:text-emerald-400 font-semibold mt-1">
              Multi-provider failover
            </div>
          </div>
        </div>

        {/* 2. TAB CONTROLS */}
        <div className="flex items-center gap-2 border-b border-slate-200 dark:border-slate-800 pb-px">
          <button
            onClick={() => setActiveTab('compose')}
            className={`flex items-center gap-2 px-4 py-2.5 text-xs font-bold transition border-b-2 cursor-pointer ${
              activeTab === 'compose'
                ? 'border-blue-600 text-blue-600 dark:text-blue-400'
                : 'border-transparent text-slate-500 hover:text-slate-900 dark:hover:text-slate-200'
            }`}
          >
            <Send className="h-4 w-4" />
            <span>Compose & Dispatch</span>
          </button>

          <button
            onClick={() => setActiveTab('logs')}
            className={`flex items-center gap-2 px-4 py-2.5 text-xs font-bold transition border-b-2 cursor-pointer ${
              activeTab === 'logs'
                ? 'border-blue-600 text-blue-600 dark:text-blue-400'
                : 'border-transparent text-slate-500 hover:text-slate-900 dark:hover:text-slate-200'
            }`}
          >
            <Clock className="h-4 w-4" />
            <span>Delivery & Audit Logs</span>
          </button>

          <button
            onClick={() => setActiveTab('gateways')}
            className={`flex items-center gap-2 px-4 py-2.5 text-xs font-bold transition border-b-2 cursor-pointer ${
              activeTab === 'gateways'
                ? 'border-blue-600 text-blue-600 dark:text-blue-400'
                : 'border-transparent text-slate-500 hover:text-slate-900 dark:hover:text-slate-200'
            }`}
          >
            <Server className="h-4 w-4" />
            <span>Gateway Infrastructure</span>
          </button>
        </div>

        {/* ── TAB 1: COMPOSE & DISPATCH ── */}
        {activeTab === 'compose' && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            {/* Left Column: Form (8 cols) */}
            <form onSubmit={handleSend} className="lg:col-span-7 bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-2xl p-6 shadow-2xs space-y-5">
              {/* Quick Templates Selector */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
                    <Sparkles className="h-3.5 w-3.5 text-blue-600 dark:text-blue-400" />
                    <span>Quick Fill Template</span>
                  </label>
                  <span className="text-[11px] text-slate-400">Optional speed preset</span>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {QUICK_TEMPLATES.map((tmpl) => (
                    <button
                      key={tmpl.id}
                      type="button"
                      onClick={() => handleSelectTemplate(tmpl.id)}
                      className="text-left p-2.5 rounded-xl border border-slate-200 dark:border-slate-800 hover:border-blue-500 dark:hover:border-blue-500 bg-slate-50/60 dark:bg-slate-800/40 hover:bg-blue-50/50 dark:hover:bg-blue-950/30 transition text-xs group cursor-pointer"
                    >
                      <div className="font-semibold text-slate-800 dark:text-slate-200 group-hover:text-blue-600 dark:group-hover:text-blue-400 truncate">
                        {tmpl.name}
                      </div>
                      <div className="text-[10px] text-slate-400 truncate mt-0.5">{tmpl.subject}</div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Target Scope Selection */}
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-2">
                  Recipient Scope
                </label>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  <button
                    type="button"
                    onClick={() => setRecipientType('INDIVIDUAL')}
                    className={`flex flex-col items-center justify-center p-3 rounded-xl border text-center transition cursor-pointer ${
                      recipientType === 'INDIVIDUAL'
                        ? 'border-blue-600 bg-blue-50/70 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 font-bold shadow-2xs'
                        : 'border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/50 text-slate-600 dark:text-slate-400'
                    }`}
                  >
                    <Users className="h-5 w-5 mb-1.5" />
                    <span className="text-xs">Direct Users</span>
                    <span className="text-[10px] font-normal text-slate-400 mt-0.5">Pick team members</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setRecipientType('PROJECT_TEAM')}
                    className={`flex flex-col items-center justify-center p-3 rounded-xl border text-center transition cursor-pointer ${
                      recipientType === 'PROJECT_TEAM'
                        ? 'border-blue-600 bg-blue-50/70 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 font-bold shadow-2xs'
                        : 'border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/50 text-slate-600 dark:text-slate-400'
                    }`}
                  >
                    <FolderGit2 className="h-5 w-5 mb-1.5" />
                    <span className="text-xs">Project Team</span>
                    <span className="text-[10px] font-normal text-slate-400 mt-0.5">Inside team broadcast</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setRecipientType('INTERNAL_ALL')}
                    className={`flex flex-col items-center justify-center p-3 rounded-xl border text-center transition cursor-pointer ${
                      recipientType === 'INTERNAL_ALL'
                        ? 'border-blue-600 bg-blue-50/70 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 font-bold shadow-2xs'
                        : 'border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/50 text-slate-600 dark:text-slate-400'
                    }`}
                  >
                    <Globe className="h-5 w-5 mb-1.5" />
                    <span className="text-xs">All Staff</span>
                    <span className="text-[10px] font-normal text-slate-400 mt-0.5">Organization-wide</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setRecipientType('CUSTOM_EMAIL')}
                    className={`flex flex-col items-center justify-center p-3 rounded-xl border text-center transition cursor-pointer ${
                      recipientType === 'CUSTOM_EMAIL'
                        ? 'border-blue-600 bg-blue-50/70 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 font-bold shadow-2xs'
                        : 'border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/50 text-slate-600 dark:text-slate-400'
                    }`}
                  >
                    <AtSign className="h-5 w-5 mb-1.5" />
                    <span className="text-xs">Custom Email</span>
                    <span className="text-[10px] font-normal text-slate-400 mt-0.5">Ad-hoc addresses</span>
                  </button>
                </div>
              </div>

              {/* Dynamic Recipient Selectors */}
              {recipientType === 'INDIVIDUAL' && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                      Select Target Users ({selectedUserIds.length} selected)
                    </label>
                    {selectedUserIds.length > 0 && (
                      <button
                        type="button"
                        onClick={() => setSelectedUserIds([])}
                        className="text-[11px] text-blue-600 hover:underline"
                      >
                        Clear Selection
                      </button>
                    )}
                  </div>

                  {/* Search users */}
                  <div className="relative">
                    <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-slate-400" />
                    <input
                      type="text"
                      placeholder="Search employees by name or email..."
                      value={userSearch}
                      onChange={(e) => setUserSearch(e.target.value)}
                      className="w-full pl-9 pr-3 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/50 text-xs text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>

                  {/* Users Chip list / check grid */}
                  <div className="max-h-48 overflow-y-auto border border-slate-200 dark:border-slate-800 rounded-xl p-2 space-y-1 bg-slate-50/30 dark:bg-slate-900/50">
                    {filteredUsers.length === 0 ? (
                      <div className="text-center py-4 text-xs text-slate-400">No matching users found</div>
                    ) : (
                      filteredUsers.map((u) => {
                        const isSelected = selectedUserIds.includes(u.id);
                        return (
                          <div
                            key={u.id}
                            onClick={() => toggleUserSelection(u.id)}
                            className={`flex items-center justify-between p-2 rounded-lg text-xs cursor-pointer transition select-none ${
                              isSelected
                                ? 'bg-blue-50 dark:bg-blue-950/80 text-blue-900 dark:text-blue-200 font-semibold'
                                : 'hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300'
                            }`}
                          >
                            <div className="flex items-center gap-2.5 min-w-0">
                              <div className="h-6 w-6 rounded-full bg-blue-600 text-white font-bold text-[10px] flex items-center justify-center shrink-0">
                                {u.fullName.charAt(0)}
                              </div>
                              <div className="truncate">
                                <div>{u.fullName}</div>
                                <div className="text-[10px] text-slate-400">{u.email}</div>
                              </div>
                            </div>
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={() => {}}
                              className="h-4 w-4 rounded text-blue-600 cursor-pointer"
                            />
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>
              )}

              {recipientType === 'PROJECT_TEAM' && (
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                    Target Project (Notifies all assigned members & project managers)
                  </label>
                  <select
                    value={selectedProjectId}
                    onChange={(e) => setSelectedProjectId(e.target.value)}
                    className="w-full px-3 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/50 text-xs text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="">Select a project to broadcast to...</option>
                    {(recipientDirectory?.projects || []).map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name} ({p.key})
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {recipientType === 'INTERNAL_ALL' && (
                <div className="p-3 bg-purple-50 dark:bg-purple-950/40 border border-purple-200 dark:border-purple-900/50 rounded-xl text-xs text-purple-800 dark:text-purple-300 flex items-center gap-2.5">
                  <Globe className="h-4 w-4 shrink-0 text-purple-600" />
                  <span>
                    Broadcasting inside memo to <strong>all active internal organization employees</strong> ({recipientDirectory?.users?.length || 0} registered).
                  </span>
                </div>
              )}

              {recipientType === 'CUSTOM_EMAIL' && (
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                    Recipient Email Addresses (Comma-separated for multiple)
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. employee@amrita.edu, lead@amrita.edu"
                    value={customEmails}
                    onChange={(e) => setCustomEmails(e.target.value)}
                    className="w-full px-3 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/50 text-xs text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              )}

              {/* Category & Priority Row */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                    Category Tag
                  </label>
                  <select
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                    className="w-full px-3 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/50 text-xs text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="DIRECT_MAIL">Direct Mail</option>
                    <option value="INTERNAL_ANNOUNCEMENT">Internal Announcement</option>
                    <option value="PROJECT_UPDATE">Project Update</option>
                    <option value="URGENT_NOTICE">Urgent Notice</option>
                    <option value="TASK_DIRECTIVE">Task Directive</option>
                    <option value="INTERNAL_MEMO">Internal Memo</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                    Priority Level
                  </label>
                  <select
                    value={priority}
                    onChange={(e) => setPriority(e.target.value as any)}
                    className="w-full px-3 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/50 text-xs text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="LOW">Low</option>
                    <option value="NORMAL">Normal</option>
                    <option value="HIGH">High</option>
                    <option value="URGENT">Urgent (Red Alert Badge)</option>
                  </select>
                </div>
              </div>

              {/* Subject Line */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                  Subject Line *
                </label>
                <input
                  type="text"
                  placeholder="Enter clear, informative email subject..."
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  required
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/50 text-xs text-slate-900 dark:text-slate-100 font-medium placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              {/* Message Content */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                    Message Body *
                  </label>
                  <span className="text-[11px] text-slate-400">{content.length} characters</span>
                </div>
                <textarea
                  rows={6}
                  placeholder="Write message content here... Paragraphs separated by blank lines will be formatted into styled blocks."
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  required
                  className="w-full p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/50 text-xs text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 leading-relaxed font-sans"
                />
              </div>

              {/* Optional Call to Action Button */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-1 border-t border-slate-100 dark:border-slate-800/80">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                    Action Button Label
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Open Kanban Board"
                    value={ctaText}
                    onChange={(e) => setCtaText(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/50 text-xs text-slate-900 dark:text-slate-100"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                    Target URL (Optional)
                  </label>
                  <input
                    type="text"
                    placeholder="Leave empty for CoreTrack home"
                    value={ctaUrl}
                    onChange={(e) => setCtaUrl(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/50 text-xs text-slate-900 dark:text-slate-100"
                  />
                </div>
              </div>

              {/* Action Buttons Row */}
              <div className="flex items-center justify-between pt-4 border-t border-slate-100 dark:border-slate-800/80">
                <div className="text-[11px] text-slate-400">
                  Transmitting as: <strong className="text-slate-700 dark:text-slate-300">{user?.fullName}</strong> ({user?.email})
                </div>

                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => setIsPreviewOpen((prev) => !prev)}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 text-xs font-semibold transition cursor-pointer"
                  >
                    {isPreviewOpen ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                    <span>{isPreviewOpen ? 'Hide Preview' : 'Preview Email'}</span>
                  </button>

                  <button
                    type="submit"
                    disabled={sendMutation.isPending}
                    className="inline-flex items-center gap-2 px-5 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-semibold text-xs transition active:scale-95 shadow-sm cursor-pointer"
                  >
                    {sendMutation.isPending ? (
                      <>
                        <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                        <span>Transmitting...</span>
                      </>
                    ) : (
                      <>
                        <Send className="h-3.5 w-3.5" />
                        <span>Dispatch Mail</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            </form>

            {/* Right Column: Live Email Preview (5 cols) */}
            <div className="lg:col-span-5 space-y-4">
              <div className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-2xl p-5 shadow-2xs">
                <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
                  <div className="flex items-center gap-2">
                    <Inbox className="h-4 w-4 text-blue-600" />
                    <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300">
                      Recipient Inbox Preview
                    </h3>
                  </div>
                  <span className="text-[10px] text-slate-400 font-mono">Branded HTML Card</span>
                </div>

                {/* Rendered Mock Email Box */}
                <div className="mt-4 border border-slate-200 dark:border-slate-700/80 rounded-xl overflow-hidden shadow-xs bg-slate-50 dark:bg-slate-950/40 text-slate-900 dark:text-slate-100">
                  {/* Mock Email Header */}
                  <div className="bg-slate-900 text-white px-4 py-3 flex items-center justify-between">
                    <div className="font-extrabold text-xs text-blue-400 tracking-tight">CoreTrack</div>
                    <span
                      className={`text-[9px] font-bold uppercase px-2 py-0.5 rounded-full text-white ${
                        priority === 'URGENT' || category === 'URGENT_NOTICE'
                          ? 'bg-rose-600'
                          : category === 'PROJECT_UPDATE'
                          ? 'bg-emerald-600'
                          : category === 'INTERNAL_ANNOUNCEMENT'
                          ? 'bg-purple-600'
                          : 'bg-blue-600'
                      }`}
                    >
                      {category.replace(/_/g, ' ')}
                    </span>
                  </div>

                  {/* Mock Email Body */}
                  <div className="p-4 space-y-3 bg-white dark:bg-slate-900">
                    <div className="text-base font-bold text-slate-900 dark:text-slate-100 leading-snug">
                      {priority === 'URGENT' ? `[URGENT] ${subject || 'Subject will appear here...'}` : subject || 'Subject will appear here...'}
                    </div>

                    <div className="text-xs text-slate-500">
                      Hello Team Member,
                    </div>

                    <div className="p-3 bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700/60 rounded-xl text-xs text-slate-700 dark:text-slate-300 whitespace-pre-wrap leading-relaxed font-sans min-h-[80px]">
                      {content || 'Your formatted message body will render inside this container with high clarity and contrast.'}
                    </div>

                    {/* Metadata table in email */}
                    <div className="pt-2 border-t border-slate-100 dark:border-slate-800 text-[11px] text-slate-500 space-y-1">
                      <div className="flex justify-between">
                        <span>Sent by:</span>
                        <span className="font-semibold text-slate-700 dark:text-slate-300">{user?.fullName || 'Active Executive'}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Gateway:</span>
                        <span className="font-semibold text-slate-700 dark:text-slate-300">{primaryProvider}</span>
                      </div>
                    </div>

                    {/* CTA Button */}
                    <div className="pt-2">
                      <div className="inline-block px-4 py-2 bg-blue-600 text-white rounded-lg text-xs font-bold text-center">
                        {ctaText || 'Open CoreTrack'} &rarr;
                      </div>
                    </div>
                  </div>

                  {/* Mock Footer */}
                  <div className="p-3 bg-slate-100 dark:bg-slate-800/80 border-t border-slate-200 dark:border-slate-700/80 text-[10px] text-slate-400 text-center">
                    CoreTrack Task & Project Management &bull; Amrita Vishwa Vidyapeetham
                  </div>
                </div>

                {/* Recipient summary helper */}
                <div className="mt-4 p-3 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200/80 dark:border-slate-800 text-xs text-slate-500 space-y-1">
                  <div className="font-semibold text-slate-700 dark:text-slate-300">Target Summary:</div>
                  <div>
                    {recipientType === 'INDIVIDUAL' && `${selectedUserIds.length} employee(s) selected.`}
                    {recipientType === 'PROJECT_TEAM' && (selectedProjectId ? 'All assigned members of selected project.' : 'Select a project to preview audience.')}
                    {recipientType === 'INTERNAL_ALL' && 'All internal employees across organization.'}
                    {recipientType === 'CUSTOM_EMAIL' && (customEmails ? `Custom: ${customEmails}` : 'Specify comma-separated emails.')}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ── TAB 2: AUDIT & DELIVERY LOGS ── */}
        {activeTab === 'logs' && (
          <div className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-2xl p-6 shadow-2xs space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                  Email Delivery & Audit Logs
                </h3>
                <p className="text-xs text-slate-400">
                  Full historical audit record of direct communications, notifications, and provider failover events.
                </p>
              </div>

              {/* Filters */}
              <div className="flex items-center gap-2">
                {/* Search */}
                <div className="relative">
                  <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-slate-400" />
                  <input
                    type="text"
                    placeholder="Search logs..."
                    value={logsSearch}
                    onChange={(e) => {
                      setLogsSearch(e.target.value);
                      setLogsPage(1);
                    }}
                    className="pl-8 pr-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/50 text-xs text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500 w-44 sm:w-56"
                  />
                </div>

                {/* Status Filter */}
                <select
                  value={logsStatusFilter}
                  onChange={(e) => {
                    setLogsStatusFilter(e.target.value as any);
                    setLogsPage(1);
                  }}
                  className="px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/50 text-xs text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="ALL">All Statuses</option>
                  <option value="SENT">Sent</option>
                  <option value="FAILED">Failed</option>
                </select>

                <button
                  onClick={() => refetchLogs()}
                  className="p-2 rounded-xl border border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-500 hover:text-slate-900 dark:hover:text-slate-100 transition cursor-pointer"
                  title="Refresh logs"
                >
                  <RefreshCw className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>

            {/* Logs Table */}
            <div className="border border-slate-200/80 dark:border-slate-800 rounded-xl overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-slate-200/80 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/50 text-slate-500 font-bold uppercase text-[10px] tracking-wider">
                    <th className="py-3 px-4">Recipient</th>
                    <th className="py-3 px-4">Subject</th>
                    <th className="py-3 px-4">Category</th>
                    <th className="py-3 px-4">Gateway</th>
                    <th className="py-3 px-4">Status</th>
                    <th className="py-3 px-4">Dispatched At</th>
                    <th className="py-3 px-4 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">
                  {isLogsLoading ? (
                    <tr>
                      <td colSpan={7} className="text-center py-8 text-slate-400">
                        <RefreshCw className="h-5 w-5 animate-spin mx-auto mb-2 text-blue-600" />
                        Loading transmission logs...
                      </td>
                    </tr>
                  ) : (logsData?.logs || []).length === 0 ? (
                    <tr>
                      <td colSpan={7} className="text-center py-8 text-slate-400">
                        No transmission records match your filter criteria.
                      </td>
                    </tr>
                  ) : (
                    (logsData?.logs || []).map((log) => (
                      <tr key={log.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/40 transition">
                        <td className="py-3 px-4">
                          <div className="font-semibold text-slate-800 dark:text-slate-200">
                            {log.recipientName || log.recipientEmail.split('@')[0]}
                          </div>
                          <div className="text-[10px] text-slate-400 font-mono">{log.recipientEmail}</div>
                        </td>
                        <td className="py-3 px-4 max-w-xs truncate font-medium text-slate-700 dark:text-slate-300">
                          {log.subject}
                        </td>
                        <td className="py-3 px-4">
                          <span className="inline-block px-2 py-0.5 rounded text-[10px] font-bold bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
                            {log.notificationType.replace(/_/g, ' ')}
                          </span>
                        </td>
                        <td className="py-3 px-4">
                          <span className="font-mono text-[11px] text-slate-600 dark:text-slate-400">
                            {log.provider}
                          </span>
                        </td>
                        <td className="py-3 px-4">
                          <span
                            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold ${
                              log.status === 'SENT'
                                ? 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-900/50'
                                : 'bg-rose-50 dark:bg-rose-950/60 text-rose-700 dark:text-rose-400 border border-rose-200 dark:border-rose-900/50'
                            }`}
                          >
                            <span
                              className={`h-1.5 w-1.5 rounded-full ${
                                log.status === 'SENT' ? 'bg-emerald-500' : 'bg-rose-500'
                              }`}
                            ></span>
                            {log.status}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-slate-500 text-[11px]">
                          {new Date(log.sentAt).toLocaleString([], {
                            month: 'short',
                            day: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </td>
                        <td className="py-3 px-4 text-right">
                          <button
                            onClick={() => resendMutation.mutate(log.id)}
                            disabled={resendMutation.isPending}
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-slate-200 dark:border-slate-700 text-[11px] font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition cursor-pointer"
                            title="Re-transmit notification"
                          >
                            <RefreshCw className="h-3 w-3" />
                            <span>Resend</span>
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {logsData?.pagination && logsData.pagination.totalPages > 1 && (
              <div className="flex items-center justify-between text-xs text-slate-500 pt-2">
                <div>
                  Page {logsData.pagination.page} of {logsData.pagination.totalPages} ({logsData.pagination.total} total)
                </div>
                <div className="flex items-center gap-2">
                  <button
                    disabled={logsPage <= 1}
                    onClick={() => setLogsPage((p) => Math.max(1, p - 1))}
                    className="px-3 py-1 rounded-lg border border-slate-200 dark:border-slate-800 disabled:opacity-40"
                  >
                    Previous
                  </button>
                  <button
                    disabled={logsPage >= logsData.pagination.totalPages}
                    onClick={() => setLogsPage((p) => p + 1)}
                    className="px-3 py-1 rounded-lg border border-slate-200 dark:border-slate-800 disabled:opacity-40"
                  >
                    Next
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── TAB 3: GATEWAY INFRASTRUCTURE ── */}
        {activeTab === 'gateways' && (
          <div className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-2xl p-6 shadow-2xs space-y-6">
            <div>
              <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                Multi-Provider Transmission Architecture
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">
                CoreTrack features automatic sub-second gateway failover. If an enterprise SMTP quota exhausts or encounters transient network blocks, transmission immediately falls over to the backup provider without losing message telemetry.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {(statusData?.providers || []).map((provider) => (
                <div
                  key={provider.name}
                  className="border border-slate-200/80 dark:border-slate-800 rounded-2xl p-4 bg-slate-50/50 dark:bg-slate-800/40 space-y-3"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                      Priority {provider.priority}
                    </span>
                    <span
                      className={`h-2 w-2 rounded-full ${
                        provider.name === primaryProvider ? 'bg-emerald-500 animate-pulse' : 'bg-slate-400'
                      }`}
                    ></span>
                  </div>
                  <div>
                    <div className="text-base font-bold text-slate-900 dark:text-slate-100">
                      {provider.name}
                    </div>
                    <div className="text-xs text-slate-500 truncate font-mono mt-0.5">
                      From: {provider.from}
                    </div>
                  </div>
                  <div className="text-[11px] text-slate-500">
                    {provider.name === 'RESEND' && 'Primary high-throughput transactional gateway via smtp.resend.com.'}
                    {provider.name === 'MAILJET' && 'Secondary enterprise failover relay via in-v3.mailjet.com.'}
                    {provider.name === 'CUSTOM_SMTP' && 'Corporate internal relay configured via custom SMTP credentials.'}
                    {provider.name === 'LOCAL' && 'Development/staging mock transporter with lossless telemetry logs.'}
                  </div>
                  <div className="pt-2 border-t border-slate-200/60 dark:border-slate-700/60 flex items-center justify-between text-[11px]">
                    <span className="text-slate-400">Status</span>
                    <span className="font-semibold text-emerald-600 dark:text-emerald-400">Active & Ready</span>
                  </div>
                </div>
              ))}
            </div>

            <div className="p-4 rounded-xl bg-blue-50/60 dark:bg-blue-950/40 border border-blue-200/80 dark:border-blue-900/50 text-xs text-blue-900 dark:text-blue-300 space-y-2">
              <div className="font-bold flex items-center gap-2">
                <ShieldAlert className="h-4 w-4 text-blue-600" />
                <span>Executive Security & Audit Compliance</span>
              </div>
              <p className="text-slate-600 dark:text-slate-300 leading-relaxed">
                All communications triggered from this interface are timestamped, logged with cryptographic IDs, and tied directly to the dispatching executive ({user?.email}). Recipients receive official CoreTrack emails with sender attribution and security watermarks.
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
