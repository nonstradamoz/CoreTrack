'use client';

import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Bell, Check, Clock, AlertTriangle, Layers, X, Mail } from 'lucide-react';
import { fetchEmailNotificationLogs } from '../../lib/api';
import { useModuleAccess } from '../../hooks/useModuleAccess';
import Link from 'next/link';

interface NotificationItem {
  id: string;
  title: string;
  message: string;
  type: 'SLA' | 'TICKET' | 'SPRINT' | 'EMAIL';
  timestamp: string;
  read: boolean;
}

export function NotificationsPopover() {
  const { canAccess } = useModuleAccess();
  const [isOpen, setIsOpen] = useState(false);
  const [dismissedIds, setDismissedIds] = useState<string[]>([]);

  const { data: emailLogs = [] } = useQuery({
    queryKey: ['recentEmailNotificationLogs'],
    queryFn: () => fetchEmailNotificationLogs(15, true),
    refetchInterval: 30000, // poll every 30s
  });

  // Map email logs assigned to current user
  const notifications: NotificationItem[] = emailLogs.map((log) => ({
    id: log.id,
    title: log.notificationType.replace(/_/g, ' '),
    message: log.subject,
    type: 'EMAIL',
    timestamp: new Date(log.sentAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    read: dismissedIds.includes(log.id),
  }));

  const unreadCount = notifications.filter((n) => !n.read).length;

  const markAllRead = () => {
    setDismissedIds(notifications.map((n) => n.id));
  };

  const getIcon = (type: NotificationItem['type']) => {
    switch (type) {
      case 'EMAIL':
        return <Mail className="h-3.5 w-3.5 text-indigo-500" />;
      case 'SLA':
        return <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />;
      case 'SPRINT':
        return <Layers className="h-3.5 w-3.5 text-blue-500" />;
      default:
        return <Clock className="h-3.5 w-3.5 text-blue-500" />;
    }
  };

  return (
    <div className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        title="Notifications"
        className="relative p-1.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800 shadow-2xs transition"
      >
        <Bell className="h-4 w-4" />
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 h-4 w-4 rounded-full bg-rose-500 text-[10px] font-bold text-white flex items-center justify-center animate-pulse">
            {unreadCount}
          </span>
        )}
      </button>

      {isOpen && (
        <div className="absolute right-0 mt-2 w-80 md:w-96 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xl z-50 overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between p-3.5 border-b border-slate-100 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/40">
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-slate-900 dark:text-slate-100">
                System & Email Alerts
              </span>
              {unreadCount > 0 && (
                <span className="px-1.5 py-0.2 rounded-full bg-blue-50 dark:bg-blue-950 text-blue-700 dark:text-blue-400 text-[10px] font-mono font-bold">
                  {unreadCount} new
                </span>
              )}
            </div>
            <div className="flex items-center gap-2">
              {unreadCount > 0 && (
                <button
                  onClick={markAllRead}
                  className="text-[11px] font-medium text-blue-600 dark:text-blue-400 hover:underline cursor-pointer"
                >
                  Mark all read
                </button>
              )}
              <button
                onClick={() => setIsOpen(false)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>

          {/* List */}
          <div className="max-h-72 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800/60">
            {notifications.length === 0 ? (
              <div className="p-6 text-center text-xs text-slate-400">
                No new notifications
              </div>
            ) : (
              notifications.map((item) => (
                <div
                  key={item.id}
                  className={`p-3 transition flex items-start gap-2.5 ${
                    item.read
                      ? 'bg-transparent text-slate-600 dark:text-slate-400'
                      : 'bg-indigo-50/30 dark:bg-indigo-950/20 text-slate-900 dark:text-slate-100'
                  }`}
                >
                  <div className="p-1 rounded-md bg-slate-100 dark:bg-slate-800 mt-0.5 shrink-0">
                    {getIcon(item.type)}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-semibold truncate">{item.title}</span>
                      <span className="text-[10px] text-slate-400 shrink-0 font-mono">
                        {item.timestamp}
                      </span>
                    </div>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 line-clamp-2 leading-relaxed">
                      {item.message}
                    </p>
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Footer Link */}
          {canAccess('automation') && (
            <div className="p-2 border-t border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/20 text-center">
              <Link
                href="/automation"
                onClick={() => setIsOpen(false)}
                className="text-[11px] font-semibold text-indigo-600 hover:text-indigo-700 dark:text-indigo-400 hover:underline"
              >
                Open Automation & SLA Engine &rarr;
              </Link>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
