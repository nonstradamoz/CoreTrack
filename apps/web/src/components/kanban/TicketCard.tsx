'use client';

import React from 'react';
import { Calendar, Clock, User } from 'lucide-react';
import { Ticket } from '../../lib/api';
import { SLABadge } from '../sla/SLABadge';

interface TicketCardProps {
  ticket: Ticket;
  onClick: () => void;
  onQuickMove: (targetStatus: Ticket['status']) => void;
}

const priorityConfig = {
  URGENT: { label: 'Urgent', color: 'bg-red-50 dark:bg-red-950/60 text-red-800 dark:text-red-300 border-red-200 dark:border-red-900/80' },
  HIGH: { label: 'High', color: 'bg-amber-50 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300 border-amber-200 dark:border-amber-900/80' },
  MEDIUM: { label: 'Medium', color: 'bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-900/80' },
  LOW: { label: 'Low', color: 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700' },
};

const typeConfig = {
  BUG: { color: 'text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/60' },
  STORY: { color: 'text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/60' },
  TASK: { color: 'text-blue-700 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/60' },
  INCIDENT: { color: 'text-red-700 dark:text-red-400 bg-red-50 dark:bg-red-950/60' },
  INITIATIVE: { color: 'text-purple-700 dark:text-purple-400 bg-purple-50 dark:bg-purple-950/60' },
  EPIC: { color: 'text-blue-700 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/60' },
  SERVICE_REQUEST: { color: 'text-cyan-700 dark:text-cyan-400 bg-cyan-50 dark:bg-cyan-950/60' },
};

export function TicketCard({ ticket, onClick, onQuickMove }: TicketCardProps) {
  const priority = priorityConfig[ticket.priority] || priorityConfig.MEDIUM;
  const typeStyle = typeConfig[ticket.ticketType] || typeConfig.TASK;

  let deadlineLabel = '';
  let deadlineStyle = 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700';
  if (ticket.dueDate) {
    const d = new Date(ticket.dueDate);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const target = new Date(d);
    target.setHours(0, 0, 0, 0);
    const diffDays = Math.round((target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

    if (diffDays < 0) {
      deadlineLabel = `Overdue (${Math.abs(diffDays)}d)`;
      deadlineStyle = 'bg-rose-50 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-900';
    } else if (diffDays === 0) {
      deadlineLabel = 'Due today';
      deadlineStyle = 'bg-amber-50 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-900';
    } else if (diffDays === 1) {
      deadlineLabel = 'Due tomorrow';
      deadlineStyle = 'bg-amber-50 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-900';
    } else {
      deadlineLabel = `Due ${d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`;
      deadlineStyle = 'bg-blue-50/70 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-900/60';
    }
  }

  return (
    <div
      onClick={onClick}
      className="group relative p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:border-slate-300 dark:hover:border-slate-700 hover:shadow-2xs dark:hover:bg-slate-800/80 transition-all duration-150 cursor-pointer"
    >
      {/* Top Meta: Key & Story Points */}
      <div className="flex items-center justify-between gap-2 mb-2">
        <span className="font-mono text-xs font-semibold text-slate-500 dark:text-slate-400 group-hover:text-slate-900 dark:group-hover:text-slate-100 transition">
          {ticket.ticketKey}
        </span>
        <div className="flex items-center gap-1.5">
          {ticket.storyPoints !== null && ticket.storyPoints !== undefined && (
            <span className="px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-[10px] font-mono font-medium text-slate-600 dark:text-slate-300">
              {ticket.storyPoints} pts
            </span>
          )}
          <span className={`px-2 py-0.5 rounded border text-[10px] font-medium ${priority.color}`}>
            {priority.label}
          </span>
        </div>
      </div>

      {/* Title */}
      <h4 className="text-sm font-medium text-slate-900 dark:text-slate-100 mb-2 line-clamp-2 leading-snug">
        {ticket.title}
      </h4>

      {/* SLA Countdown Badge if applicable */}
      {ticket.slaResolutionDueAt && (
        <div className="mb-2">
          <SLABadge
            dueAt={ticket.slaResolutionDueAt}
            isPaused={ticket.isSlaPaused}
            isResolved={ticket.status === 'DONE' || ticket.status === 'RESOLVED'}
          />
        </div>
      )}

      {/* Assignee & Deadline Status Row */}
      {(ticket.dueDate || ticket.assignee) && (
        <div className="flex items-center justify-between gap-2 mb-2.5 pt-0.5">
          {ticket.dueDate ? (
            <div className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium ${deadlineStyle}`}>
              <Calendar className="h-3 w-3 shrink-0" />
              <span>{deadlineLabel}</span>
            </div>
          ) : (
            <div className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium bg-amber-50 dark:bg-amber-950/60 text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-900/80">
              <Clock className="h-3 w-3 shrink-0" />
              <span>No deadline</span>
            </div>
          )}

          {ticket.assignee && (
            <div
              className="flex items-center gap-1.5 ml-auto"
              title={`Assigned to ${ticket.assignee.fullName} (${ticket.assignee.email})`}
            >
              <span className="text-[10px] text-slate-500 dark:text-slate-400 truncate max-w-[90px] font-medium">
                {ticket.assignee.fullName.split(' ')[0]}
              </span>
              <div className="h-5 w-5 rounded-full bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 flex items-center justify-center text-[10px] font-bold shadow-2xs shrink-0">
                {(ticket.assignee.fullName || 'U').charAt(0).toUpperCase()}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Bottom Bar: Type & Quick Transition Actions */}
      <div className="flex items-center justify-between pt-2 border-t border-slate-100 dark:border-slate-800/80 text-xs text-slate-500 dark:text-slate-400">
        <span className={`px-1.5 py-0.5 rounded text-[10px] font-mono font-semibold uppercase tracking-wide ${typeStyle.color}`}>
          {ticket.ticketType}
        </span>

        {/* Quick move buttons */}
        <div
          className="opacity-0 group-hover:opacity-100 transition-opacity duration-150 flex items-center gap-1"
          onClick={(e) => e.stopPropagation()}
        >
          {ticket.status !== 'TODO' && (
            <button
              onClick={() => onQuickMove('TODO')}
              title="Move to Todo"
              className="px-1.5 py-0.5 text-[10px] rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300"
            >
              Todo
            </button>
          )}
          {ticket.status !== 'IN_PROGRESS' && (
            <button
              onClick={() => onQuickMove('IN_PROGRESS')}
              title="Move to In Progress"
              className="px-1.5 py-0.5 text-[10px] rounded border border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-950/60 hover:bg-blue-100 dark:hover:bg-blue-900/60 text-blue-700 dark:text-blue-300"
            >
              Prog
            </button>
          )}
          {ticket.status !== 'IN_REVIEW' && (
            <button
              onClick={() => onQuickMove('IN_REVIEW')}
              title="Move to Review"
              className="px-1.5 py-0.5 text-[10px] rounded border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/60 hover:bg-amber-100 dark:hover:bg-amber-900/60 text-amber-800 dark:text-amber-300"
            >
              Rev
            </button>
          )}
          {ticket.status !== 'DONE' && (
            <button
              onClick={() => onQuickMove('DONE')}
              title="Mark as Done"
              className="px-1.5 py-0.5 text-[10px] rounded border border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/60 hover:bg-emerald-100 dark:hover:bg-emerald-900/60 text-emerald-800 dark:text-emerald-300 font-medium"
            >
              Done
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
