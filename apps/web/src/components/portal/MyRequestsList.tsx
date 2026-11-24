'use client';

import React from 'react';
import { Ticket } from '../../lib/api';
import { SLABadge } from '../sla/SLABadge';
import { Clock, ArrowUpRight } from 'lucide-react';

interface MyRequestsListProps {
  tickets: Ticket[];
  isLoading: boolean;
  onSelectTicket: (ticket: Ticket) => void;
}

const statusBadge: Record<string, { label: string; color: string }> = {
  TODO: { label: 'Submitted', color: 'bg-blue-50 dark:bg-blue-950/60 text-blue-800 dark:text-blue-300 border-blue-200 dark:border-blue-800' },
  PENDING_APPROVAL: { label: 'Pending Approval', color: 'bg-amber-50 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300 border-amber-200 dark:border-amber-800' },
  IN_PROGRESS: { label: 'In Progress', color: 'bg-blue-50 dark:bg-blue-950/60 text-blue-800 dark:text-blue-300 border-blue-200 dark:border-blue-800' },
  IN_REVIEW: { label: 'Under Review', color: 'bg-purple-50 dark:bg-purple-950/60 text-purple-800 dark:text-purple-300 border-purple-200 dark:border-purple-800' },
  RESOLVED: { label: 'Resolved', color: 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800' },
  DONE: { label: 'Completed', color: 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800' },
  CANCELED: { label: 'Canceled', color: 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700' },
};

export function MyRequestsList({ tickets, isLoading, onSelectTicket }: MyRequestsListProps) {
  if (isLoading) {
    return (
      <div className="p-12 text-center border border-slate-200 dark:border-slate-800 rounded-2xl bg-white dark:bg-slate-900">
        <Clock className="h-6 w-6 text-slate-400 mx-auto mb-2 animate-spin" />
        <p className="text-xs text-slate-500 dark:text-slate-400">Loading your submitted requests...</p>
      </div>
    );
  }

  if (tickets.length === 0) {
    return (
      <div className="p-12 text-center border border-dashed border-slate-200 dark:border-slate-800 rounded-2xl bg-white dark:bg-slate-900">
        <Clock className="h-8 w-8 text-slate-400 mx-auto mb-3" />
        <h4 className="text-sm font-semibold text-slate-900 dark:text-slate-100 mb-1">No active requests</h4>
        <p className="text-xs text-slate-500 dark:text-slate-400">Select a category from the service catalog above to submit a ticket.</p>
      </div>
    );
  }

  return (
    <div className="space-y-2.5">
      {tickets.map((ticket) => {
        const status = statusBadge[ticket.status] || {
          label: ticket.status,
          color: 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700',
        };

        return (
          <div
            key={ticket.id}
            onClick={() => onSelectTicket(ticket)}
            className="group p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:border-slate-300 dark:hover:border-slate-700 hover:shadow-2xs transition flex items-center justify-between cursor-pointer"
          >
            <div className="flex items-center gap-4 min-w-0">
              <span className="font-mono text-xs font-semibold text-slate-500 dark:text-slate-400 shrink-0">
                {ticket.ticketKey}
              </span>
              <div className="min-w-0">
                <h4 className="text-sm font-medium text-slate-900 dark:text-slate-100 truncate">
                  {ticket.title}
                </h4>
                <div className="flex items-center gap-2 mt-1 text-[11px] text-slate-500 dark:text-slate-400">
                  <span className="capitalize">{ticket.ticketType.replace('_', ' ').toLowerCase()}</span>
                  <span>•</span>
                  <span>Submitted on {new Date(ticket.createdAt).toLocaleDateString()}</span>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-3 shrink-0 ml-4">
              {ticket.slaResolutionDueAt && (
                <SLABadge
                  dueAt={ticket.slaResolutionDueAt}
                  isPaused={ticket.isSlaPaused}
                  isResolved={ticket.status === 'DONE' || ticket.status === 'RESOLVED'}
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
