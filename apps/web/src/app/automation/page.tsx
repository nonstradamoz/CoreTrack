'use client';

import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useProject } from '../../context/ProjectContext';
import {
  fetchAutomationRules,
  createAutomationRule,
  updateAutomationRule,
  deleteAutomationRule,
  importBatchTasks,
  getExportCsvUrl,
  fetchAvailableUsers,
  triggerDeadlineScan,
  fetchEmailNotificationLogs,
  clearEmailNotificationLogs,
  fetchEmailProviders,
  AutomationRule,
  DeadlineScanSummary,
  EmailNotificationLog,
  EmailProviderStatus,
} from '../../lib/api';
import {
  Zap,
  Plus,
  Play,
  Trash2,
  CheckCircle2,
  AlertTriangle,
  Upload,
  Download,
  Clock,
  Sparkles,
  ArrowRight,
  ShieldAlert,
  X,
  FileSpreadsheet,
  Mail,
  RefreshCw,
  Send,
  ShieldCheck,
  Calendar,
} from 'lucide-react';
import { usePermissions } from '../../hooks/usePermissions';
import { useModuleAccess } from '../../hooks/useModuleAccess';
import { AccessDenied } from '../../components/auth/AccessDenied';
import { Permissions } from '../../lib/permissions';

export default function AutomationPage() {
  const queryClient = useQueryClient();
  const { activeProject } = useProject();
  const { hasPermission } = usePermissions();
  const { canAccess, isLoading: isAccessLoading } = useModuleAccess();
  const canManageAutomation = hasPermission(Permissions.AUTOMATION_MANAGE);

  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [importText, setImportText] = useState('');
  const [importStatus, setImportStatus] = useState<string | null>(null);

  // New Rule Form State
  const [ruleName, setRuleName] = useState('');
  const [ruleDescription, setRuleDescription] = useState('');
  const [triggerType, setTriggerType] = useState<AutomationRule['triggerType']>('TASK_CREATED');
  const [condField, setCondField] = useState('priority');
  const [condOperator, setCondOperator] = useState('EQUALS');
  const [condValue, setCondValue] = useState('URGENT');
  const [actionType, setActionType] = useState('SET_PRIORITY');
  const [actionValue, setActionValue] = useState('URGENT');
  const [commentScope, setCommentScope] = useState<'INTERNAL_ONLY' | 'PUBLIC'>('INTERNAL_ONLY');

  // Queries
  const { data: rules = [], isLoading } = useQuery({
    queryKey: ['automationRules', activeProject?.key],
    queryFn: () => (activeProject ? fetchAutomationRules(activeProject.key) : Promise.resolve([])),
    enabled: !!activeProject,
  });

  const { data: availableUsers = [] } = useQuery({
    queryKey: ['availableUsers'],
    queryFn: fetchAvailableUsers,
  });

  // Email & Deadline Scan State & Queries
  const [scanResult, setScanResult] = useState<DeadlineScanSummary | null>(null);

  const { data: emailLogs = [], isLoading: isLoadingEmailLogs, refetch: refetchEmailLogs } = useQuery({
    queryKey: ['emailNotificationLogs'],
    queryFn: () => fetchEmailNotificationLogs(20),
  });

  const { data: emailProviders } = useQuery({
    queryKey: ['emailProviders'],
    queryFn: fetchEmailProviders,
  });

  const scanDeadlinesMutation = useMutation({
    mutationFn: triggerDeadlineScan,
    onSuccess: (res) => {
      setScanResult(res.data);
      queryClient.invalidateQueries({ queryKey: ['emailNotificationLogs'] });
      queryClient.invalidateQueries({ queryKey: ['recentEmailNotificationLogs'] });
      queryClient.invalidateQueries({ queryKey: ['tickets'] });
      queryClient.invalidateQueries({ queryKey: ['projects'] });
    },
  });

  const clearEmailLogsMutation = useMutation({
    mutationFn: clearEmailNotificationLogs,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['emailNotificationLogs'] });
      queryClient.invalidateQueries({ queryKey: ['recentEmailNotificationLogs'] });
    },
  });

  // Mutations
  const createRuleMutation = useMutation({
    mutationFn: (data: Parameters<typeof createAutomationRule>[1]) =>
      createAutomationRule(activeProject!.key, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['automationRules', activeProject?.key] });
      setIsCreateModalOpen(false);
      resetForm();
    },
  });

  const toggleRuleMutation = useMutation({
    mutationFn: ({ ruleId, isActive }: { ruleId: string; isActive: boolean }) =>
      updateAutomationRule(activeProject!.key, ruleId, { isActive }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['automationRules', activeProject?.key] });
    },
  });

  const deleteRuleMutation = useMutation({
    mutationFn: (ruleId: string) => deleteAutomationRule(activeProject!.key, ruleId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['automationRules', activeProject?.key] });
    },
  });

  const importMutation = useMutation({
    mutationFn: (tasks: any[]) => importBatchTasks(activeProject!.key, tasks),
    onSuccess: (data) => {
      setImportStatus(`Successfully imported ${data.importedCount} tasks!`);
      queryClient.invalidateQueries({ queryKey: ['tickets'] });
      setTimeout(() => {
        setIsImportModalOpen(false);
        setImportText('');
        setImportStatus(null);
      }, 1500);
    },
    onError: (err: Error) => {
      setImportStatus(`Import failed: ${err.message}`);
    },
  });

  function resetForm() {
    setRuleName('');
    setRuleDescription('');
    setTriggerType('TASK_CREATED');
    setCondField('priority');
    setCondOperator('EQUALS');
    setCondValue('URGENT');
    setActionType('SET_PRIORITY');
    setActionValue('URGENT');
  }

  function applyTemplate(templateName: string) {
    if (templateName === 'urgent_incident') {
      setRuleName('Auto-Assign Urgent Incidents');
      setRuleDescription('When an urgent incident is filed, auto-assign to lead engineer and set a 2-day deadline.');
      setTriggerType('TASK_CREATED');
      setCondField('ticketType');
      setCondOperator('EQUALS');
      setCondValue('INCIDENT');
      setActionType('ADD_DEADLINE_DAYS');
      setActionValue('2');
    } else if (templateName === 'bug_escalate') {
      setRuleName('Escalate Bugs on Code Review');
      setRuleDescription('When any bug transitions to In Review, elevate its priority to High.');
      setTriggerType('STATUS_CHANGED');
      setCondField('status');
      setCondOperator('EQUALS');
      setCondValue('IN_REVIEW');
      setActionType('SET_PRIORITY');
      setActionValue('HIGH');
    } else if (templateName === 'approval_note') {
      setRuleName('Approval Sign-off Reminder Note');
      setRuleDescription('Post internal staff notification when task is waiting for management sign-off.');
      setTriggerType('STATUS_CHANGED');
      setCondField('status');
      setCondOperator('EQUALS');
      setCondValue('PENDING_APPROVAL');
      setActionType('ADD_COMMENT');
      setActionValue('Formal ITIL multi-tier approval requested. SLA clock paused.');
    }
    setIsCreateModalOpen(true);
  }

  function handleCreateRule(e: React.FormEvent) {
    e.preventDefault();
    if (!ruleName.trim()) return;

    createRuleMutation.mutate({
      name: ruleName.trim(),
      description: ruleDescription.trim() || undefined,
      triggerType,
      conditions: condField ? [{ field: condField, operator: condOperator, value: condValue }] : [],
      actions: [
        {
          type: actionType,
          value: actionValue,
          extra: actionType === 'ADD_COMMENT' ? { visibilityScope: commentScope } : undefined,
        },
      ],
      isActive: true,
    });
  }

  function handleParseAndImport() {
    if (!importText.trim()) return;
    try {
      const lines = importText.trim().split('\n');
      const tasks: any[] = [];
      const isHeader = lines[0].toLowerCase().includes('title') || lines[0].toLowerCase().includes('summary');
      const startIdx = isHeader ? 1 : 0;

      for (let i = startIdx; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;
        const parts = line.split(',').map((p) => p.trim().replace(/^"|"$/g, ''));
        tasks.push({
          title: parts[0] || 'Imported Task',
          ticketType: parts[1] || 'TASK',
          priority: parts[2] || 'MEDIUM',
          status: parts[3] || 'TODO',
          description: parts[4] || '',
        });
      }

      if (tasks.length === 0) {
        setImportStatus('No valid tasks parsed. Ensure CSV format has at least Title per row.');
        return;
      }

      importMutation.mutate(tasks);
    } catch {
      setImportStatus('Error parsing CSV format. Please verify structure.');
    }
  }

  const totalExecutions = rules.reduce((acc, r) => acc + (r.executionCount || 0), 0);
  const activeRulesCount = rules.filter((r) => r.isActive).length;

  if (!isAccessLoading && !canAccess('automation')) return <AccessDenied module="Automation" requiredRole="Manager or above" />;

  return (
    <div className="flex-1 flex flex-col min-w-0 p-4 sm:p-6 lg:p-8 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-200 dark:border-slate-800">
        <div>
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-xl bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400">
              <Zap className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
                Automation
              </h1>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Workflow triggers, actions, and loop safety guards.
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {activeProject && (
            <a
              href={getExportCsvUrl(activeProject.key)}
              download
              className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800 text-xs font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-1.5 shadow-2xs transition"
            >
              <Download className="h-3.5 w-3.5" />
              <span>Export</span>
            </a>
          )}
          <button
            onClick={() => setIsImportModalOpen(true)}
            className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800 text-xs font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-1.5 shadow-2xs transition cursor-pointer"
          >
            <Upload className="h-3.5 w-3.5" />
            <span>Import</span>
          </button>
          <button
            onClick={() => {
              if (!canManageAutomation) return;
              resetForm();
              setIsCreateModalOpen(true);
            }}
            disabled={!canManageAutomation}
            title={!canManageAutomation ? 'Requires Manage Automation permission' : undefined}
            className={`px-3.5 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold flex items-center gap-1.5 shadow-2xs transition ${
              !canManageAutomation ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer'
            }`}
          >
            <Plus className="h-4 w-4" />
            <span>New Rule</span>
          </button>
        </div>
      </div>

      {/* KPI Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-2xs">
          <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400">Active Rules</span>
          <div className="mt-1 flex items-baseline gap-2">
            <span className="text-2xl font-bold text-slate-900 dark:text-slate-100">{activeRulesCount}</span>
            <span className="text-xs text-slate-400">/ {rules.length} total</span>
          </div>
        </div>
        <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-2xs">
          <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400">Executions</span>
          <div className="mt-1 flex items-baseline gap-2">
            <span className="text-2xl font-bold text-blue-600 dark:text-blue-400">{totalExecutions}</span>
            <span className="text-xs text-slate-400">triggers fired</span>
          </div>
        </div>
        <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-2xs">
          <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400">Loop Guard</span>
          <div className="mt-1 flex items-center gap-2">
            <span className="px-2 py-0.5 rounded font-mono font-bold text-xs bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
              Depth &le; 3
            </span>
            <span className="text-[11px] text-slate-400">Active</span>
          </div>
        </div>
      </div>

      {/* Automated Deadline & Email Notification Engine Card */}
      <div className="p-5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-2xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-100 dark:border-slate-800">
          <div className="flex items-start gap-3">
            <div className="p-2.5 rounded-xl bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 mt-0.5">
              <Mail className="h-5 w-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">
                  Automated Deadline & Email Notification Engine
                </h2>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 flex items-center gap-1">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                  Active Hourly Cron
                </span>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Automatically assigns backlog items nearing deadlines (&le; 3 days) into sprints, alerts assignees on project/task allocations, and escalates overdue deadlines to higher authorities with 24h deduplication cooldowns.
              </p>

              {emailProviders && emailProviders.providers.length > 0 && (
                <div className="flex flex-wrap items-center gap-1.5 pt-2 text-[11px]">
                  <span className="font-semibold text-slate-700 dark:text-slate-300">Failover Chain:</span>
                  {emailProviders.providers.map((p, idx) => (
                    <span key={p.name} className="inline-flex items-center gap-1">
                      <span className={`px-2 py-0.5 rounded font-mono font-bold text-[10px] ${
                        p.name === 'RESEND'
                          ? 'bg-purple-50 text-purple-700 border border-purple-200 dark:bg-purple-950/60 dark:text-purple-300 dark:border-purple-800'
                          : p.name === 'MAILJET'
                          ? 'bg-amber-50 text-amber-700 border border-amber-200 dark:bg-amber-950/60 dark:text-amber-300 dark:border-amber-800'
                          : 'bg-slate-100 text-slate-700 border border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700'
                      }`}>
                        {p.name} {p.priority === 1 ? '(Primary)' : '(Failover)'}
                      </span>
                      {idx < emailProviders.providers.length - 1 && <span className="text-slate-400">➔</span>}
                    </span>
                  ))}
                  {emailProviders.failoverEnabled && (
                    <span className="ml-1 text-[10px] font-medium text-emerald-600 dark:text-emerald-400">
                      ✓ Auto-Failover Enabled
                    </span>
                  )}
                </div>
              )}
            </div>
          </div>

          <button
            onClick={() => scanDeadlinesMutation.mutate()}
            disabled={scanDeadlinesMutation.isPending}
            className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold flex items-center justify-center gap-2 shadow-xs transition cursor-pointer disabled:opacity-50 shrink-0"
          >
            <RefreshCw className={`h-4 w-4 ${scanDeadlinesMutation.isPending ? 'animate-spin' : ''}`} />
            <span>{scanDeadlinesMutation.isPending ? 'Running SLA Scan...' : 'Run Deadline & SLA Scan Now'}</span>
          </button>
        </div>

        {/* Engine Feature Badges */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="p-3 rounded-xl border border-indigo-100 dark:border-indigo-950/60 bg-indigo-50/30 dark:bg-indigo-950/20 flex items-start gap-2.5">
            <Calendar className="h-4 w-4 text-indigo-600 dark:text-indigo-400 mt-0.5 shrink-0" />
            <div>
              <h4 className="text-xs font-bold text-indigo-950 dark:text-indigo-200">Auto-Sprint Allocation</h4>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                Backlog tasks &le; 3 days to deadline are moved to Active Sprint and notify Assignee & PM.
              </p>
            </div>
          </div>
          <div className="p-3 rounded-xl border border-rose-100 dark:border-rose-950/60 bg-rose-50/30 dark:bg-rose-950/20 flex items-start gap-2.5">
            <AlertTriangle className="h-4 w-4 text-rose-600 dark:text-rose-400 mt-0.5 shrink-0" />
            <div>
              <h4 className="text-xs font-bold text-rose-950 dark:text-rose-200">Overdue Task Escalation</h4>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                Unfinished tasks past deadline trigger automated escalation emails to PM, TL, and Assignee.
              </p>
            </div>
          </div>
          <div className="p-3 rounded-xl border border-amber-100 dark:border-amber-950/60 bg-amber-50/30 dark:bg-amber-950/20 flex items-start gap-2.5">
            <ShieldCheck className="h-4 w-4 text-amber-600 dark:text-amber-400 mt-0.5 shrink-0" />
            <div>
              <h4 className="text-xs font-bold text-amber-950 dark:text-amber-200">Overdue Project Escalation</h4>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                Projects past deadline escalate to Project Managers, Reviewers, and Org Super Admins.
              </p>
            </div>
          </div>
        </div>

        {/* Scan Result Banner (if scan was run) */}
        {scanResult && (
          <div className="p-4 rounded-xl border border-emerald-200 dark:border-emerald-800 bg-emerald-50/60 dark:bg-emerald-950/30 space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                <h4 className="text-xs font-bold text-emerald-900 dark:text-emerald-200">
                  Scan Execution Complete at {new Date(scanResult.timestamp).toLocaleTimeString()}
                </h4>
              </div>
              <button
                onClick={() => setScanResult(null)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 text-xs cursor-pointer"
              >
                Dismiss
              </button>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs pt-1">
              <div className="p-2 rounded-lg bg-white/80 dark:bg-slate-900/80 border border-emerald-100 dark:border-emerald-900">
                <span className="text-[10px] text-slate-500 block">Sprint Promoted</span>
                <span className="font-bold text-emerald-700 dark:text-emerald-300 text-base">{scanResult.tasksPromotedToSprint}</span>
              </div>
              <div className="p-2 rounded-lg bg-white/80 dark:bg-slate-900/80 border border-emerald-100 dark:border-emerald-900">
                <span className="text-[10px] text-slate-500 block">Task Overdues</span>
                <span className="font-bold text-rose-600 dark:text-rose-400 text-base">{scanResult.overdueTasksEscalated}</span>
              </div>
              <div className="p-2 rounded-lg bg-white/80 dark:bg-slate-900/80 border border-emerald-100 dark:border-emerald-900">
                <span className="text-[10px] text-slate-500 block">Project Overdues</span>
                <span className="font-bold text-amber-600 dark:text-amber-400 text-base">{scanResult.overdueProjectsEscalated}</span>
              </div>
              <div className="p-2 rounded-lg bg-white/80 dark:bg-slate-900/80 border border-emerald-100 dark:border-emerald-900">
                <span className="text-[10px] text-slate-500 block">Emails Dispatched</span>
                <span className="font-bold text-indigo-600 dark:text-indigo-400 text-base">{scanResult.totalEmailsDispatched}</span>
              </div>
            </div>
          </div>
        )}

        {/* Recent Outgoing Email Notification Audit Logs */}
        <div className="pt-2">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-xs font-bold text-slate-800 dark:text-slate-200 flex items-center gap-2">
              <Send className="h-3.5 w-3.5 text-indigo-500" />
              <span>Outgoing Email Notification Audit Logs</span>
              <span className="text-[10px] font-normal text-slate-400">({emailLogs.length} events logged)</span>
            </h3>
            <div className="flex items-center gap-2">
              <button
                onClick={() => clearEmailLogsMutation.mutate()}
                disabled={clearEmailLogsMutation.isPending || emailLogs.length === 0}
                className="text-[11px] text-rose-600 hover:text-rose-700 dark:text-rose-400 flex items-center gap-1 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                title="Clear all email notification audit logs"
              >
                <Trash2 className="h-3 w-3" />
                <span>{clearEmailLogsMutation.isPending ? 'Clearing...' : 'Clear Logs'}</span>
              </button>
              <button
                onClick={() => refetchEmailLogs()}
                className="text-[11px] text-indigo-600 hover:text-indigo-700 dark:text-indigo-400 flex items-center gap-1 cursor-pointer"
              >
                <RefreshCw className="h-3 w-3" />
                <span>Refresh</span>
              </button>
            </div>
          </div>

          {isLoadingEmailLogs ? (
            <div className="p-4 text-center text-xs text-slate-400">Loading notification audit logs...</div>
          ) : emailLogs.length === 0 ? (
            <div className="p-6 text-center rounded-xl border border-dashed border-slate-200 dark:border-slate-800 text-xs text-slate-400">
              No email notifications dispatched yet. Assign tasks or run the deadline scanner to trigger alerts.
            </div>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-800">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 dark:bg-slate-800/60 text-slate-600 dark:text-slate-400 font-semibold border-b border-slate-200 dark:border-slate-800">
                  <tr>
                    <th className="py-2 px-3">Type</th>
                    <th className="py-2 px-3">Provider</th>
                    <th className="py-2 px-3">Recipient</th>
                    <th className="py-2 px-3">Subject</th>
                    <th className="py-2 px-3">Status</th>
                    <th className="py-2 px-3">Dispatched At</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {emailLogs.map((log) => (
                    <tr key={log.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/30 transition">
                      <td className="py-2 px-3">
                        <span className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold border ${
                          log.notificationType === 'TASK_OVERDUE' || log.notificationType === 'PROJECT_OVERDUE'
                            ? 'bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/60 dark:text-rose-300 dark:border-rose-900'
                            : log.notificationType === 'SPRINT_PROMOTED'
                            ? 'bg-purple-50 text-purple-700 border-purple-200 dark:bg-purple-950/60 dark:text-purple-300 dark:border-purple-900'
                            : 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/60 dark:text-blue-300 dark:border-blue-900'
                        }`}>
                          {log.notificationType}
                        </span>
                      </td>
                      <td className="py-2 px-3">
                        <span className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold border ${
                          log.provider === 'RESEND'
                            ? 'bg-purple-50 text-purple-700 border-purple-200 dark:bg-purple-950/60 dark:text-purple-300 dark:border-purple-800'
                            : log.provider === 'MAILJET'
                            ? 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/60 dark:text-amber-300 dark:border-amber-800'
                            : 'bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700'
                        }`}>
                          {log.provider || 'DEFAULT'}
                        </span>
                      </td>
                      <td className="py-2 px-3 font-medium text-slate-800 dark:text-slate-200">
                        {log.recipientName ? `${log.recipientName} (${log.recipientEmail})` : log.recipientEmail}
                      </td>
                      <td className="py-2 px-3 text-slate-600 dark:text-slate-300 truncate max-w-xs" title={log.subject}>
                        {log.subject}
                      </td>
                      <td className="py-2 px-3">
                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                          log.status === 'SENT'
                            ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300'
                            : 'bg-rose-50 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300'
                        }`}>
                          {log.status}
                        </span>
                      </td>
                      <td className="py-2 px-3 text-slate-400 font-mono text-[11px] whitespace-nowrap">
                        {new Date(log.sentAt).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Starter Templates */}
      <div className="p-3.5 rounded-xl border border-blue-100 dark:border-blue-950 bg-blue-50/40 dark:bg-blue-950/20 space-y-2">
        <div className="flex items-center gap-2 text-xs font-semibold text-blue-950 dark:text-blue-200">
          <Sparkles className="h-4 w-4 text-blue-600" />
          <span>Templates:</span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => applyTemplate('urgent_incident')}
            className="px-2.5 py-1 rounded-lg bg-white dark:bg-slate-900 border border-blue-200 dark:border-blue-900 text-xs font-medium text-blue-900 dark:text-blue-200 hover:border-blue-400 transition cursor-pointer"
          >
            ⚡ Urgent Incidents (+2d)
          </button>
          <button
            onClick={() => applyTemplate('bug_escalate')}
            className="px-2.5 py-1 rounded-lg bg-white dark:bg-slate-900 border border-blue-200 dark:border-blue-900 text-xs font-medium text-blue-900 dark:text-blue-200 hover:border-blue-400 transition cursor-pointer"
          >
            🐛 Bug Escalation
          </button>
          <button
            onClick={() => applyTemplate('approval_note')}
            className="px-2.5 py-1 rounded-lg bg-white dark:bg-slate-900 border border-blue-200 dark:border-blue-900 text-xs font-medium text-blue-900 dark:text-blue-200 hover:border-blue-400 transition cursor-pointer"
          >
            📋 Approval Note
          </button>
        </div>
      </div>

      {/* Rules List */}
      <div className="space-y-3">
        <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
          Configured Rules ({rules.length})
        </h3>

        {isLoading ? (
          <div className="p-8 text-center text-xs text-slate-400">Loading automation rules...</div>
        ) : rules.length === 0 ? (
          <div className="p-12 text-center rounded-2xl border border-dashed border-slate-300 dark:border-slate-800 bg-white dark:bg-slate-900/40">
            <Zap className="h-8 w-8 text-slate-300 dark:text-slate-600 mx-auto mb-2" />
            <h4 className="text-sm font-semibold text-slate-700 dark:text-slate-300">No automation rules yet</h4>
            <p className="text-xs text-slate-400 mt-1">
              Select one of the starter templates above or click New Rule to automate your workflow.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3">
            {rules.map((rule) => {
              const cond = rule.conditions?.[0];
              const act = rule.actions?.[0];
              return (
                <div
                  key={rule.id}
                  className={`p-4 rounded-xl border transition ${
                    rule.isActive
                      ? 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-2xs'
                      : 'border-slate-200/60 dark:border-slate-800/60 bg-slate-50/50 dark:bg-slate-900/30 opacity-70'
                  }`}
                >
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-blue-50 dark:bg-blue-950 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-900">
                          {rule.triggerType}
                        </span>
                        <h4 className="text-sm font-bold text-slate-900 dark:text-slate-100">{rule.name}</h4>
                      </div>
                      {rule.description && (
                        <p className="text-xs text-slate-500 dark:text-slate-400">{rule.description}</p>
                      )}
                      <div className="flex flex-wrap items-center gap-2 pt-1 text-xs text-slate-600 dark:text-slate-300 font-medium">
                        {cond && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-[11px]">
                            IF <span className="font-mono text-blue-600 dark:text-blue-400">{cond.field}</span> {cond.operator} &quot;{String(cond.value)}&quot;
                          </span>
                        )}
                        <ArrowRight className="h-3 w-3 text-slate-400" />
                        {act && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-emerald-50 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300 text-[11px] border border-emerald-200 dark:border-emerald-800">
                            THEN {act.type}: &quot;{String(act.value)}&quot;
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-4 sm:border-l border-slate-100 dark:border-slate-800 sm:pl-4">
                      <div className="text-right text-[11px] text-slate-400">
                        <div>
                          Runs: <span className="font-semibold text-slate-700 dark:text-slate-200">{rule.executionCount}</span>
                        </div>
                        {rule.lastExecutedAt && (
                          <div>Last: {new Date(rule.lastExecutedAt).toLocaleDateString()}</div>
                        )}
                      </div>

                      {/* Active Toggle Switch */}
                      <button
                        type="button"
                        onClick={() => toggleRuleMutation.mutate({ ruleId: rule.id, isActive: !rule.isActive })}
                        className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                          rule.isActive ? 'bg-blue-600' : 'bg-slate-300 dark:bg-slate-700'
                        }`}
                      >
                        <span
                          className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                            rule.isActive ? 'translate-x-4' : 'translate-x-0'
                          }`}
                        />
                      </button>

                      <button
                        onClick={() => deleteRuleMutation.mutate(rule.id)}
                        className="p-1 rounded text-slate-400 hover:text-rose-600 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
                        title="Delete rule"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Create Rule Modal */}
      {isCreateModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 dark:bg-black/60 backdrop-blur-xs">
          <div className="relative w-full max-w-lg p-6 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-2xl">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
              <div className="flex items-center gap-2">
                <div className="p-1.5 rounded-lg bg-blue-50 dark:bg-blue-950 text-blue-600">
                  <Zap className="h-4 w-4" />
                </div>
                <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">Create Automation Rule</h3>
              </div>
              <button
                onClick={() => setIsCreateModalOpen(false)}
                className="p-1 rounded text-slate-400 hover:text-slate-700"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleCreateRule} className="mt-4 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">Rule Name</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Auto-Assign Urgent Incidents"
                  value={ruleName}
                  onChange={(e) => setRuleName(e.target.value)}
                  className="w-full px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs text-slate-900 dark:text-slate-100 focus:outline-none focus:border-blue-600"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">Description</label>
                <input
                  type="text"
                  placeholder="Short note explaining this rule's goal"
                  value={ruleDescription}
                  onChange={(e) => setRuleDescription(e.target.value)}
                  className="w-full px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs text-slate-900 dark:text-slate-100 focus:outline-none focus:border-blue-600"
                />
              </div>

              {/* Trigger */}
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  1. WHEN Trigger Occurs
                </label>
                <select
                  value={triggerType}
                  onChange={(e) => setTriggerType(e.target.value as any)}
                  className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-semibold text-slate-900 dark:text-slate-100"
                >
                  <option value="TASK_CREATED">Task Created</option>
                  <option value="STATUS_CHANGED">Status Changed</option>
                  <option value="PRIORITY_CHANGED">Priority Changed</option>
                  <option value="ASSIGNEE_CHANGED">Assignee Changed</option>
                </select>
              </div>

              {/* Condition */}
              <div className="p-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/40 space-y-2">
                <span className="block text-xs font-bold text-slate-700 dark:text-slate-300">
                  2. IF Condition Matches
                </span>
                <div className="grid grid-cols-3 gap-2">
                  <select
                    value={condField}
                    onChange={(e) => setCondField(e.target.value)}
                    className="px-2 py-1.5 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs text-slate-900 dark:text-slate-100"
                  >
                    <option value="priority">Priority</option>
                    <option value="status">Status</option>
                    <option value="ticketType">Type</option>
                    <option value="storyPoints">Story Points</option>
                  </select>
                  <select
                    value={condOperator}
                    onChange={(e) => setCondOperator(e.target.value)}
                    className="px-2 py-1.5 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs text-slate-900 dark:text-slate-100"
                  >
                    <option value="EQUALS">Equals</option>
                    <option value="NOT_EQUALS">Does Not Equal</option>
                    <option value="CONTAINS">Contains</option>
                  </select>
                  <input
                    type="text"
                    value={condValue}
                    onChange={(e) => setCondValue(e.target.value)}
                    placeholder="Value (e.g. URGENT)"
                    className="px-2 py-1.5 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs text-slate-900 dark:text-slate-100"
                  />
                </div>
              </div>

              {/* Action */}
              <div className="p-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/40 space-y-2">
                <span className="block text-xs font-bold text-slate-700 dark:text-slate-300">
                  3. THEN Execute Action
                </span>
                <div className="grid grid-cols-2 gap-2">
                  <select
                    value={actionType}
                    onChange={(e) => {
                      setActionType(e.target.value);
                      if (e.target.value === 'SET_ASSIGNEE' && availableUsers[0]) {
                        setActionValue(availableUsers[0].id);
                      }
                    }}
                    className="px-2 py-1.5 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs text-slate-900 dark:text-slate-100 font-semibold"
                  >
                    <option value="SET_PRIORITY">Set Priority</option>
                    <option value="SET_STATUS">Set Status</option>
                    <option value="SET_ASSIGNEE">Set Assignee</option>
                    <option value="ADD_DEADLINE_DAYS">Set Deadline (+Days)</option>
                    <option value="ADD_COMMENT">Post Automated Comment</option>
                  </select>

                  {actionType === 'SET_PRIORITY' ? (
                    <select
                      value={actionValue}
                      onChange={(e) => setActionValue(e.target.value)}
                      className="px-2 py-1.5 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs text-slate-900 dark:text-slate-100"
                    >
                      <option value="URGENT">Urgent</option>
                      <option value="HIGH">High</option>
                      <option value="MEDIUM">Medium</option>
                      <option value="LOW">Low</option>
                    </select>
                  ) : actionType === 'SET_STATUS' ? (
                    <select
                      value={actionValue}
                      onChange={(e) => setActionValue(e.target.value)}
                      className="px-2 py-1.5 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs text-slate-900 dark:text-slate-100"
                    >
                      <option value="TODO">To Do</option>
                      <option value="IN_PROGRESS">In Progress</option>
                      <option value="IN_REVIEW">In Review</option>
                      <option value="DONE">Done</option>
                    </select>
                  ) : actionType === 'SET_ASSIGNEE' ? (
                    <select
                      value={actionValue}
                      onChange={(e) => setActionValue(e.target.value)}
                      className="px-2 py-1.5 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs text-slate-900 dark:text-slate-100"
                    >
                      {availableUsers.map((u) => (
                        <option key={u.id} value={u.id}>
                          {u.fullName}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <input
                      type="text"
                      value={actionValue}
                      onChange={(e) => setActionValue(e.target.value)}
                      placeholder={actionType === 'ADD_DEADLINE_DAYS' ? 'Days (e.g. 3)' : 'Comment text'}
                      className="px-2 py-1.5 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs text-slate-900 dark:text-slate-100"
                    />
                  )}
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsCreateModalOpen(false)}
                  className="px-3 py-1.5 text-xs text-slate-500 hover:text-slate-800"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={createRuleMutation.isPending}
                  className="px-4 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold shadow-2xs disabled:opacity-50"
                >
                  {createRuleMutation.isPending ? 'Saving...' : 'Save Automation Rule'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Import Tasks Modal */}
      {isImportModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 dark:bg-black/60 backdrop-blur-xs">
          <div className="relative w-full max-w-lg p-6 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-2xl">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
              <div className="flex items-center gap-2">
                <FileSpreadsheet className="h-5 w-5 text-blue-600" />
                <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">Batch Import Tasks</h3>
              </div>
              <button
                onClick={() => setIsImportModalOpen(false)}
                className="p-1 rounded text-slate-400 hover:text-slate-700"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="mt-4 space-y-3">
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Paste CSV or Jira data with format: <code className="font-mono bg-slate-100 dark:bg-slate-800 px-1 py-0.5 rounded">Title, Type, Priority, Status, Description</code>
              </p>

              <textarea
                rows={6}
                value={importText}
                onChange={(e) => setImportText(e.target.value)}
                placeholder={`Upgrade Redis cluster to v7.2, TASK, HIGH, TODO, Migrate cache layer\nFix memory leak in websocket gateway, BUG, URGENT, TODO, Profiles show uncollected socket handles`}
                className="w-full p-3 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 font-mono text-xs text-slate-900 dark:text-slate-100 focus:outline-none focus:border-blue-600"
              />

              {importStatus && (
                <div
                  className={`p-2.5 rounded-lg text-xs font-medium ${
                    importStatus.includes('Successfully')
                      ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                      : 'bg-rose-50 text-rose-800 border border-rose-200'
                  }`}
                >
                  {importStatus}
                </div>
              )}

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsImportModalOpen(false)}
                  className="px-3 py-1.5 text-xs text-slate-500 hover:text-slate-800"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleParseAndImport}
                  disabled={importMutation.isPending || !importText.trim()}
                  className="px-4 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold shadow-2xs disabled:opacity-50"
                >
                  {importMutation.isPending ? 'Importing...' : 'Parse & Import'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
