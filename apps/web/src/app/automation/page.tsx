'use client';

import React, { useState, useMemo } from 'react';
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
  fetchSchedulerStatus,
  updateSchedulerStatus,
  AutomationRule,
  DeadlineScanSummary,
} from '../../lib/api';
import {
  Zap,
  Plus,
  Play,
  Pause,
  Trash2,
  CheckCircle2,
  AlertTriangle,
  Upload,
  Download,
  Clock,
  ArrowRight,
  X,
  FileSpreadsheet,
  Mail,
  RefreshCw,
  ShieldCheck,
  Calendar,
  Search,
  ChevronRight,
} from 'lucide-react';
import { usePermissions } from '../../hooks/usePermissions';
import { useModuleAccess } from '../../hooks/useModuleAccess';
import { AccessDenied } from '../../components/auth/AccessDenied';
import { Permissions } from '../../lib/permissions';

type AutomationTab = 'rules' | 'scheduler' | 'notifications';

// ─── small reusable primitives ───────────────────────────────────────────────

function StatusDot({ active }: { active?: boolean }) {
  return (
    <span
      className={`inline-block h-1.5 w-1.5 rounded-full ${
        active ? 'bg-emerald-500' : 'bg-amber-400'
      }`}
    />
  );
}

function Badge({
  children,
  variant = 'neutral',
}: {
  children: React.ReactNode;
  variant?: 'neutral' | 'blue' | 'green' | 'red' | 'amber';
}) {
  const styles = {
    neutral: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300',
    blue: 'bg-blue-50 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300',
    green: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300',
    red: 'bg-rose-50 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300',
    amber: 'bg-amber-50 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300',
  };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium ${styles[variant]}`}>
      {children}
    </span>
  );
}

function Toggle({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={onChange}
      className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-1 ${
        checked ? 'bg-blue-600' : 'bg-slate-200 dark:bg-slate-700'
      }`}
    >
      <span
        className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-sm transition-transform duration-150 ${
          checked ? 'translate-x-4' : 'translate-x-0'
        }`}
      />
    </button>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function AutomationPage() {
  const queryClient = useQueryClient();
  const { activeProject } = useProject();
  const { hasPermission } = usePermissions();
  const { canAccess, isLoading: isAccessLoading } = useModuleAccess();
  const canManage = hasPermission(Permissions.AUTOMATION_MANAGE);

  // UI state
  const [activeTab, setActiveTab] = useState<AutomationTab>('rules');
  const [ruleSearch, setRuleSearch] = useState('');
  const [triggerFilter, setTriggerFilter] = useState('ALL');
  const [logSearch, setLogSearch] = useState('');
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isImportOpen, setIsImportOpen] = useState(false);
  const [importText, setImportText] = useState('');
  const [importStatus, setImportStatus] = useState<string | null>(null);
  const [scanResult, setScanResult] = useState<DeadlineScanSummary | null>(null);

  // Rule form state
  const [ruleName, setRuleName] = useState('');
  const [ruleDescription, setRuleDescription] = useState('');
  const [triggerType, setTriggerType] = useState<AutomationRule['triggerType']>('TASK_CREATED');
  const [condField, setCondField] = useState('priority');
  const [condOperator, setCondOperator] = useState('EQUALS');
  const [condValue, setCondValue] = useState('URGENT');
  const [actionType, setActionType] = useState('SET_PRIORITY');
  const [actionValue, setActionValue] = useState('URGENT');
  const [commentScope] = useState<'INTERNAL_ONLY' | 'PUBLIC'>('INTERNAL_ONLY');

  // ─── Queries ───────────────────────────────────────────────────────────────

  const { data: rules = [], isLoading: rulesLoading } = useQuery({
    queryKey: ['automationRules', activeProject?.key],
    queryFn: () => (activeProject ? fetchAutomationRules(activeProject.key) : Promise.resolve([])),
    enabled: !!activeProject,
  });

  const { data: availableUsers = [] } = useQuery({
    queryKey: ['availableUsers'],
    queryFn: fetchAvailableUsers,
  });

  const { data: emailLogs = [], isLoading: logsLoading, refetch: refetchLogs } = useQuery({
    queryKey: ['emailNotificationLogs'],
    queryFn: () => fetchEmailNotificationLogs(50),
  });

  const { data: emailProviders } = useQuery({
    queryKey: ['emailProviders'],
    queryFn: fetchEmailProviders,
  });

  const { data: schedulerStatus } = useQuery({
    queryKey: ['deadlineSchedulerStatus'],
    queryFn: fetchSchedulerStatus,
    refetchInterval: 10000,
  });

  // ─── Mutations ─────────────────────────────────────────────────────────────

  const schedulerMutation = useMutation({
    mutationFn: updateSchedulerStatus,
    onSuccess: (updated) => {
      queryClient.setQueryData(['deadlineSchedulerStatus'], updated);
      queryClient.invalidateQueries({ queryKey: ['deadlineSchedulerStatus'] });
      queryClient.invalidateQueries({ queryKey: ['emailNotificationLogs'] });
      queryClient.invalidateQueries({ queryKey: ['tickets'] });
      queryClient.invalidateQueries({ queryKey: ['projects'] });
      if (updated.lastSummary) setScanResult(updated.lastSummary);
    },
    onError: (err: Error) => alert(err.message || 'Failed to update scheduler'),
  });

  const scanMutation = useMutation({
    mutationFn: triggerDeadlineScan,
    onSuccess: (res) => {
      setScanResult(res.data);
      queryClient.invalidateQueries({ queryKey: ['deadlineSchedulerStatus'] });
      queryClient.invalidateQueries({ queryKey: ['emailNotificationLogs'] });
      queryClient.invalidateQueries({ queryKey: ['recentEmailNotificationLogs'] });
      queryClient.invalidateQueries({ queryKey: ['tickets'] });
      queryClient.invalidateQueries({ queryKey: ['projects'] });
    },
  });

  const clearLogsMutation = useMutation({
    mutationFn: clearEmailNotificationLogs,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['emailNotificationLogs'] });
      queryClient.invalidateQueries({ queryKey: ['recentEmailNotificationLogs'] });
    },
  });

  const createRuleMutation = useMutation({
    mutationFn: (data: Parameters<typeof createAutomationRule>[1]) =>
      createAutomationRule(activeProject!.key, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['automationRules', activeProject?.key] });
      setIsCreateOpen(false);
      resetForm();
    },
  });

  const toggleRuleMutation = useMutation({
    mutationFn: ({ ruleId, isActive }: { ruleId: string; isActive: boolean }) =>
      updateAutomationRule(activeProject!.key, ruleId, { isActive }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['automationRules', activeProject?.key] }),
  });

  const deleteRuleMutation = useMutation({
    mutationFn: (ruleId: string) => deleteAutomationRule(activeProject!.key, ruleId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['automationRules', activeProject?.key] }),
  });

  const importMutation = useMutation({
    mutationFn: (tasks: any[]) => importBatchTasks(activeProject!.key, tasks),
    onSuccess: (data) => {
      setImportStatus(`Successfully imported ${data.importedCount} tasks.`);
      queryClient.invalidateQueries({ queryKey: ['tickets'] });
      setTimeout(() => {
        setIsImportOpen(false);
        setImportText('');
        setImportStatus(null);
      }, 1800);
    },
    onError: (err: Error) => setImportStatus(`Import failed: ${err.message}`),
  });

  // ─── Helpers ───────────────────────────────────────────────────────────────

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

  function applyTemplate(id: string) {
    if (id === 'urgent_incident') {
      setRuleName('Auto-Assign Urgent Incidents');
      setRuleDescription('When an urgent incident is filed, set a 2-day deadline.');
      setTriggerType('TASK_CREATED');
      setCondField('ticketType');
      setCondOperator('EQUALS');
      setCondValue('INCIDENT');
      setActionType('ADD_DEADLINE_DAYS');
      setActionValue('2');
    } else if (id === 'bug_escalate') {
      setRuleName('Escalate Bugs on Code Review');
      setRuleDescription('When a bug transitions to In Review, elevate priority to High.');
      setTriggerType('STATUS_CHANGED');
      setCondField('status');
      setCondOperator('EQUALS');
      setCondValue('IN_REVIEW');
      setActionType('SET_PRIORITY');
      setActionValue('HIGH');
    } else if (id === 'approval_note') {
      setRuleName('Approval Sign-off Reminder');
      setRuleDescription('Post internal note when task is awaiting management sign-off.');
      setTriggerType('STATUS_CHANGED');
      setCondField('status');
      setCondOperator('EQUALS');
      setCondValue('PENDING_APPROVAL');
      setActionType('ADD_COMMENT');
      setActionValue('Formal ITIL multi-tier approval requested. SLA clock paused.');
    }
    setIsCreateOpen(true);
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
      const isHeader =
        lines[0].toLowerCase().includes('title') || lines[0].toLowerCase().includes('summary');
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
        setImportStatus('No valid tasks found. Ensure each row has at least a Title.');
        return;
      }
      importMutation.mutate(tasks);
    } catch {
      setImportStatus('Error parsing CSV. Please check the format.');
    }
  }

  // ─── Derived data ──────────────────────────────────────────────────────────

  const filteredRules = useMemo(() => {
    return rules.filter((r) => {
      const matchesTrigger = triggerFilter === 'ALL' || r.triggerType === triggerFilter;
      const q = ruleSearch.trim().toLowerCase();
      const matchesSearch =
        !q || r.name.toLowerCase().includes(q) || (r.description?.toLowerCase().includes(q) ?? false);
      return matchesTrigger && matchesSearch;
    });
  }, [rules, triggerFilter, ruleSearch]);

  const filteredLogs = useMemo(() => {
    const q = logSearch.trim().toLowerCase();
    if (!q) return emailLogs;
    return emailLogs.filter(
      (l) =>
        l.recipientEmail.toLowerCase().includes(q) ||
        (l.recipientName?.toLowerCase().includes(q) ?? false) ||
        l.subject.toLowerCase().includes(q) ||
        l.notificationType.toLowerCase().includes(q)
    );
  }, [emailLogs, logSearch]);

  const totalExecutions = rules.reduce((acc, r) => acc + (r.executionCount || 0), 0);
  const activeRulesCount = rules.filter((r) => r.isActive).length;

  if (!isAccessLoading && !canAccess('automation')) {
    return <AccessDenied module="Automation" requiredRole="Manager or above" />;
  }

  // ─── Shared input class ────────────────────────────────────────────────────
  const inputCls =
    'w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800/60 text-xs text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-1 focus:ring-blue-600 focus:border-blue-600 transition';
  const selectCls =
    'px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800/60 text-xs font-medium text-slate-700 dark:text-slate-300 focus:outline-none focus:ring-1 focus:ring-blue-600 focus:border-blue-600 transition';
  const btnSecondary =
    'px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800 text-xs font-medium text-slate-700 dark:text-slate-300 flex items-center gap-1.5 transition cursor-pointer';
  const btnPrimary =
    'px-4 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium flex items-center gap-1.5 transition cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed';

  // ─── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="flex-1 min-w-0 w-full max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-7 space-y-7">

      {/* ── Page Header ─────────────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-lg font-semibold text-slate-900 dark:text-slate-100 tracking-tight">
              Automation
            </h1>
            {activeProject && (
              <span className="px-1.5 py-0.5 rounded text-[10px] font-mono font-medium border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-500 dark:text-slate-400">
                {activeProject.key}
              </span>
            )}
          </div>
          <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
            Workflow rules, SLA escalation engine, and email delivery logs.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          {activeProject && (
            <a href={getExportCsvUrl(activeProject.key)} download className={btnSecondary}>
              <Download className="h-3.5 w-3.5" />
              Export CSV
            </a>
          )}
          <button onClick={() => setIsImportOpen(true)} className={btnSecondary}>
            <Upload className="h-3.5 w-3.5" />
            Import
          </button>
          <button
            onClick={() => { if (!canManage) return; resetForm(); setIsCreateOpen(true); }}
            disabled={!canManage}
            title={!canManage ? 'Requires Manage Automation permission' : undefined}
            className={btnPrimary}
          >
            <Plus className="h-3.5 w-3.5" />
            New Rule
          </button>
        </div>
      </div>

      {/* ── Stat Row ────────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          {
            label: 'Active Rules',
            value: activeRulesCount,
            sub: `of ${rules.length}`,
          },
          {
            label: 'Executions',
            value: totalExecutions,
            sub: 'total fired',
          },
          {
            label: 'SLA Engine',
            value: schedulerStatus?.isActive ? 'Running' : 'Paused',
            sub: schedulerStatus?.isActive
              ? `every ${schedulerStatus.intervalMinutes}m`
              : 'scanner inactive',
            dot: schedulerStatus?.isActive,
          },
          {
            label: 'Email Logs',
            value: emailLogs.length,
            sub: 'dispatched',
          },
        ].map((s) => (
          <div
            key={s.label}
            className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/60"
          >
            <p className="text-[11px] text-slate-500 dark:text-slate-400 font-medium">{s.label}</p>
            <div className="mt-1 flex items-center gap-2">
              {'dot' in s && <StatusDot active={s.dot} />}
              <span className="text-lg font-semibold text-slate-900 dark:text-slate-100 leading-none">
                {s.value}
              </span>
            </div>
            <p className="mt-0.5 text-[11px] text-slate-400">{s.sub}</p>
          </div>
        ))}
      </div>

      {/* ── Tabs ────────────────────────────────────────────────────────────── */}
      <div className="border-b border-slate-200 dark:border-slate-800">
        <nav className="-mb-px flex gap-0">
          {(
            [
              { id: 'rules', label: 'Workflow Rules', count: rules.length },
              { id: 'scheduler', label: 'SLA Engine', dot: schedulerStatus?.isActive },
              { id: 'notifications', label: 'Notification Logs', count: emailLogs.length },
            ] as const
          ).map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as AutomationTab)}
              className={`group flex items-center gap-2 px-4 py-2.5 text-xs font-medium border-b-2 transition whitespace-nowrap cursor-pointer ${
                activeTab === tab.id
                  ? 'border-blue-600 text-blue-600 dark:text-blue-400 dark:border-blue-500'
                  : 'border-transparent text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200'
              }`}
            >
              {tab.label}
              {'count' in tab && tab.count !== undefined && (
                <span
                  className={`px-1.5 py-0.5 rounded-full text-[10px] font-semibold leading-none transition ${
                    activeTab === tab.id
                      ? 'bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300'
                      : 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400'
                  }`}
                >
                  {tab.count}
                </span>
              )}
              {'dot' in tab && <StatusDot active={tab.dot} />}
            </button>
          ))}
        </nav>
      </div>

      {/* ══════════════════════════════════════════════════════════════════════
          TAB 1 — Workflow Rules
      ══════════════════════════════════════════════════════════════════════ */}
      {activeTab === 'rules' && (
        <div className="space-y-5">

          {/* Template presets */}
          <div className="flex flex-col sm:flex-row sm:items-center gap-3 p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-900/40">
            <span className="text-xs text-slate-500 dark:text-slate-400 shrink-0">Quick templates:</span>
            <div className="flex flex-wrap gap-2">
              {[
                { id: 'urgent_incident', label: 'Urgent incident +2d deadline' },
                { id: 'bug_escalate', label: 'Bug escalation on review' },
                { id: 'approval_note', label: 'Approval sign-off note' },
              ].map((t) => (
                <button
                  key={t.id}
                  onClick={() => applyTemplate(t.id)}
                  disabled={!canManage}
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs text-slate-700 dark:text-slate-300 hover:border-blue-500 hover:text-blue-600 dark:hover:text-blue-400 transition disabled:opacity-40 cursor-pointer disabled:cursor-not-allowed"
                >
                  {t.label}
                  <ChevronRight className="h-3 w-3 opacity-50" />
                </button>
              ))}
            </div>
          </div>

          {/* Search + filter bar */}
          <div className="flex flex-col sm:flex-row gap-2.5">
            <div className="relative flex-1 max-w-xs">
              <Search className="h-3.5 w-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                placeholder="Search rules…"
                value={ruleSearch}
                onChange={(e) => setRuleSearch(e.target.value)}
                className={`${inputCls} pl-8`}
              />
            </div>
            <select
              value={triggerFilter}
              onChange={(e) => setTriggerFilter(e.target.value)}
              className={selectCls}
            >
              <option value="ALL">All triggers</option>
              <option value="TASK_CREATED">Task Created</option>
              <option value="STATUS_CHANGED">Status Changed</option>
              <option value="PRIORITY_CHANGED">Priority Changed</option>
              <option value="ASSIGNEE_CHANGED">Assignee Changed</option>
            </select>
          </div>

          {/* Rules list */}
          {rulesLoading ? (
            <div className="py-16 text-center text-xs text-slate-400">Loading rules…</div>
          ) : filteredRules.length === 0 ? (
            <div className="py-16 flex flex-col items-center gap-3 rounded-xl border border-dashed border-slate-200 dark:border-slate-800">
              <Zap className="h-7 w-7 text-slate-300 dark:text-slate-700" />
              <p className="text-sm font-medium text-slate-600 dark:text-slate-400">
                {rules.length === 0 ? 'No automation rules yet' : 'No matching rules'}
              </p>
              <p className="text-xs text-slate-400 max-w-xs text-center">
                {rules.length === 0
                  ? 'Use a template above or click New Rule to get started.'
                  : 'Adjust your search or trigger filter.'}
              </p>
            </div>
          ) : (
            <div className="divide-y divide-slate-100 dark:divide-slate-800 rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden bg-white dark:bg-slate-900">
              {filteredRules.map((rule) => {
                const cond = rule.conditions?.[0];
                const act = rule.actions?.[0];
                return (
                  <div
                    key={rule.id}
                    className={`flex flex-col sm:flex-row sm:items-center gap-4 px-4 py-3.5 transition ${
                      !rule.isActive ? 'opacity-50' : 'hover:bg-slate-50/60 dark:hover:bg-slate-800/30'
                    }`}
                  >
                    {/* Left: info */}
                    <div className="flex-1 min-w-0 space-y-1.5">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge variant="blue">{rule.triggerType}</Badge>
                        <span className="text-sm font-medium text-slate-900 dark:text-slate-100 truncate">
                          {rule.name}
                        </span>
                      </div>

                      {rule.description && (
                        <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
                          {rule.description}
                        </p>
                      )}

                      {(cond || act) && (
                        <div className="flex flex-wrap items-center gap-1.5">
                          {cond && (
                            <span className="inline-flex items-center gap-1 text-[11px] text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded">
                              <span className="text-slate-400 font-semibold">IF</span>
                              <span className="font-mono">{cond.field}</span>
                              <span className="text-slate-400">{cond.operator.toLowerCase()}</span>
                              <span className="font-semibold">&quot;{String(cond.value)}&quot;</span>
                            </span>
                          )}
                          {cond && act && (
                            <ArrowRight className="h-3 w-3 text-slate-400 shrink-0" />
                          )}
                          {act && (
                            <span className="inline-flex items-center gap-1 text-[11px] text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded">
                              <span className="text-blue-600 dark:text-blue-400 font-semibold">THEN</span>
                              <span>{act.type}</span>
                              <span className="font-semibold">&quot;{String(act.value)}&quot;</span>
                            </span>
                          )}
                        </div>
                      )}
                    </div>

                    {/* Right: meta + controls */}
                    <div className="flex items-center gap-4 shrink-0">
                      <div className="text-right hidden sm:block">
                        <p className="text-[11px] text-slate-400">
                          <span className="font-medium text-slate-700 dark:text-slate-200">
                            {rule.executionCount}
                          </span>{' '}
                          runs
                        </p>
                        {rule.lastExecutedAt && (
                          <p className="text-[11px] text-slate-400">
                            {new Date(rule.lastExecutedAt).toLocaleDateString()}
                          </p>
                        )}
                      </div>

                      <Toggle
                        checked={rule.isActive}
                        onChange={() =>
                          toggleRuleMutation.mutate({ ruleId: rule.id, isActive: !rule.isActive })
                        }
                        label={rule.isActive ? 'Disable rule' : 'Enable rule'}
                      />

                      <button
                        onClick={() => deleteRuleMutation.mutate(rule.id)}
                        title="Delete rule"
                        className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition cursor-pointer"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════════
          TAB 2 — SLA Engine
      ══════════════════════════════════════════════════════════════════════ */}
      {activeTab === 'scheduler' && (
        <div className="space-y-5">

          {/* Engine control card */}
          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden">
            {/* Header */}
            <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="space-y-0.5">
                <div className="flex items-center gap-2">
                  <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                    Deadline & SLA Escalation Engine
                  </h2>
                  {schedulerStatus?.isActive ? (
                    <Badge variant="green">
                      <span className="mr-1 h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse inline-block" />
                      Active · {schedulerStatus.intervalMinutes}m
                    </Badge>
                  ) : (
                    <Badge variant="amber">Paused</Badge>
                  )}
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Scans all projects for approaching and overdue deadlines, auto-escalates priority, and dispatches email alerts.
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2 shrink-0">
                {/* Interval selector */}
                <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800">
                  <Clock className="h-3.5 w-3.5 text-slate-400" />
                  <select
                    value={schedulerStatus?.intervalMinutes || 60}
                    onChange={(e) =>
                      schedulerMutation.mutate({ intervalMinutes: Number(e.target.value) })
                    }
                    disabled={!canManage || schedulerMutation.isPending}
                    className="bg-transparent text-xs font-medium text-slate-800 dark:text-slate-200 focus:outline-none cursor-pointer"
                  >
                    <option value={5}>5 min</option>
                    <option value={15}>15 min</option>
                    <option value={30}>30 min</option>
                    <option value={60}>60 min</option>
                    <option value={1440}>24 h</option>
                  </select>
                </div>

                {canManage && (
                  <button
                    onClick={() => schedulerMutation.mutate({ isActive: !schedulerStatus?.isActive })}
                    disabled={schedulerMutation.isPending}
                    className={btnSecondary}
                  >
                    {schedulerStatus?.isActive ? (
                      <><Pause className="h-3.5 w-3.5 text-amber-500" /> Pause</>
                    ) : (
                      <><Play className="h-3.5 w-3.5 text-emerald-500" /> Resume</>
                    )}
                  </button>
                )}

                <button
                  onClick={() => schedulerMutation.mutate({ runImmediately: true })}
                  disabled={schedulerMutation.isPending || scanMutation.isPending}
                  className={btnPrimary}
                >
                  <RefreshCw className={`h-3.5 w-3.5 ${schedulerMutation.isPending ? 'animate-spin' : ''}`} />
                  {schedulerMutation.isPending ? 'Scanning…' : 'Run Now'}
                </button>
              </div>
            </div>

            {/* Telemetry strip */}
            <div className="px-5 py-3 bg-slate-50/80 dark:bg-slate-800/40 flex flex-wrap items-center gap-x-6 gap-y-1 text-xs text-slate-500 dark:text-slate-400">
              <span>
                Last scan:{' '}
                <span className="font-medium text-slate-700 dark:text-slate-200">
                  {schedulerStatus?.lastRunAt
                    ? new Date(schedulerStatus.lastRunAt).toLocaleTimeString()
                    : 'Pending'}
                </span>
              </span>
              <span className="hidden sm:inline text-slate-300 dark:text-slate-700">|</span>
              <span>
                Next run:{' '}
                <span className="font-medium text-slate-700 dark:text-slate-200">
                  {schedulerStatus?.isActive && schedulerStatus.nextRunAt
                    ? new Date(schedulerStatus.nextRunAt).toLocaleTimeString()
                    : '—'}
                </span>
              </span>
              <span className="hidden sm:inline text-slate-300 dark:text-slate-700">|</span>
              <span>
                Loop guard: <span className="font-mono font-medium text-slate-700 dark:text-slate-200">depth ≤ 3</span>
              </span>
            </div>
          </div>

          {/* Scan result banner */}
          {scanResult && (
            <div className="rounded-xl border border-emerald-200 dark:border-emerald-900 bg-emerald-50/60 dark:bg-emerald-950/20 px-5 py-4 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                  <span className="text-xs font-semibold text-slate-900 dark:text-slate-100">
                    Scan completed at {new Date(scanResult.timestamp).toLocaleTimeString()}
                  </span>
                </div>
                <button
                  onClick={() => setScanResult(null)}
                  className="text-xs text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer"
                >
                  Dismiss
                </button>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {[
                  { label: 'Sprint promoted', value: scanResult.tasksPromotedToSprint, color: 'text-slate-900 dark:text-slate-100' },
                  { label: 'Task overdues', value: scanResult.overdueTasksEscalated, color: 'text-rose-600 dark:text-rose-400' },
                  { label: 'Project overdues', value: scanResult.overdueProjectsEscalated, color: 'text-amber-600 dark:text-amber-400' },
                  { label: 'Emails sent', value: scanResult.totalEmailsDispatched, color: 'text-blue-600 dark:text-blue-400' },
                ].map((m) => (
                  <div key={m.label} className="p-3 rounded-lg border border-white/60 bg-white/80 dark:bg-slate-900/60 dark:border-slate-800">
                    <p className="text-[11px] text-slate-500">{m.label}</p>
                    <p className={`text-lg font-semibold ${m.color}`}>{m.value}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Policy cards */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {[
              {
                icon: Calendar,
                title: 'Auto-Sprint Allocation',
                body: 'Tasks within 3 days of deadline are promoted from Backlog to Active Sprint, with notifications to Assignee and PM.',
              },
              {
                icon: AlertTriangle,
                title: 'Overdue Task Escalation',
                body: 'Overdue tasks are bumped to URGENT, an internal audit note is recorded, and the PM and Team Lead receive an alert.',
              },
              {
                icon: ShieldCheck,
                title: 'Project SLA Governance',
                body: 'Projects crossing their target deadline escalate to Managers, Reviewers, and Org Super Admins automatically.',
              },
            ].map(({ icon: Icon, title, body }) => (
              <div
                key={title}
                className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 space-y-2"
              >
                <div className="flex items-center gap-2">
                  <Icon className="h-4 w-4 text-slate-500 dark:text-slate-400 shrink-0" />
                  <span className="text-xs font-semibold text-slate-900 dark:text-slate-100">{title}</span>
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">{body}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════════
          TAB 3 — Notification Logs & Failover
      ══════════════════════════════════════════════════════════════════════ */}
      {activeTab === 'notifications' && (
        <div className="space-y-5">

          {/* Provider failover chain */}
          {emailProviders && emailProviders.providers.length > 0 && (
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <span className="text-slate-500 dark:text-slate-400">Delivery chain:</span>
                {emailProviders.providers.map((p, idx) => (
                  <span key={p.name} className="inline-flex items-center gap-1.5">
                    <span className="px-2 py-0.5 rounded font-mono text-[11px] font-medium border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
                      {p.name} {p.priority === 1 ? '· primary' : '· failover'}
                    </span>
                    {idx < emailProviders.providers.length - 1 && (
                      <ArrowRight className="h-3 w-3 text-slate-400" />
                    )}
                  </span>
                ))}
              </div>
              {emailProviders.failoverEnabled && (
                <span className="inline-flex items-center gap-1.5 text-[11px] text-emerald-700 dark:text-emerald-400 font-medium">
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  Auto-failover enabled
                </span>
              )}
            </div>
          )}

          {/* Toolbar */}
          <div className="flex flex-col sm:flex-row gap-2.5 items-stretch sm:items-center justify-between">
            <div className="relative w-full sm:max-w-xs flex-1">
              <Search className="h-3.5 w-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                placeholder="Search recipient, subject…"
                value={logSearch}
                onChange={(e) => setLogSearch(e.target.value)}
                className={`${inputCls} pl-8`}
              />
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button onClick={() => refetchLogs()} className={btnSecondary}>
                <RefreshCw className="h-3.5 w-3.5" />
                Refresh
              </button>
              <button
                onClick={() => clearLogsMutation.mutate()}
                disabled={clearLogsMutation.isPending || emailLogs.length === 0}
                className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 hover:bg-rose-50 dark:hover:bg-rose-950/40 hover:border-rose-200 dark:hover:border-rose-900 text-xs font-medium text-slate-600 hover:text-rose-600 dark:text-slate-400 dark:hover:text-rose-400 flex items-center gap-1.5 transition cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <Trash2 className="h-3.5 w-3.5" />
                {clearLogsMutation.isPending ? 'Clearing…' : 'Clear Logs'}
              </button>
            </div>
          </div>

          {/* Log table */}
          {logsLoading ? (
            <div className="py-16 text-center text-xs text-slate-400">Loading logs…</div>
          ) : filteredLogs.length === 0 ? (
            <div className="py-16 flex flex-col items-center gap-3 rounded-xl border border-dashed border-slate-200 dark:border-slate-800">
              <Mail className="h-7 w-7 text-slate-300 dark:text-slate-700" />
              <p className="text-sm font-medium text-slate-600 dark:text-slate-400">No notifications yet</p>
              <p className="text-xs text-slate-400 text-center max-w-xs">
                {emailLogs.length === 0
                  ? 'Email alerts will appear here after the SLA engine dispatches notifications.'
                  : 'No logs match your search.'}
              </p>
            </div>
          ) : (
            <>
              {/* Mobile & Small Screen Card View */}
              <div className="grid grid-cols-1 gap-3 md:hidden">
                {filteredLogs.map((log) => (
                  <div
                    key={log.id}
                    className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 space-y-2.5 text-xs"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-1.5">
                        <Badge
                          variant={
                            log.notificationType === 'TASK_OVERDUE' ||
                            log.notificationType === 'PROJECT_OVERDUE'
                              ? 'red'
                              : 'neutral'
                          }
                        >
                          {log.notificationType}
                        </Badge>
                        <Badge variant={log.status === 'SENT' ? 'green' : 'red'}>
                          {log.status}
                        </Badge>
                      </div>
                      <span className="font-mono text-[11px] text-slate-400">
                        {new Date(log.sentAt).toLocaleString([], {
                          dateStyle: 'short',
                          timeStyle: 'short',
                        })}
                      </span>
                    </div>

                    <p className="font-medium text-slate-800 dark:text-slate-200 break-words">
                      {log.subject}
                    </p>

                    <div className="pt-2 border-t border-slate-100 dark:border-slate-800 flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-500 dark:text-slate-400">
                      <span className="truncate max-w-full">
                        {log.recipientName
                          ? `${log.recipientName} (${log.recipientEmail})`
                          : log.recipientEmail}
                      </span>
                      <span className="font-mono px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
                        {log.provider || 'DEFAULT'}
                      </span>
                    </div>
                  </div>
                ))}
              </div>

              {/* Desktop Table View */}
              <div className="hidden md:block rounded-xl border border-slate-200 dark:border-slate-800 overflow-x-auto bg-white dark:bg-slate-900">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-800/50">
                      <th className="px-4 py-2.5 font-medium text-slate-500 dark:text-slate-400">Type</th>
                      <th className="px-4 py-2.5 font-medium text-slate-500 dark:text-slate-400">Provider</th>
                      <th className="px-4 py-2.5 font-medium text-slate-500 dark:text-slate-400">Recipient</th>
                      <th className="px-4 py-2.5 font-medium text-slate-500 dark:text-slate-400">Subject</th>
                      <th className="px-4 py-2.5 font-medium text-slate-500 dark:text-slate-400">Status</th>
                      <th className="px-4 py-2.5 font-medium text-slate-500 dark:text-slate-400 text-right">Sent At</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {filteredLogs.map((log) => (
                      <tr
                        key={log.id}
                        className="hover:bg-slate-50/60 dark:hover:bg-slate-800/30 transition"
                      >
                        <td className="px-4 py-3 whitespace-nowrap">
                          <Badge
                            variant={
                              log.notificationType === 'TASK_OVERDUE' ||
                              log.notificationType === 'PROJECT_OVERDUE'
                                ? 'red'
                                : 'neutral'
                            }
                          >
                            {log.notificationType}
                          </Badge>
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          <span className="font-mono text-[11px] text-slate-600 dark:text-slate-300">
                            {log.provider || 'DEFAULT'}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-slate-700 dark:text-slate-200 font-medium max-w-[220px] truncate">
                          {log.recipientName
                            ? `${log.recipientName} (${log.recipientEmail})`
                            : log.recipientEmail}
                        </td>
                        <td
                          className="px-4 py-3 text-slate-500 dark:text-slate-400 max-w-xs truncate"
                          title={log.subject}
                        >
                          {log.subject}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          <Badge variant={log.status === 'SENT' ? 'green' : 'red'}>
                            {log.status}
                          </Badge>
                        </td>
                        <td className="px-4 py-3 text-right font-mono text-[11px] text-slate-400 whitespace-nowrap">
                          {new Date(log.sentAt).toLocaleString([], {
                            dateStyle: 'short',
                            timeStyle: 'short',
                          })}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════════
          MODAL — Create Rule
      ══════════════════════════════════════════════════════════════════════ */}
      {isCreateOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 dark:bg-black/70 backdrop-blur-sm"
          onClick={(e) => { if (e.target === e.currentTarget) setIsCreateOpen(false); }}
        >
          <div className="relative w-full max-w-md bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-2xl">
            {/* Modal header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 dark:border-slate-800">
              <div className="flex items-center gap-2">
                <Zap className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                <span className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                  Create Automation Rule
                </span>
              </div>
              <button
                onClick={() => setIsCreateOpen(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer transition"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={handleCreateRule} className="px-5 py-4 space-y-4">
              {/* Name */}
              <div className="space-y-1.5">
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                  Rule name <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Auto-assign urgent incidents"
                  value={ruleName}
                  onChange={(e) => setRuleName(e.target.value)}
                  className={inputCls}
                />
              </div>

              {/* Description */}
              <div className="space-y-1.5">
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                  Description <span className="text-slate-400 font-normal">(optional)</span>
                </label>
                <input
                  type="text"
                  placeholder="Short description of this rule's purpose"
                  value={ruleDescription}
                  onChange={(e) => setRuleDescription(e.target.value)}
                  className={inputCls}
                />
              </div>

              {/* Trigger */}
              <div className="space-y-1.5">
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                  Trigger event
                </label>
                <select
                  value={triggerType}
                  onChange={(e) => setTriggerType(e.target.value as AutomationRule['triggerType'])}
                  className={`${selectCls} w-full`}
                >
                  <option value="TASK_CREATED">Task Created</option>
                  <option value="STATUS_CHANGED">Status Changed</option>
                  <option value="PRIORITY_CHANGED">Priority Changed</option>
                  <option value="ASSIGNEE_CHANGED">Assignee Changed</option>
                </select>
              </div>

              {/* Condition */}
              <div className="space-y-1.5">
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                  Condition — IF
                </label>
                <div className="grid grid-cols-3 gap-2">
                  <select
                    value={condField}
                    onChange={(e) => setCondField(e.target.value)}
                    className={selectCls}
                  >
                    <option value="priority">Priority</option>
                    <option value="status">Status</option>
                    <option value="ticketType">Type</option>
                    <option value="storyPoints">Story Points</option>
                  </select>
                  <select
                    value={condOperator}
                    onChange={(e) => setCondOperator(e.target.value)}
                    className={selectCls}
                  >
                    <option value="EQUALS">Equals</option>
                    <option value="NOT_EQUALS">Not equals</option>
                    <option value="CONTAINS">Contains</option>
                  </select>
                  <input
                    type="text"
                    value={condValue}
                    onChange={(e) => setCondValue(e.target.value)}
                    placeholder="URGENT"
                    className={inputCls}
                  />
                </div>
              </div>

              {/* Action */}
              <div className="space-y-1.5">
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                  Action — THEN
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <select
                    value={actionType}
                    onChange={(e) => {
                      setActionType(e.target.value);
                      if (e.target.value === 'SET_ASSIGNEE' && availableUsers[0]) {
                        setActionValue(availableUsers[0].id);
                      }
                    }}
                    className={selectCls}
                  >
                    <option value="SET_PRIORITY">Set Priority</option>
                    <option value="SET_STATUS">Set Status</option>
                    <option value="SET_ASSIGNEE">Set Assignee</option>
                    <option value="ADD_DEADLINE_DAYS">Add Deadline Days</option>
                    <option value="ADD_COMMENT">Post Comment</option>
                  </select>

                  {actionType === 'SET_PRIORITY' ? (
                    <select value={actionValue} onChange={(e) => setActionValue(e.target.value)} className={selectCls}>
                      <option value="URGENT">Urgent</option>
                      <option value="HIGH">High</option>
                      <option value="MEDIUM">Medium</option>
                      <option value="LOW">Low</option>
                    </select>
                  ) : actionType === 'SET_STATUS' ? (
                    <select value={actionValue} onChange={(e) => setActionValue(e.target.value)} className={selectCls}>
                      <option value="TODO">To Do</option>
                      <option value="IN_PROGRESS">In Progress</option>
                      <option value="IN_REVIEW">In Review</option>
                      <option value="DONE">Done</option>
                    </select>
                  ) : actionType === 'SET_ASSIGNEE' ? (
                    <select value={actionValue} onChange={(e) => setActionValue(e.target.value)} className={selectCls}>
                      {availableUsers.map((u) => (
                        <option key={u.id} value={u.id}>{u.fullName}</option>
                      ))}
                    </select>
                  ) : (
                    <input
                      type="text"
                      value={actionValue}
                      onChange={(e) => setActionValue(e.target.value)}
                      placeholder={actionType === 'ADD_DEADLINE_DAYS' ? 'e.g. 3' : 'Comment text…'}
                      className={inputCls}
                    />
                  )}
                </div>
              </div>

              {/* Footer */}
              <div className="flex justify-end gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsCreateOpen(false)}
                  className="px-3 py-1.5 rounded-lg text-xs font-medium text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 cursor-pointer transition"
                >
                  Cancel
                </button>
                <button type="submit" disabled={createRuleMutation.isPending} className={btnPrimary}>
                  {createRuleMutation.isPending ? 'Saving…' : 'Create Rule'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════════
          MODAL — Batch Import
      ══════════════════════════════════════════════════════════════════════ */}
      {isImportOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 dark:bg-black/70 backdrop-blur-sm"
          onClick={(e) => { if (e.target === e.currentTarget) setIsImportOpen(false); }}
        >
          <div className="relative w-full max-w-md bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-2xl">
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 dark:border-slate-800">
              <div className="flex items-center gap-2">
                <FileSpreadsheet className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                <span className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                  Batch Import Tasks
                </span>
              </div>
              <button
                onClick={() => setIsImportOpen(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer transition"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="px-5 py-4 space-y-4">
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Paste rows in CSV format:{' '}
                <code className="font-mono bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded text-slate-700 dark:text-slate-300">
                  Title, Type, Priority, Status, Description
                </code>
              </p>

              <textarea
                rows={6}
                value={importText}
                onChange={(e) => setImportText(e.target.value)}
                placeholder={`Upgrade Redis to v7.2, TASK, HIGH, TODO, Migrate cache layer\nFix memory leak in ws gateway, BUG, URGENT, TODO, Uncollected socket handles`}
                className="w-full p-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800/60 font-mono text-xs text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-1 focus:ring-blue-600 focus:border-blue-600 resize-none transition"
              />

              {importStatus && (
                <div
                  className={`flex items-start gap-2 p-3 rounded-lg border text-xs font-medium ${
                    importStatus.includes('Successfully')
                      ? 'bg-emerald-50 text-emerald-800 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-900'
                      : 'bg-rose-50 text-rose-800 border-rose-200 dark:bg-rose-950/40 dark:text-rose-300 dark:border-rose-900'
                  }`}
                >
                  {importStatus}
                </div>
              )}

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsImportOpen(false)}
                  className="px-3 py-1.5 rounded-lg text-xs font-medium text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 cursor-pointer transition"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleParseAndImport}
                  disabled={importMutation.isPending || !importText.trim()}
                  className={btnPrimary}
                >
                  {importMutation.isPending ? 'Importing…' : 'Parse & Import'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
