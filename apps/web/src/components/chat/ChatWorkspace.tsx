'use client';

import React, { useState, useEffect, useRef, useMemo } from 'react';
import Link from 'next/link';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  fetchChatChannels,
  fetchChatMessages,
  sendChatMessage,
  editChatMessage,
  deleteChatMessage,
  toggleChatReaction,
  markChatChannelRead,
  openDirectMessage,
  fetchAvailableUsers,
  fetchCurrentUser,
  getBaseApiUrl,
  searchChatMessages,
  ChatChannel,
  ChatMessage,
  ChatAttachment,
  ChatSearchMatch,
  UserPersona,
} from '../../lib/api';
import {
  Hash,
  Users,
  FolderGit2,
  MessageSquare,
  Send,
  Paperclip,
  Smile,
  Edit2,
  Trash2,
  MessageCircle,
  X,
  Plus,
  Search,
  Check,
  FileText,
  ExternalLink,
} from 'lucide-react';

const QUICK_EMOJIS = ['👍', '❤️', '🎉', '👀', '🚀'];

export function ChatWorkspace({ compact = false }: { compact?: boolean }) {
  const queryClient = useQueryClient();
  const [selectedChannelId, setSelectedChannelId] = useState<string | null>(null);
  const [channelSearch, setChannelSearch] = useState('');
  const [messageInput, setMessageInput] = useState('');
  const [pendingAttachments, setPendingAttachments] = useState<ChatAttachment[]>([]);
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
  const [editingBody, setEditingBody] = useState('');
  const [activeThreadParent, setActiveThreadParent] = useState<ChatMessage | null>(null);
  const [threadInput, setThreadInput] = useState('');
  const [isNewDmOpen, setIsNewDmOpen] = useState(false);
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);

  // Message Search State
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [searchScope, setSearchScope] = useState<'CHANNEL' | 'ALL'>('ALL');
  const [searchSenderId, setSearchSenderId] = useState('');
  const [highlightedMessageId, setHighlightedMessageId] = useState<string | null>(null);
  const [pendingJumpMessageId, setPendingJumpMessageId] = useState<string | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedQuery(searchQuery.trim()), 250);
    return () => clearTimeout(t);
  }, [searchQuery]);

  const { data: searchResults = [], isFetching: isSearching } = useQuery<ChatSearchMatch[]>({
    queryKey: ['chatSearch', debouncedQuery, searchScope, selectedChannelId, searchSenderId],
    queryFn: () =>
      searchChatMessages({
        q: debouncedQuery,
        channelId: searchScope === 'CHANNEL' && selectedChannelId ? selectedChannelId : undefined,
        senderId: searchSenderId || undefined,
      }),
    enabled: isSearchOpen && debouncedQuery.length > 0,
  });

  const { data: currentUser } = useQuery({
    queryKey: ['currentUser'],
    queryFn: fetchCurrentUser,
  });

  const { data: availableUsers = [] } = useQuery<UserPersona[]>({
    queryKey: ['availableUsers'],
    queryFn: fetchAvailableUsers,
  });

  const { data: channels = [], isLoading: isChannelsLoading } = useQuery<ChatChannel[]>({
    queryKey: ['chatChannels'],
    queryFn: fetchChatChannels,
    refetchInterval: 15000,
  });

  // Auto-select first channel
  useEffect(() => {
    if (!selectedChannelId && channels.length > 0) {
      setSelectedChannelId(channels[0].id);
    }
  }, [channels, selectedChannelId]);

  const activeChannel = channels.find((c) => c.id === selectedChannelId) || null;

  const { data: messages = [], isLoading: isMessagesLoading } = useQuery<ChatMessage[]>({
    queryKey: ['chatMessages', selectedChannelId],
    queryFn: () => (selectedChannelId ? fetchChatMessages(selectedChannelId) : Promise.resolve([])),
    enabled: !!selectedChannelId,
  });

  // Scroll & highlight when jumping to a searched message
  useEffect(() => {
    if (!pendingJumpMessageId) return;
    const el = document.querySelector(`[data-message-id="${pendingJumpMessageId}"]`);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      setHighlightedMessageId(pendingJumpMessageId);
      setPendingJumpMessageId(null);
      const timer = setTimeout(() => setHighlightedMessageId(null), 2600);
      return () => clearTimeout(timer);
    }
  }, [pendingJumpMessageId, messages]);

  function handleJumpToMatch(match: ChatSearchMatch) {
    setSelectedChannelId(match.channelId);
    if (match.parentMessageId) {
      const parent = messages.find((m) => m.id === match.parentMessageId);
      if (parent) setActiveThreadParent(parent);
    } else {
      setActiveThreadParent(null);
    }
    setPendingJumpMessageId(match.id);
  }

  const { data: threadReplies = [] } = useQuery<ChatMessage[]>({
    queryKey: ['chatThread', selectedChannelId, activeThreadParent?.id],
    queryFn: () =>
      selectedChannelId && activeThreadParent
        ? fetchChatMessages(selectedChannelId, activeThreadParent.id)
        : Promise.resolve([]),
    enabled: !!selectedChannelId && !!activeThreadParent,
  });

  // Mark channel as read when opened or when messages change
  useEffect(() => {
    if (selectedChannelId && activeChannel && activeChannel.unreadCount > 0) {
      markChatChannelRead(selectedChannelId).then(() => {
        queryClient.invalidateQueries({ queryKey: ['chatChannels'] });
      });
    }
  }, [selectedChannelId, messages.length]);

  // Scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length, selectedChannelId]);

  // WebSocket real-time subscription
  useEffect(() => {
    const httpBase = getBaseApiUrl() || (typeof window !== 'undefined' ? window.location.origin : 'http://localhost:4000');
    const wsBase = httpBase.replace(/^http/, 'ws');
    let ws: WebSocket | null = null;
    try {
      ws = new WebSocket(`${wsBase}/ws`);
      ws.onopen = () => {
        ws?.send(JSON.stringify({ type: 'subscribe_chat_global' }));
        if (selectedChannelId) {
          ws?.send(JSON.stringify({ type: 'subscribe_chat', channelId: selectedChannelId }));
        }
      };
      ws.onmessage = (event) => {
        try {
          const frame = JSON.parse(event.data);
          if (
            frame.type === 'CHAT_MESSAGE_CREATED' ||
            frame.type === 'CHAT_MESSAGE_UPDATED' ||
            frame.type === 'CHAT_MESSAGE_DELETED' ||
            frame.type === 'CHAT_MESSAGE_REACTED'
          ) {
            queryClient.invalidateQueries({ queryKey: ['chatChannels'] });
            if (frame.channelId === selectedChannelId) {
              queryClient.invalidateQueries({ queryKey: ['chatMessages', selectedChannelId] });
              if (activeThreadParent) {
                queryClient.invalidateQueries({
                  queryKey: ['chatThread', selectedChannelId, activeThreadParent.id],
                });
              }
            }
          }
        } catch {
          // ignore
        }
      };
    } catch {
      // ignore ws errors in SSR/offline
    }

    return () => {
      ws?.close();
    };
  }, [selectedChannelId, activeThreadParent?.id, queryClient]);

  const sendMutation = useMutation({
    mutationFn: (payload: { body: string; parentMessageId?: string | null; attachments?: ChatAttachment[] }) =>
      sendChatMessage(selectedChannelId!, payload),
    onSuccess: (_msg, vars) => {
      if (vars.parentMessageId) {
        setThreadInput('');
        queryClient.invalidateQueries({ queryKey: ['chatThread', selectedChannelId, vars.parentMessageId] });
      } else {
        setMessageInput('');
        setPendingAttachments([]);
      }
      queryClient.invalidateQueries({ queryKey: ['chatMessages', selectedChannelId] });
      queryClient.invalidateQueries({ queryKey: ['chatChannels'] });
    },
  });

  const editMutation = useMutation({
    mutationFn: ({ id, body }: { id: string; body: string }) => editChatMessage(id, body),
    onSuccess: () => {
      setEditingMessageId(null);
      setEditingBody('');
      queryClient.invalidateQueries({ queryKey: ['chatMessages', selectedChannelId] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteChatMessage(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['chatMessages', selectedChannelId] });
      queryClient.invalidateQueries({ queryKey: ['chatChannels'] });
    },
  });

  const reactionMutation = useMutation({
    mutationFn: ({ id, emoji }: { id: string; emoji: string }) => toggleChatReaction(id, emoji),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['chatMessages', selectedChannelId] });
      if (activeThreadParent) {
        queryClient.invalidateQueries({ queryKey: ['chatThread', selectedChannelId, activeThreadParent.id] });
      }
    },
  });

  const openDmMutation = useMutation({
    mutationFn: (targetUserId: string) => openDirectMessage(targetUserId),
    onSuccess: (channel) => {
      setIsNewDmOpen(false);
      queryClient.invalidateQueries({ queryKey: ['chatChannels'] });
      setSelectedChannelId(channel.id);
    },
  });

  // Group channels by category
  const filteredChannels = useMemo(() => {
    const q = channelSearch.trim().toLowerCase();
    return q ? channels.filter((c) => c.name.toLowerCase().includes(q)) : channels;
  }, [channels, channelSearch]);

  const projectChannels = filteredChannels.filter((c) => c.channelType === 'PROJECT');
  const teamChannels = filteredChannels.filter((c) => c.channelType === 'TEAM');
  const dmChannels = filteredChannels.filter((c) => c.channelType === 'DIRECT');

  // Mention autocomplete matching
  const mentionMatches = useMemo(() => {
    if (mentionQuery === null) return [];
    const q = mentionQuery.toLowerCase();
    return availableUsers
      .filter((u) => u.fullName.toLowerCase().includes(q) || u.email.toLowerCase().includes(q))
      .slice(0, 5);
  }, [mentionQuery, availableUsers]);

  function handleComposerChange(val: string) {
    setMessageInput(val);
    const match = val.match(/@([a-zA-Z0-9._-]*)$/);
    setMentionQuery(match ? match[1] : null);
  }

  function insertMention(user: UserPersona) {
    const firstName = user.fullName.split(' ')[0];
    setMessageInput((prev) => prev.replace(/@([a-zA-Z0-9._-]*)$/, `@${firstName} `));
    setMentionQuery(null);
  }

  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files || []);
    for (const file of files) {
      if (file.size > 2 * 1024 * 1024) {
        alert(`${file.name} exceeds 2 MB limit.`);
        continue;
      }
      const reader = new FileReader();
      reader.onload = () => {
        if (typeof reader.result === 'string') {
          setPendingAttachments((prev) => [
            ...prev,
            {
              name: file.name,
              url: reader.result as string,
              contentType: file.type,
              size: file.size,
            },
          ]);
        }
      };
      reader.readAsDataURL(file);
    }
    e.target.value = '';
  }

  // Render message text with @mentions and #TICKET-123 / CORE-12 links
  function renderMessageBody(text: string) {
    const parts = text.split(/(#[A-Z]{2,10}-\d+|@[a-zA-Z0-9._-]+)/g);
    return parts.map((part, idx) => {
      if (/^#[A-Z]{2,10}-\d+$/.test(part)) {
        const ticketKey = part.slice(1);
        const projKey = ticketKey.split('-')[0];
        return (
          <Link
            key={idx}
            href={`/?projectKey=${projKey}&ticket=${ticketKey}`}
            className="inline-flex items-center gap-0.5 px-1.5 py-0.5 mx-0.5 rounded bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 font-mono text-[11px] font-semibold hover:underline"
          >
            {part}
            <ExternalLink className="h-2.5 w-2.5" />
          </Link>
        );
      }
      if (/^@[a-zA-Z0-9._-]+$/.test(part)) {
        return (
          <span
            key={idx}
            className="px-1 py-0.5 mx-0.5 rounded bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-300 font-semibold text-xs"
          >
            {part}
          </span>
        );
      }
      return <React.Fragment key={idx}>{part}</React.Fragment>;
    });
  }

  return (
    <div
      className={`flex bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 overflow-hidden ${
        compact ? 'h-full rounded-none border-0' : 'h-[calc(100vh-8.5rem)] rounded-2xl shadow-2xs'
      }`}
    >
      {/* ── LEFT SIDEBAR: CHANNELS & DMs ────────────────────────────────────── */}
      <aside className={`${compact ? 'w-56' : 'w-68'} shrink-0 border-r border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-950/40 flex flex-col`}>
        <div className="p-3 border-b border-slate-200 dark:border-slate-800 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-900 dark:text-slate-100 flex items-center gap-1.5">
              <MessageSquare className="h-3.5 w-3.5 text-blue-600" />
              Workspace Chat
            </span>
            <button
              type="button"
              onClick={() => setIsNewDmOpen((v) => !v)}
              title="New Direct Message"
              className="p-1 rounded-lg hover:bg-slate-200/70 dark:hover:bg-slate-800 text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 transition cursor-pointer"
            >
              <Plus className="h-3.5 w-3.5" />
            </button>
          </div>
          <div className="relative">
            <Search className="h-3 w-3 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Filter channels..."
              value={channelSearch}
              onChange={(e) => setChannelSearch(e.target.value)}
              className="w-full pl-7 pr-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-[11px] text-slate-800 dark:text-slate-200 placeholder-slate-400 focus:outline-none focus:border-blue-500"
            />
          </div>
        </div>

        {/* New DM Picker */}
        {isNewDmOpen && (
          <div className="p-2 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 max-h-44 overflow-y-auto space-y-1">
            <div className="flex items-center justify-between px-1.5 py-0.5 text-[10px] font-semibold uppercase text-slate-400">
              <span>Start Direct Message</span>
              <button onClick={() => setIsNewDmOpen(false)} className="hover:text-slate-600 cursor-pointer">
                <X className="h-3 w-3" />
              </button>
            </div>
            {availableUsers
              .filter((u) => u.id !== currentUser?.id)
              .map((u) => (
                <button
                  key={u.id}
                  type="button"
                  onClick={() => openDmMutation.mutate(u.id)}
                  className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-left text-xs transition cursor-pointer"
                >
                  <div className="h-5 w-5 rounded-full bg-blue-600 text-white text-[10px] font-bold flex items-center justify-center shrink-0">
                    {u.fullName[0]}
                  </div>
                  <span className="truncate text-slate-800 dark:text-slate-200 font-medium">{u.fullName}</span>
                </button>
              ))}
          </div>
        )}

        {/* Channel Groups */}
        <div className="flex-1 overflow-y-auto p-2 space-y-4">
          {isChannelsLoading ? (
            <div className="py-8 text-center text-[11px] text-slate-400">Loading channels...</div>
          ) : (
            <>
              {/* Project Channels */}
              <div>
                <div className="px-2 mb-1 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                  Projects
                </div>
                <div className="space-y-0.5">
                  {projectChannels.map((ch) => (
                    <ChannelButton
                      key={ch.id}
                      channel={ch}
                      active={ch.id === selectedChannelId}
                      onClick={() => {
                        setSelectedChannelId(ch.id);
                        setActiveThreadParent(null);
                      }}
                    />
                  ))}
                  {projectChannels.length === 0 && (
                    <p className="px-2 text-[11px] text-slate-400 italic">No project channels</p>
                  )}
                </div>
              </div>

              {/* Team Channels */}
              <div>
                <div className="px-2 mb-1 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                  Teams
                </div>
                <div className="space-y-0.5">
                  {teamChannels.map((ch) => (
                    <ChannelButton
                      key={ch.id}
                      channel={ch}
                      active={ch.id === selectedChannelId}
                      onClick={() => {
                        setSelectedChannelId(ch.id);
                        setActiveThreadParent(null);
                      }}
                    />
                  ))}
                  {teamChannels.length === 0 && (
                    <p className="px-2 text-[11px] text-slate-400 italic">No team channels</p>
                  )}
                </div>
              </div>

              {/* Direct Messages */}
              <div>
                <div className="px-2 mb-1 flex items-center justify-between text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                  <span>Direct Messages</span>
                  <button
                    type="button"
                    onClick={() => setIsNewDmOpen(true)}
                    className="hover:text-blue-600 cursor-pointer"
                  >
                    + New
                  </button>
                </div>
                <div className="space-y-0.5">
                  {dmChannels.map((ch) => (
                    <ChannelButton
                      key={ch.id}
                      channel={ch}
                      active={ch.id === selectedChannelId}
                      onClick={() => {
                        setSelectedChannelId(ch.id);
                        setActiveThreadParent(null);
                      }}
                    />
                  ))}
                  {dmChannels.length === 0 && (
                    <p className="px-2 text-[11px] text-slate-400 italic">No DMs yet</p>
                  )}
                </div>
              </div>
            </>
          )}
        </div>
      </aside>

      {/* ── CENTER: MESSAGE STREAM & COMPOSER ──────────────────────────────── */}
      <main className="flex-1 flex flex-col min-w-0">
        {activeChannel ? (
          <>
            {/* Channel Header */}
            <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="p-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
                  {activeChannel.channelType === 'PROJECT' ? (
                    <FolderGit2 className="h-4 w-4 text-blue-600" />
                  ) : activeChannel.channelType === 'TEAM' ? (
                    <Users className="h-4 w-4 text-emerald-600" />
                  ) : (
                    <MessageCircle className="h-4 w-4 text-indigo-600" />
                  )}
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <h2 className="text-sm font-bold text-slate-900 dark:text-slate-100 truncate">
                      {activeChannel.name}
                    </h2>
                    <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-slate-100 dark:bg-slate-800 text-slate-500">
                      {activeChannel.channelType === 'DIRECT'
                        ? 'Direct'
                        : activeChannel.channelType === 'PROJECT'
                          ? activeChannel.project?.key || 'Project'
                          : activeChannel.team?.keyPrefix || 'Team'}
                    </span>
                  </div>
                  {activeChannel.peerUser?.email && (
                    <p className="text-[11px] text-slate-400 font-mono truncate">{activeChannel.peerUser.email}</p>
                  )}
                </div>
              </div>

              {/* Search Toggle / Inline Search Bar */}
              <div className="flex items-center gap-2 shrink-0">
                {isSearchOpen ? (
                  <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-xl border border-blue-500 bg-slate-50 dark:bg-slate-800/80">
                    <Search className="h-3.5 w-3.5 text-blue-600 shrink-0" />
                    <input
                      type="text"
                      autoFocus
                      placeholder="Search messages..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="w-36 sm:w-48 bg-transparent text-xs text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:outline-none"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        setIsSearchOpen(false);
                        setSearchQuery('');
                        setDebouncedQuery('');
                      }}
                      className="text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 cursor-pointer"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setIsSearchOpen(true)}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800 text-xs font-medium text-slate-600 dark:text-slate-300 transition cursor-pointer"
                  >
                    <Search className="h-3.5 w-3.5 text-slate-400" />
                    <span className="hidden sm:inline">Search</span>
                  </button>
                )}
              </div>
            </div>

            {/* Message Feed */}
            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {isMessagesLoading ? (
                <div className="py-12 text-center text-xs text-slate-400">Loading messages...</div>
              ) : messages.length === 0 ? (
                <div className="py-16 text-center space-y-1.5">
                  <MessageSquare className="h-8 w-8 text-slate-300 dark:text-slate-700 mx-auto" />
                  <p className="text-xs font-medium text-slate-600 dark:text-slate-300">
                    No messages in {activeChannel.name} yet
                  </p>
                  <p className="text-[11px] text-slate-400">
                    Mention teammates with <code className="font-mono">@name</code> or link tasks with <code className="font-mono">#CORE-1</code>.
                  </p>
                </div>
              ) : (
                messages.map((msg) => {
                  const isOwn = msg.senderId === currentUser?.id;
                  const isDeleted = Boolean(msg.deletedAt);
                  const reactionEntries = Object.entries(msg.reactions || {});

                  return (
                    <div
                      key={msg.id}
                      data-message-id={msg.id}
                      className={`group relative flex items-start gap-3 p-2 -mx-2 rounded-xl transition ${
                        highlightedMessageId === msg.id
                          ? 'bg-blue-50/90 dark:bg-blue-950/50 ring-2 ring-blue-500/60'
                          : 'hover:bg-slate-50/90 dark:hover:bg-slate-800/40'
                      }`}
                    >
                      <div className="h-8 w-8 rounded-full bg-blue-600 text-white text-xs font-bold flex items-center justify-center shrink-0 mt-0.5">
                        {msg.sender?.fullName?.[0] || 'U'}
                      </div>

                      <div className="flex-1 min-w-0">
                        <div className="flex items-baseline gap-2">
                          <span className="text-xs font-bold text-slate-900 dark:text-slate-100">
                            {msg.sender?.fullName || 'User'}
                          </span>
                          <span className="text-[10px] text-slate-400 font-mono">
                            {new Date(msg.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </span>
                          {msg.editedAt && !isDeleted && (
                            <span className="text-[10px] text-slate-400 italic">(edited)</span>
                          )}
                        </div>

                        {editingMessageId === msg.id ? (
                          <div className="mt-1.5 flex items-center gap-2">
                            <input
                              type="text"
                              value={editingBody}
                              onChange={(e) => setEditingBody(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter' && editingBody.trim()) {
                                  editMutation.mutate({ id: msg.id, body: editingBody.trim() });
                                } else if (e.key === 'Escape') {
                                  setEditingMessageId(null);
                                }
                              }}
                              className="flex-1 px-2.5 py-1.5 rounded-lg border border-blue-500 bg-white dark:bg-slate-900 text-xs text-slate-900 dark:text-slate-100"
                              autoFocus
                            />
                            <button
                              onClick={() => editingBody.trim() && editMutation.mutate({ id: msg.id, body: editingBody.trim() })}
                              className="p-1.5 rounded-lg bg-blue-600 text-white text-xs cursor-pointer"
                            >
                              <Check className="h-3.5 w-3.5" />
                            </button>
                            <button
                              onClick={() => setEditingMessageId(null)}
                              className="p-1.5 rounded-lg bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300 text-xs cursor-pointer"
                            >
                              <X className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        ) : (
                          <p
                            className={`text-xs mt-0.5 leading-relaxed whitespace-pre-wrap break-words ${
                              isDeleted ? 'italic text-slate-400' : 'text-slate-700 dark:text-slate-300'
                            }`}
                          >
                            {isDeleted ? msg.body : renderMessageBody(msg.body)}
                          </p>
                        )}

                        {/* Attachments */}
                        {!isDeleted && msg.attachments && msg.attachments.length > 0 && (
                          <div className="mt-2 flex flex-wrap gap-2">
                            {msg.attachments.map((att, idx) =>
                              att.contentType?.startsWith('image/') ? (
                                <a
                                  key={idx}
                                  href={att.url}
                                  download={att.name}
                                  className="block rounded-lg overflow-hidden border border-slate-200 dark:border-slate-700 max-w-[220px]"
                                >
                                  <img src={att.url} alt={att.name} className="max-h-36 object-cover" />
                                </a>
                              ) : (
                                <a
                                  key={idx}
                                  href={att.url}
                                  download={att.name}
                                  className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-[11px] font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100"
                                >
                                  <FileText className="h-3.5 w-3.5 text-blue-600" />
                                  <span className="truncate max-w-[160px]">{att.name}</span>
                                </a>
                              )
                            )}
                          </div>
                        )}

                        {/* Reactions */}
                        {reactionEntries.length > 0 && (
                          <div className="mt-1.5 flex flex-wrap items-center gap-1">
                            {reactionEntries.map(([emoji, userIds]) => {
                              const reacted = currentUser ? userIds.includes(currentUser.id) : false;
                              return (
                                <button
                                  key={emoji}
                                  type="button"
                                  onClick={() => reactionMutation.mutate({ id: msg.id, emoji })}
                                  className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] border transition cursor-pointer ${
                                    reacted
                                      ? 'bg-blue-50 dark:bg-blue-950/60 border-blue-300 dark:border-blue-800 text-blue-700 dark:text-blue-300'
                                      : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50'
                                  }`}
                                >
                                  <span>{emoji}</span>
                                  <span className="font-mono text-[10px] font-semibold">{userIds.length}</span>
                                </button>
                              );
                            })}
                          </div>
                        )}

                        {/* Thread Reply Count Link */}
                        {(msg.replyCount ?? 0) > 0 && (
                          <button
                            type="button"
                            onClick={() => setActiveThreadParent(msg)}
                            className="mt-1.5 inline-flex items-center gap-1 text-[11px] font-semibold text-blue-600 dark:text-blue-400 hover:underline cursor-pointer"
                          >
                            <MessageCircle className="h-3 w-3" />
                            <span>
                              {msg.replyCount} {msg.replyCount === 1 ? 'reply' : 'replies'}
                            </span>
                          </button>
                        )}
                      </div>

                      {/* Hover Action Bar */}
                      {!isDeleted && (
                        <div className="opacity-0 group-hover:opacity-100 transition flex items-center gap-0.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg p-0.5 shadow-sm">
                          {QUICK_EMOJIS.map((emoji) => (
                            <button
                              key={emoji}
                              type="button"
                              onClick={() => reactionMutation.mutate({ id: msg.id, emoji })}
                              className="px-1.5 py-1 rounded hover:bg-slate-100 dark:hover:bg-slate-800 text-xs cursor-pointer"
                            >
                              {emoji}
                            </button>
                          ))}
                          <button
                            type="button"
                            onClick={() => setActiveThreadParent(msg)}
                            title="Reply in thread"
                            className="p-1.5 rounded hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 hover:text-blue-600 cursor-pointer"
                          >
                            <MessageCircle className="h-3.5 w-3.5" />
                          </button>
                          {isOwn && (
                            <>
                              <button
                                type="button"
                                onClick={() => {
                                  setEditingMessageId(msg.id);
                                  setEditingBody(msg.body);
                                }}
                                title="Edit message"
                                className="p-1.5 rounded hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 hover:text-slate-800 cursor-pointer"
                              >
                                <Edit2 className="h-3.5 w-3.5" />
                              </button>
                              <button
                                type="button"
                                onClick={() => deleteMutation.mutate(msg.id)}
                                title="Delete message"
                                className="p-1.5 rounded hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 hover:text-rose-600 cursor-pointer"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            </>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Composer */}
            <div className="relative p-3 border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 space-y-2">
              {/* @mention autocomplete */}
              {mentionMatches.length > 0 && (
                <div className="absolute bottom-full left-3 mb-1 w-64 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-lg p-1 z-20">
                  {mentionMatches.map((u) => (
                    <button
                      key={u.id}
                      type="button"
                      onClick={() => insertMention(u)}
                      className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-left text-xs cursor-pointer"
                    >
                      <span className="font-semibold text-slate-800 dark:text-slate-200">{u.fullName}</span>
                      <span className="text-[10px] text-slate-400 truncate">{u.email}</span>
                    </button>
                  ))}
                </div>
              )}

              {/* Pending Attachments */}
              {pendingAttachments.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {pendingAttachments.map((att, idx) => (
                    <span
                      key={idx}
                      className="inline-flex items-center gap-1.5 px-2 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 text-[11px] text-slate-700 dark:text-slate-200"
                    >
                      <FileText className="h-3 w-3 text-blue-600" />
                      <span className="truncate max-w-[140px]">{att.name}</span>
                      <button
                        type="button"
                        onClick={() => setPendingAttachments((prev) => prev.filter((_, i) => i !== idx))}
                        className="text-slate-400 hover:text-rose-600 cursor-pointer"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </span>
                  ))}
                </div>
              )}

              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  if (!messageInput.trim() && pendingAttachments.length === 0) return;
                  sendMutation.mutate({
                    body: messageInput.trim() || 'Sent an attachment',
                    attachments: pendingAttachments,
                  });
                }}
                className="flex items-center gap-2"
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  className="hidden"
                  onChange={handleFileSelect}
                />
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  title="Attach file or image"
                  className="p-2 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 transition cursor-pointer"
                >
                  <Paperclip className="h-4 w-4" />
                </button>
                <input
                  type="text"
                  placeholder={`Message ${activeChannel.name}… (@mention, #CORE-1)`}
                  value={messageInput}
                  onChange={(e) => handleComposerChange(e.target.value)}
                  className="flex-1 px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/60 text-xs text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:border-blue-600"
                />
                <button
                  type="submit"
                  disabled={sendMutation.isPending || (!messageInput.trim() && pendingAttachments.length === 0)}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold transition disabled:opacity-40 cursor-pointer"
                >
                  <Send className="h-3.5 w-3.5" />
                  <span>Send</span>
                </button>
              </form>
            </div>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center text-xs text-slate-400">
            Select a channel or start a direct message.
          </div>
        )}
      </main>

      {/* ── RIGHT PANEL: SEARCH RESULTS ────────────────────────────────────── */}
      {isSearchOpen && !activeThreadParent && (
        <aside className="w-80 shrink-0 border-l border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/30 flex flex-col">
          <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-800 space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-900 dark:text-slate-100 flex items-center gap-1.5">
                <Search className="h-3.5 w-3.5 text-blue-600" />
                Search Messages
              </span>
              <button
                type="button"
                onClick={() => {
                  setIsSearchOpen(false);
                  setSearchQuery('');
                  setDebouncedQuery('');
                }}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 cursor-pointer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Scope Toggle: Current Channel vs All Channels */}
            <div className="grid grid-cols-2 p-0.5 rounded-lg bg-slate-200/70 dark:bg-slate-800 text-[11px] font-semibold">
              <button
                type="button"
                onClick={() => setSearchScope('CHANNEL')}
                className={`py-1 rounded-md transition cursor-pointer ${
                  searchScope === 'CHANNEL'
                    ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-2xs'
                    : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
                }`}
              >
                This Channel
              </button>
              <button
                type="button"
                onClick={() => setSearchScope('ALL')}
                className={`py-1 rounded-md transition cursor-pointer ${
                  searchScope === 'ALL'
                    ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-2xs'
                    : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
                }`}
              >
                All Channels
              </button>
            </div>

            {/* Sender Filter */}
            <select
              value={searchSenderId}
              onChange={(e) => setSearchSenderId(e.target.value)}
              className="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-[11px] text-slate-700 dark:text-slate-200 focus:outline-none focus:border-blue-600"
            >
              <option value="">All Senders</option>
              {availableUsers.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.fullName}
                </option>
              ))}
            </select>
          </div>

          <div className="flex-1 overflow-y-auto p-3 space-y-2">
            {!debouncedQuery ? (
              <div className="py-12 text-center text-xs text-slate-400">
                Type a keyword to search messages.
              </div>
            ) : isSearching ? (
              <div className="py-12 text-center text-xs text-slate-400">Searching...</div>
            ) : searchResults.length === 0 ? (
              <div className="py-12 text-center text-xs text-slate-400">
                No matching messages found.
              </div>
            ) : (
              searchResults.map((match) => (
                <button
                  key={match.id}
                  type="button"
                  onClick={() => handleJumpToMatch(match)}
                  className="w-full text-left p-3 rounded-xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 hover:border-blue-400 dark:hover:border-blue-600 transition space-y-1 cursor-pointer"
                >
                  <div className="flex items-center justify-between gap-2 text-[10px]">
                    <span className="px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 font-semibold text-slate-600 dark:text-slate-300 truncate max-w-[140px]">
                      {match.channelType === 'DIRECT' ? match.channelName : `# ${match.channelName}`}
                    </span>
                    <span className="font-mono text-slate-400 shrink-0">
                      {new Date(match.createdAt).toLocaleDateString([], { month: 'short', day: 'numeric' })}
                    </span>
                  </div>
                  <div className="text-[11px] font-bold text-slate-900 dark:text-slate-100">
                    {match.sender?.fullName || 'User'}
                  </div>
                  <p className="text-xs text-slate-600 dark:text-slate-300 line-clamp-2 leading-relaxed">
                    {match.body}
                  </p>
                </button>
              ))
            )}
          </div>
        </aside>
      )}

      {/* ── RIGHT PANEL: THREADED REPLIES ──────────────────────────────────── */}
      {activeThreadParent && (
        <aside className="w-76 shrink-0 border-l border-slate-200 dark:border-slate-800 bg-slate-50/40 dark:bg-slate-950/30 flex flex-col">
          <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
            <span className="text-xs font-bold text-slate-900 dark:text-slate-100">Thread</span>
            <button
              onClick={() => setActiveThreadParent(null)}
              className="p-1 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 cursor-pointer"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-3 space-y-3">
            {/* Parent Message */}
            <div className="p-3 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-1">
              <div className="flex items-center justify-between text-[11px]">
                <span className="font-bold text-slate-900 dark:text-slate-100">
                  {activeThreadParent.sender?.fullName || 'User'}
                </span>
                <span className="text-slate-400 font-mono">
                  {new Date(activeThreadParent.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </span>
              </div>
              <p className="text-xs text-slate-700 dark:text-slate-300 leading-relaxed">
                {renderMessageBody(activeThreadParent.body)}
              </p>
            </div>

            <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 px-1">
              {threadReplies.length} {threadReplies.length === 1 ? 'Reply' : 'Replies'}
            </div>

            {threadReplies.map((reply) => (
              <div key={reply.id} className="flex items-start gap-2 text-xs px-1">
                <div className="h-6 w-6 rounded-full bg-slate-200 dark:bg-slate-700 text-[10px] font-bold flex items-center justify-center shrink-0">
                  {reply.sender?.fullName?.[0] || 'U'}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline gap-1.5">
                    <span className="font-bold text-slate-900 dark:text-slate-100 text-[11px]">
                      {reply.sender?.fullName || 'User'}
                    </span>
                    <span className="text-[10px] text-slate-400 font-mono">
                      {new Date(reply.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                  <p className="text-slate-700 dark:text-slate-300 mt-0.5 leading-relaxed">
                    {renderMessageBody(reply.body)}
                  </p>
                </div>
              </div>
            ))}
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (!threadInput.trim()) return;
              sendMutation.mutate({
                body: threadInput.trim(),
                parentMessageId: activeThreadParent.id,
              });
            }}
            className="p-3 border-t border-slate-200 dark:border-slate-800 flex items-center gap-2 bg-white dark:bg-slate-900"
          >
            <input
              type="text"
              placeholder="Reply in thread..."
              value={threadInput}
              onChange={(e) => setThreadInput(e.target.value)}
              className="flex-1 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs text-slate-900 dark:text-slate-100 focus:outline-none focus:border-blue-600"
            />
            <button
              type="submit"
              disabled={sendMutation.isPending || !threadInput.trim()}
              className="p-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white disabled:opacity-40 cursor-pointer"
            >
              <Send className="h-3.5 w-3.5" />
            </button>
          </form>
        </aside>
      )}
    </div>
  );
}

function ChannelButton({
  channel,
  active,
  onClick,
}: {
  channel: ChatChannel;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-lg text-xs transition cursor-pointer ${
        active
          ? 'bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 font-semibold'
          : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800/60 hover:text-slate-900 dark:hover:text-slate-200'
      }`}
    >
      <div className="flex items-center gap-2 min-w-0">
        {channel.channelType === 'DIRECT' ? (
          <div className="h-4 w-4 rounded-full bg-indigo-600 text-white text-[9px] font-bold flex items-center justify-center shrink-0">
            {channel.name[0]}
          </div>
        ) : (
          <Hash className="h-3.5 w-3.5 shrink-0 opacity-60" />
        )}
        <span className="truncate">{channel.name}</span>
      </div>

      {channel.unreadCount > 0 && (
        <span className="px-1.5 py-0.2 rounded-full bg-blue-600 text-white text-[10px] font-bold shrink-0">
          {channel.unreadCount}
        </span>
      )}
    </button>
  );
}
