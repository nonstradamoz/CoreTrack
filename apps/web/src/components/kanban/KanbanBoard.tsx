'use client';

import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Ticket, fetchTickets, updateTicket, createTicket, Project } from '../../lib/api';
import { TicketCard } from './TicketCard';
import { CreateTicketModal } from './CreateTicketModal';
import { TicketDetailModal } from './TicketDetailModal';
import { AlertCircle } from 'lucide-react';

interface KanbanBoardProps {
  project: Project;
  searchQuery?: string;
  priorityFilter?: string;
}

const COLUMNS: { id: Ticket['status']; title: string; countColor: string; matchStatuses: Ticket['status'][] }[] = [
  {
    id: 'TODO',
    title: 'To Do',
    matchStatuses: ['TODO', 'BACKLOG'],
    countColor:
      'text-slate-600 dark:text-slate-400 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700',
  },
  {
    id: 'PENDING_APPROVAL',
    title: 'Pending Approval',
    matchStatuses: ['PENDING_APPROVAL'],
    countColor:
      'text-purple-700 dark:text-purple-300 bg-purple-50 dark:bg-purple-950/60 border border-purple-200 dark:border-purple-800/80',
  },
  {
    id: 'IN_PROGRESS',
    title: 'In Progress',
    matchStatuses: ['IN_PROGRESS'],
    countColor:
      'text-blue-700 dark:text-blue-300 bg-blue-50 dark:bg-blue-950/60 border border-blue-200 dark:border-blue-800/80',
  },
  {
    id: 'IN_REVIEW',
    title: 'In Review',
    matchStatuses: ['IN_REVIEW'],
    countColor:
      'text-amber-800 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/60 border border-amber-200 dark:border-amber-800/80',
  },
  {
    id: 'DONE',
    title: 'Done',
    matchStatuses: ['DONE', 'RESOLVED'],
    countColor:
      'text-emerald-800 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-800/80',
  },
  {
    id: 'CANCELED',
    title: 'Canceled',
    matchStatuses: ['CANCELED'],
    countColor:
      'text-rose-700 dark:text-rose-300 bg-rose-50 dark:bg-rose-950/60 border border-rose-200 dark:border-rose-800/80',
  },
];

export function KanbanBoard({ project, searchQuery = '', priorityFilter = 'ALL' }: KanbanBoardProps) {
  const queryClient = useQueryClient();
  const searchParams = useSearchParams();
  const [selectedTicket, setSelectedTicket] = useState<Ticket | null>(null);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // 1. Fetch project tickets
  const { data: tickets = [], isLoading } = useQuery({
    queryKey: ['tickets', project.key],
    queryFn: () => fetchTickets(project.key),
  });

  useEffect(() => {
    const tKey = searchParams.get('ticket');
    if (tKey && tickets.length > 0) {
      const match = tickets.find((t) => t.ticketKey === tKey);
      if (match) setSelectedTicket(match);
    }
  }, [searchParams, tickets]);

  // Filter tickets by search and priority (Functional Requirement)
  const filteredTickets = tickets.filter((t) => {
    const matchesSearch =
      !searchQuery ||
      t.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      t.ticketKey.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesPriority =
      !priorityFilter || priorityFilter === 'ALL' || t.priority === priorityFilter;
    return matchesSearch && matchesPriority;
  });

  // 2. Optimistic status mutation
  const moveTicketMutation = useMutation({
    mutationFn: ({
      ticketKey,
      newStatus,
      lockVersion,
    }: {
      ticketKey: string;
      newStatus: Ticket['status'];
      lockVersion: number;
    }) => updateTicket(ticketKey, { status: newStatus, lockVersion }),
    onMutate: async ({ ticketKey, newStatus }) => {
      await queryClient.cancelQueries({ queryKey: ['tickets', project.key] });
      const previousTickets = queryClient.getQueryData<Ticket[]>(['tickets', project.key]);

      if (previousTickets) {
        queryClient.setQueryData<Ticket[]>(
          ['tickets', project.key],
          previousTickets.map((t) =>
            t.ticketKey === ticketKey ? { ...t, status: newStatus, lockVersion: t.lockVersion + 1 } : t
          )
        );
      }
      return { previousTickets };
    },
    onError: (err: Error, _vars, context) => {
      if (context?.previousTickets) {
        queryClient.setQueryData(['tickets', project.key], context.previousTickets);
      }
      setErrorMessage(err.message);
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['tickets', project.key] });
    },
  });

  return (
    <div className="w-full flex-1 flex flex-col">
      {errorMessage && (
        <div className="mb-4 p-3 rounded-lg bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900/60 text-rose-800 dark:text-rose-200 text-xs flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertCircle className="h-4 w-4 shrink-0" />
            <span>{errorMessage}</span>
          </div>
          <button onClick={() => setErrorMessage(null)} className="underline font-medium hover:text-rose-900 dark:hover:text-rose-100">
            Dismiss
          </button>
        </div>
      )}

      {/* 6-Column Board Grid (horizontally scrollable on smaller viewports) */}
      <div className="flex gap-4 overflow-x-auto pb-2 flex-1 items-start">
        {COLUMNS.map((col) => {
          const colTickets = filteredTickets.filter((t) => col.matchStatuses.includes(t.status));

          return (
            <div
              key={col.id}
              className="flex flex-col rounded-xl border border-slate-200/80 dark:border-slate-800/80 bg-slate-100/70 dark:bg-slate-900/40 p-3 min-h-[520px] min-w-[260px] flex-1"
            >
              {/* Column Header */}
              <div className="flex items-center justify-between pb-3 px-1 mb-1">
                <span className="text-xs font-semibold text-slate-700 dark:text-slate-300 tracking-wider uppercase">
                  {col.title}
                </span>
                <span className={`px-2 py-0.5 rounded-full text-[11px] font-mono font-medium ${col.countColor}`}>
                  {colTickets.length}
                </span>
              </div>

              {/* Ticket Cards Stack */}
              <div className="flex flex-col gap-2.5 flex-1">
                {isLoading ? (
                  <div className="p-4 text-center text-xs text-slate-400 dark:text-slate-500">Loading tasks...</div>
                ) : colTickets.length === 0 ? (
                  <div className="h-24 rounded-lg border border-dashed border-slate-200 dark:border-slate-800 flex items-center justify-center text-xs text-slate-400 dark:text-slate-500">
                    No tickets
                  </div>
                ) : (
                  colTickets.map((ticket) => (
                    <TicketCard
                      key={ticket.id}
                      ticket={ticket}
                      onClick={() => setSelectedTicket(ticket)}
                      onQuickMove={(newStatus) =>
                        moveTicketMutation.mutate({
                          ticketKey: ticket.ticketKey,
                          newStatus,
                          lockVersion: ticket.lockVersion,
                        })
                      }
                    />
                  ))
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Modals */}
      {selectedTicket && (
        <TicketDetailModal
          ticket={selectedTicket}
          onClose={() => setSelectedTicket(null)}
        />
      )}

      <CreateTicketModal
        projectId={project.id}
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        onSubmit={async (input) => {
          await createTicket(input);
          setIsCreateModalOpen(false);
          queryClient.invalidateQueries({ queryKey: ['tickets', project.key] });
        }}
      />
    </div>
  );
}
