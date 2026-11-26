'use client';

import React from 'react';
import { HelpdeskTicket } from '../../lib/api';
import { SLABadge } from '../sla/SLABadge';
import { Clock, ArrowUpRight, User } from 'lucide-react';

interface MyRequestsListProps {
  tickets: HelpdeskTicket[];
  isLoading: boolean;
  showRequester?: boolean;
  onSelectTicket: (ticket: HelpdeskTicket) => void;
}

export const HELPDESK_STATUS_BADGE: Record<string, { label: string; color: string }> = {
  OPEN: {
    label: 'Open',
    color: 'bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-800',
  },
  IN_PROGRESS: {
    label: 'In Progress',
    color: 'bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 border-indigo-200 dark:border-indigo-800',
  },
  WAITING_ON_USER: {
    label: 'Waiting on User',
    color: 'bg-amber-50 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-800',
  },
  RESOLVED: {
    label: 'Resolved',
    color: 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800',
  },
  CLOSED: {
    label: 'Closed',
    color: 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700',
  },
};

export function MyRequestsList({
  tickets,
  isLoading,
  showRequester = false,
  onSelectTicket,
}: MyRequestsListProps) {
  if (isLoading) {
    return (
      <div className="p-12 text-center border border-slate-200 dark:border-slate-800 rounded-2xl bg-white dark:bg-slate-900">
        <Clock className="h-6 w-6 text-slate-400 mx-auto mb-2 animate-spin" />
        <p className="text-xs text-slate-500 dark:text-slate-400">Loading helpdesk requests...</p>
      </div>
    );
  }

  if (tickets.length === 0) {
    return (
      <div className="p-12 text-center border border-dashed border-slate-200 dark:border-slate-800 rounded-2xl bg-white dark:bg-slate-900">
        <Clock className="h-8 w-8 text-slate-400 mx-auto mb-3" />
        <h4 className="text-sm font-semibold text-slate-900 dark:text-slate-100 mb-1">No requests found</h4>
        <p className="text-xs text-slate-500 dark:text-slate-400">
          {showRequester
            ? 'No incoming helpdesk requests match the current filter.'
            : 'Select a service from the catalog to submit a new helpdesk ticket.'}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-2.5">
      {tickets.map((ticket) => {
        const status = HELPDESK_STATUS_BADGE[ticket.status] || {
          label: ticket.status,
          color: 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700',
        };

        return (
          <div
            key={ticket.id}
            onClick={() => onSelectTicket(ticket)}
            className="group p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:border-slate-300 dark:hover:border-slate-700 hover:shadow-2xs transition flex flex-col sm:flex-row sm:items-center justify-between gap-3 cursor-pointer"
          >
            <div className="flex items-start sm:items-center gap-3.5 min-w-0">
              <span className="font-mono text-xs font-semibold text-blue-600 dark:text-blue-400 shrink-0">
                {ticket.ticketKey}
              </span>
              <div className="min-w-0">
                <h4 className="text-sm font-medium text-slate-900 dark:text-slate-100 truncate">
                  {ticket.title}
                </h4>
                <div className="flex flex-wrap items-center gap-2 mt-1 text-[11px] text-slate-500 dark:text-slate-400">
                  <span className="font-medium text-slate-600 dark:text-slate-300">{ticket.category}</span>
                  <span>•</span>
                  <span>{ticket.department}</span>
                  <span>•</span>
                  <span>{new Date(ticket.createdAt).toLocaleDateString()}</span>
                  {showRequester && ticket.requester && (
                    <>
                      <span>•</span>
                      <span className="inline-flex items-center gap-1 text-slate-600 dark:text-slate-300">
                        <User className="h-3 w-3" />
                        {ticket.requester.fullName}
                      </span>
                    </>
                  )}
                  {ticket.assignee && (
                    <>
                      <span>•</span>
                      <span className="text-blue-600 dark:text-blue-400 font-medium">
                        Agent: {ticket.assignee.fullName}
                      </span>
                    </>
                  )}
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2.5 shrink-0">
              {ticket.slaResolutionDueAt && (
                <SLABadge
                  dueAt={ticket.slaResolutionDueAt}
                  isPaused={ticket.isSlaPaused}
                  isResolved={ticket.status === 'RESOLVED' || ticket.status === 'CLOSED'}
                  compact
                />
              )}
              <span className={`px-2.5 py-0.5 rounded-full border text-[11px] font-medium ${status.color}`}>
                {status.label}
              </span>
              <ArrowUpRight className="h-4 w-4 text-slate-400 group-hover:text-slate-900 dark:group-hover:text-slate-100 transition" />
            </div>
          </div>
        );
      })}
    </div>
  );
}
