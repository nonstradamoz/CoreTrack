'use client';

import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useProject } from '../../context/ProjectContext';
import {
  fetchTodayStandup,
  saveDailyStandup,
  fetchTeamStandups,
  StandupTaskItem,
} from '../../lib/api';
import {
  X,
  CalendarCheck2,
  CheckCircle2,
  Clock,
  Copy,
  Check,
  Send,
  Users,
  User,
  Calendar,
  Sparkles,
  RefreshCw,
} from 'lucide-react';

function getLocalDateStr(d: Date = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

interface DailyStatusDrawerProps {
  isOpen: boolean;
  onClose: () => void;
}

export function DailyStatusDrawer({ isOpen, onClose }: DailyStatusDrawerProps) {
  const queryClient = useQueryClient();
  const { activeProject } = useProject();

  const [activeTab, setActiveTab] = useState<'MY_STATUS' | 'TEAM_STANDUPS'>('MY_STATUS');
  const [selectedDate, setSelectedDate] = useState<string>(() => getLocalDateStr());
  const [copiedType, setCopiedType] = useState<'MARKDOWN' | 'TEXT' | null>(null);
  const [copiedEntryId, setCopiedEntryId] = useState<string | null>(null);
  const [customNotes, setCustomNotes] = useState('');
  const [saveSuccess, setSaveSuccess] = useState(false);

  // Close on Escape & toggle on Cmd+D
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  // Query today's status (real-time polling while drawer is open)
  const { data: todayData, isLoading: isLoadingToday, refetch: refetchToday, isFetching: isFetchingToday } = useQuery({
    queryKey: ['todayStandup', activeProject?.key],
    queryFn: () => (activeProject ? fetchTodayStandup(activeProject.key) : Promise.resolve(null)),
    enabled: isOpen && !!activeProject,
    staleTime: 0,
    refetchInterval: isOpen ? 5000 : false,
  });

  // Always refresh today's compiled tasks when opening the drawer
  useEffect(() => {
    if (isOpen && activeProject) {
      refetchToday();
    }
  }, [isOpen, activeProject, refetchToday]);

  // Query team standups
  const {
    data: teamData,
    isLoading: isLoadingTeam,
    isError: isTeamError,
    error: teamError,
    refetch: refetchTeam,
    isFetching: isFetchingTeam,
  } = useQuery({
    queryKey: ['teamStandups', activeProject?.key, selectedDate],
    queryFn: () =>
      activeProject ? fetchTeamStandups(activeProject.key, selectedDate) : Promise.resolve(null),
    enabled: isOpen && activeTab === 'TEAM_STANDUPS' && !!activeProject,
    staleTime: 0,
  });

  // Sync saved inputs if already submitted
  useEffect(() => {
    if (todayData?.savedStandup) {
      setCustomNotes(todayData.savedStandup.customNotes || '');
    }
  }, [todayData]);

  // Save Standup Mutation
  const saveMutation = useMutation({
    mutationFn: (payload: Parameters<typeof saveDailyStandup>[0]) => saveDailyStandup(payload),
    onSuccess: () => {
      setSaveSuccess(true);
      queryClient.invalidateQueries({ queryKey: ['todayStandup', activeProject?.key] });
      queryClient.invalidateQueries({ queryKey: ['teamStandups', activeProject?.key] });
      setTimeout(() => setSaveSuccess(false), 2500);
    },
  });

  if (!isOpen) return null;

  const completedList: StandupTaskItem[] = todayData?.autoCompiled.completed || [];
  const inProgressList: StandupTaskItem[] = todayData?.autoCompiled.inProgress || [];
  const blockedList: StandupTaskItem[] = todayData?.autoCompiled.blocked || [];

  // Generate dynamic formatted summary text for 1-click copy
  const todayFormattedDate = new Date().toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });

  const markdownSummary = `*Daily Status Update — ${todayFormattedDate}*

*Completed Today:*
${completedList.length > 0
      ? completedList
        .map((t) => `• [${t.key}] ${t.title}${t.storyPoints ? ` (${t.storyPoints} pts)` : ''}`)
        .join('\n')
      : '• None yet'
    }

*In Progress:*
${inProgressList.length > 0
      ? inProgressList
        .map((t) => `• [${t.key}] ${t.title}${t.storyPoints ? ` (${t.storyPoints} pts)` : ''}`)
        .join('\n')
      : '• None'
    }${blockedList.length > 0
      ? `\n\n*Blockers:*\n${blockedList.map((t) => `• [${t.key}] ${t.title}`).join('\n')}`
      : ''
    }${customNotes.trim()
      ? `\n\n📝 *Notes:*\n${customNotes.trim()}`
      : ''
    }`;

  const plainTextSummary = markdownSummary.replace(/\*/g, '').replace(/•/g, '-');

  function copyToClipboard(text: string, type: 'MARKDOWN' | 'TEXT') {
    navigator.clipboard.writeText(text);
    setCopiedType(type);
    setTimeout(() => setCopiedType(null), 2000);
  }

  function handleSaveStandup() {
    if (!activeProject || !todayData) return;

    saveMutation.mutate({
      projectId: activeProject.id,
      standupDate: todayData.date,
      completedTaskIds: completedList,
      inProgressTaskIds: inProgressList,
      blockers: blockedList.map((t) => `[${t.key}] ${t.title}`).join('\n'),
      customNotes,
      summaryMarkdown: markdownSummary,
    });
  }

  return (
    <div className="fixed inset-0 z-[70] overflow-hidden">
      {/* Backdrop */}
      <div
        onClick={onClose}
        className="absolute inset-0 bg-slate-900/40 dark:bg-black/60 backdrop-blur-xs transition-opacity"
      />

      {/* Slide-over Drawer Panel */}
      <div className="absolute inset-y-0 right-0 max-w-2xl w-full flex pl-10">
        <div className="w-full bg-white dark:bg-slate-900 shadow-2xl border-l border-slate-200 dark:border-slate-800 flex flex-col">
          {/* Drawer Header */}
          <div className="p-4 sm:p-5 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-xl bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400">
                <CalendarCheck2 className="h-5 w-5" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">
                    Daily Standup
                  </h2>
                  <span className="hidden sm:inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-mono font-medium bg-slate-100 dark:bg-slate-800 text-slate-500 border border-slate-200 dark:border-slate-700">
                    ⌘D
                  </span>
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  {todayFormattedDate} • {activeProject?.key}
                </p>
              </div>
            </div>

            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          {/* Navigation Tabs */}
          <div className="flex border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/40 px-4 pt-2">
            <button
              onClick={() => setActiveTab('MY_STATUS')}
              className={`pb-2.5 px-3 text-xs font-semibold border-b-2 transition flex items-center gap-2 ${activeTab === 'MY_STATUS'
                ? 'border-blue-600 text-blue-600 dark:text-blue-400'
                : 'border-transparent text-slate-500 hover:text-slate-900 dark:hover:text-slate-100'
                }`}
            >
              <User className="h-3.5 w-3.5" />
              <span>My Standup</span>
              {todayData?.savedStandup && (
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" title="Submitted" />
              )}
            </button>

            <button
              onClick={() => setActiveTab('TEAM_STANDUPS')}
              className={`pb-2.5 px-3 text-xs font-semibold border-b-2 transition flex items-center gap-2 ${activeTab === 'TEAM_STANDUPS'
                ? 'border-blue-600 text-blue-600 dark:text-blue-400'
                : 'border-transparent text-slate-500 hover:text-slate-900 dark:hover:text-slate-100'
                }`}
            >
              <Users className="h-3.5 w-3.5" />
              <span>Team Feed</span>
              {teamData?.standups && (
                <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-mono">
                  {teamData.standups.length}
                </span>
              )}
            </button>
          </div>

          {/* Drawer Body */}
          <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-6">
            {activeTab === 'MY_STATUS' ? (
              isLoadingToday ? (
                <div className="p-12 text-center text-xs text-slate-400">Loading today&apos;s activity...</div>
              ) : (
                <>
                  {/* Status Banner */}
                  <div className="flex items-center justify-between p-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/40 text-xs">
                    <div className="flex items-center gap-2">
                      {todayData?.savedStandup ? (
                        <>
                          <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                          <span className="font-semibold text-slate-800 dark:text-slate-200">
                            Submitted
                          </span>
                        </>
                      ) : (
                        <>
                          <Clock className="h-4 w-4 text-amber-600" />
                          <span className="font-semibold text-slate-800 dark:text-slate-200">
                            Not submitted
                          </span>
                        </>
                      )}
                    </div>

                    <button
                      type="button"
                      onClick={() => refetchToday()}
                      disabled={isFetchingToday}
                      className="inline-flex items-center gap-1 text-[11px] font-semibold text-blue-600 dark:text-blue-400 hover:underline cursor-pointer disabled:opacity-50"
                      title="Refresh live tasks"
                    >
                      <RefreshCw className={`h-3 w-3 ${isFetchingToday ? 'animate-spin' : ''}`} />
                      <span>Live</span>
                    </button>
                  </div>

                  {/* 1. SECTION: SUMMARY */}
                  <div className="rounded-xl border border-blue-200 dark:border-blue-900/80 bg-blue-50/30 dark:bg-blue-950/20 p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Sparkles className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                        <h3 className="text-xs font-bold text-slate-900 dark:text-slate-100 uppercase tracking-wide">
                          Summary
                        </h3>
                      </div>

                      {/* 1-Click Copy Buttons */}
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => copyToClipboard(markdownSummary, 'MARKDOWN')}
                          className="px-2.5 py-1 rounded-md text-[11px] font-semibold bg-white dark:bg-slate-800 border border-blue-200 dark:border-blue-800 hover:bg-blue-50 text-blue-700 dark:text-blue-300 shadow-2xs transition flex items-center gap-1 cursor-pointer"
                        >
                          {copiedType === 'MARKDOWN' ? (
                            <>
                              <Check className="h-3 w-3 text-emerald-600" />
                              <span className="text-emerald-600">Copied</span>
                            </>
                          ) : (
                            <>
                              <Copy className="h-3 w-3" />
                              <span>Markdown</span>
                            </>
                          )}
                        </button>

                        <button
                          type="button"
                          onClick={() => copyToClipboard(plainTextSummary, 'TEXT')}
                          className="px-2 py-1 rounded-md text-[11px] font-medium bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 text-slate-700 dark:text-slate-300 shadow-2xs transition flex items-center gap-1 cursor-pointer"
                        >
                          {copiedType === 'TEXT' ? (
                            <>
                              <Check className="h-3 w-3 text-emerald-600" />
                              <span className="text-emerald-600">Copied</span>
                            </>
                          ) : (
                            <>
                              <Copy className="h-3 w-3" />
                              <span>Text</span>
                            </>
                          )}
                        </button>
                      </div>
                    </div>

                    {/* Pre-formatted Standup Textarea for Review / Copy */}
                    <div className="relative">
                      <pre className="p-3 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 font-mono text-[11px] text-slate-800 dark:text-slate-200 whitespace-pre-wrap leading-relaxed select-all">
                        {markdownSummary}
                      </pre>
                    </div>
                  </div>

                  {/* 2. SECTION: CURRENT WORK STATUS BREAKDOWN */}
                  <div className="space-y-4">
                    <h3 className="text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wide">
                      Breakdown
                    </h3>

                    {/* Completed Today List */}
                    <div className="space-y-2">
                      <div className="flex items-center justify-between text-xs font-semibold text-slate-800 dark:text-slate-200">
                        <span className="flex items-center gap-1.5 text-emerald-700 dark:text-emerald-400">
                          <CheckCircle2 className="h-3.5 w-3.5" />
                          Done ({completedList.length})
                        </span>
                      </div>
                      {completedList.length === 0 ? (
                        <p className="text-xs text-slate-400 italic p-2.5 rounded-lg border border-dashed border-slate-200 dark:border-slate-800">
                          No completed tasks today.
                        </p>
                      ) : (
                        <div className="space-y-1.5">
                          {completedList.map((t) => (
                            <div
                              key={t.key}
                              className="p-2.5 rounded-lg border border-emerald-200/80 dark:border-emerald-900/60 bg-emerald-50/40 dark:bg-emerald-950/20 text-xs flex items-center justify-between"
                            >
                              <div className="flex items-center gap-2 min-w-0">
                                <span className="font-mono font-bold text-emerald-800 dark:text-emerald-400">
                                  {t.key}
                                </span>
                                <span className="truncate text-slate-800 dark:text-slate-200 font-medium">
                                  {t.title}
                                </span>
                              </div>
                              {t.storyPoints && (
                                <span className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-emerald-200 dark:border-emerald-900">
                                  {t.storyPoints} pts
                                </span>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* In Progress List */}
                    <div className="space-y-2">
                      <div className="flex items-center justify-between text-xs font-semibold text-slate-800 dark:text-slate-200">
                        <span className="flex items-center gap-1.5 text-blue-700 dark:text-blue-400">
                          <Clock className="h-3.5 w-3.5" />
                          In Progress ({inProgressList.length})
                        </span>
                      </div>
                      {inProgressList.length === 0 ? (
                        <p className="text-xs text-slate-400 italic p-2.5 rounded-lg border border-dashed border-slate-200 dark:border-slate-800">
                          No tasks currently in progress.
                        </p>
                      ) : (
                        <div className="space-y-1.5">
                          {inProgressList.map((t) => (
                            <div
                              key={t.key}
                              className="p-2.5 rounded-lg border border-blue-200/80 dark:border-blue-900/60 bg-blue-50/40 dark:bg-blue-950/20 text-xs flex items-center justify-between"
                            >
                              <div className="flex items-center gap-2 min-w-0">
                                <span className="font-mono font-bold text-blue-800 dark:text-blue-400">
                                  {t.key}
                                </span>
                                <span className="truncate text-slate-800 dark:text-slate-200 font-medium">
                                  {t.title}
                                </span>
                              </div>
                              <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-blue-200 dark:border-blue-900">
                                {(t.status || 'IN_PROGRESS').replace('_', ' ')}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Blocked List */}
                    {blockedList.length > 0 && (
                      <div className="space-y-2">
                        <div className="flex items-center justify-between text-xs font-semibold text-rose-700 dark:text-rose-400">
                          <span>Blocked ({blockedList.length})</span>
                        </div>
                        <div className="space-y-1.5">
                          {blockedList.map((t) => (
                            <div
                              key={t.key}
                              className="p-2.5 rounded-lg border border-rose-200/80 dark:border-rose-900/60 bg-rose-50/40 dark:bg-rose-950/20 text-xs flex items-center gap-2"
                            >
                              <span className="font-mono font-bold text-rose-800 dark:text-rose-400">
                                {t.key}
                              </span>
                              <span className="truncate text-slate-800 dark:text-slate-200 font-medium">
                                {t.title}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Notes Input */}
                    <div className="space-y-3 pt-2">
                      <div>
                        <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                          Notes
                        </label>
                        <textarea
                          rows={2}
                          value={customNotes}
                          onChange={(e) => setCustomNotes(e.target.value)}
                          placeholder="Optional notes or shoutouts..."
                          className="w-full px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs text-slate-900 dark:text-slate-100 focus:outline-none focus:border-blue-600"
                        />
                      </div>
                    </div>
                  </div>
                </>
              )
            ) : (
              /* TAB 2: TEAM STANDUPS FEED */
              <div className="space-y-4">
                {/* Date Navigator */}
                <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 p-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/40">
                  <span className="text-xs font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                    <Calendar className="h-3.5 w-3.5 text-blue-600" /> Date:
                  </span>
                  <div className="flex items-center gap-2 flex-wrap">
                    <button
                      type="button"
                      onClick={() => setSelectedDate(getLocalDateStr())}
                      className={`px-2.5 py-1 rounded-md text-xs font-semibold transition cursor-pointer ${selectedDate === getLocalDateStr()
                        ? 'bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 shadow-2xs'
                        : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700'
                        }`}
                    >
                      Today
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        const d = new Date();
                        d.setDate(d.getDate() - 1);
                        setSelectedDate(getLocalDateStr(d));
                      }}
                      className={`px-2.5 py-1 rounded-md text-xs font-medium border transition cursor-pointer ${(() => {
                        const d = new Date();
                        d.setDate(d.getDate() - 1);
                        return selectedDate === getLocalDateStr(d);
                      })()
                        ? 'bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 border-slate-900 dark:border-slate-100 shadow-2xs'
                        : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-50'
                        }`}
                    >
                      Yesterday
                    </button>
                    <input
                      type="date"
                      value={selectedDate}
                      onChange={(e) => setSelectedDate(e.target.value)}
                      className="px-2 py-1 rounded-md text-xs border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100"
                    />
                    <button
                      type="button"
                      onClick={() => refetchTeam()}
                      disabled={isFetchingTeam}
                      title="Refresh Team Feed"
                      className="p-1.5 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 transition cursor-pointer disabled:opacity-50"
                    >
                      <RefreshCw className={`h-3.5 w-3.5 ${isFetchingTeam ? 'animate-spin' : ''}`} />
                    </button>
                  </div>
                </div>

                {isLoadingTeam ? (
                  <div className="p-8 text-center text-xs text-slate-400">Loading team standups...</div>
                ) : isTeamError ? (
                  <div className="p-4 rounded-xl border border-rose-200 dark:border-rose-900/60 bg-rose-50/60 dark:bg-rose-950/20 text-xs text-rose-700 dark:text-rose-300 flex items-center justify-between">
                    <span>{(teamError as Error)?.message || 'Failed to load team feed.'}</span>
                    <button
                      type="button"
                      onClick={() => refetchTeam()}
                      className="px-2.5 py-1 rounded-md bg-white dark:bg-slate-900 border border-rose-200 dark:border-rose-800 font-semibold cursor-pointer"
                    >
                      Retry
                    </button>
                  </div>
                ) : !teamData?.standups?.length && !teamData?.unsubmittedActivity?.length ? (
                  <div className="p-12 text-center rounded-2xl border border-dashed border-slate-300 dark:border-slate-800">
                    <Users className="h-8 w-8 text-slate-300 dark:text-slate-600 mx-auto mb-2" />
                    <h4 className="text-sm font-semibold text-slate-700 dark:text-slate-300">
                      No standups or completed tasks for {selectedDate}
                    </h4>
                    <p className="text-xs text-slate-400 mt-1">
                      Check back once team members complete tasks or submit their daily standup.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {teamData?.standups?.length > 0 && (
                      <div className="space-y-3">
                        {teamData.standups.map((entry) => (
                          <div
                            key={entry.id}
                            className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-2xs space-y-3"
                          >
                            <div className="flex items-center justify-between pb-2 border-b border-slate-100 dark:border-slate-800">
                              <div className="flex items-center gap-2.5">
                                <div className="h-7 w-7 rounded-full bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 flex items-center justify-center text-xs font-bold shadow-2xs">
                                  {(entry.user.fullName || 'U').charAt(0).toUpperCase()}
                                </div>
                                <div>
                                  <div className="text-xs font-bold text-slate-900 dark:text-slate-100">
                                    {entry.user.fullName}
                                  </div>
                                  <div className="text-[10px] text-slate-400">{entry.user.email}</div>
                                </div>
                              </div>

                              <button
                                type="button"
                                onClick={() => {
                                  navigator.clipboard.writeText(entry.summaryMarkdown);
                                  setCopiedEntryId(entry.id);
                                  setTimeout(() => setCopiedEntryId(null), 2000);
                                }}
                                className="px-2 py-1 rounded text-[11px] font-medium text-slate-500 hover:text-blue-600 hover:bg-slate-50 dark:hover:bg-slate-800 transition flex items-center gap-1 cursor-pointer"
                                title="Copy standup text"
                              >
                                {copiedEntryId === entry.id ? (
                                  <>
                                    <Check className="h-3 w-3 text-emerald-600" />
                                    <span className="text-emerald-600">Copied</span>
                                  </>
                                ) : (
                                  <>
                                    <Copy className="h-3 w-3" />
                                    <span>Copy</span>
                                  </>
                                )}
                              </button>
                            </div>

                            <pre className="p-3 rounded-lg bg-slate-50 dark:bg-slate-800/50 font-mono text-[11px] text-slate-700 dark:text-slate-300 whitespace-pre-wrap leading-relaxed">
                              {entry.summaryMarkdown}
                            </pre>
                          </div>
                        ))}
                      </div>
                    )}

                    {teamData?.unsubmittedActivity && teamData.unsubmittedActivity.length > 0 && (
                      <div className="space-y-2.5 pt-1">
                        <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                          Completed Tasks (Standup Not Yet Submitted)
                        </div>
                        {teamData.unsubmittedActivity.map((item) => (
                          <div
                            key={item.user.id}
                            className="p-3.5 rounded-xl border border-slate-200/80 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-900/60 space-y-2"
                          >
                            <div className="flex items-center gap-2">
                              <div className="h-6 w-6 rounded-full bg-emerald-600 text-white flex items-center justify-center text-[10px] font-bold">
                                {(item.user.fullName || 'U').charAt(0).toUpperCase()}
                              </div>
                              <div className="text-xs font-bold text-slate-800 dark:text-slate-200">
                                {item.user.fullName}
                              </div>
                              <span className="ml-auto text-[10px] font-semibold px-2 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300">
                                {item.completedTasks.length} done
                              </span>
                            </div>
                            <ul className="space-y-1">
                              {item.completedTasks.map((t) => (
                                <li key={t.key} className="text-xs text-slate-600 dark:text-slate-300 flex items-center gap-2">
                                  <span className="font-mono text-[10px] font-bold text-emerald-700 dark:text-emerald-400">
                                    {t.key}
                                  </span>
                                  <span className="truncate">{t.title}</span>
                                </li>
                              ))}
                            </ul>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Drawer Footer (Only on My Status Tab) */}
          {activeTab === 'MY_STATUS' && (
            <div className="p-4 border-t border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50 flex items-center justify-between">
              <div>
                {saveSuccess && (
                  <span className="text-xs font-semibold text-emerald-600 flex items-center gap-1">
                    <Check className="h-3.5 w-3.5" /> Saved
                  </span>
                )}
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-3 py-1.5 rounded-lg text-xs font-medium text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition cursor-pointer"
                >
                  Close
                </button>
                <button
                  type="button"
                  onClick={handleSaveStandup}
                  disabled={saveMutation.isPending}
                  className="px-3.5 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold shadow-2xs disabled:opacity-50 flex items-center gap-1.5 transition cursor-pointer"
                >
                  <Send className="h-3 w-3" />
                  <span>{saveMutation.isPending ? 'Saving...' : 'Save'}</span>
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
