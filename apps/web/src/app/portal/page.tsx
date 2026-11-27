'use client';

import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  fetchHelpdeskTickets,
  createHelpdeskTicket,
  HelpdeskTicket,
} from '../../lib/api';
import { usePermissions } from '../../hooks/usePermissions';
import { Permissions } from '../../lib/permissions';
import { ServiceCatalogGrid, CatalogItem } from '../../components/portal/ServiceCatalogGrid';
import { ServiceRequestModal } from '../../components/portal/ServiceRequestModal';
import { PortalRequestDetailModal } from '../../components/portal/PortalRequestDetailModal';
import { MyRequestsList } from '../../components/portal/MyRequestsList';
import { Search, Sparkles, Inbox, Headset } from 'lucide-react';

export default function EmployeePortalPage() {
  const queryClient = useQueryClient();
  const { hasPermission, roleTier } = usePermissions();
  const isAgent = roleTier >= 3 || hasPermission(Permissions.TICKET_ASSIGN);

  const [selectedCatalogItem, setSelectedCatalogItem] = useState<CatalogItem | null>(null);
  const [selectedRequest, setSelectedRequest] = useState<HelpdeskTicket | null>(null);
  const [activeTab, setActiveTab] = useState<'CATALOG' | 'MY_REQUESTS' | 'AGENT_QUEUE'>('CATALOG');
  const [searchQuery, setSearchQuery] = useState('');
  const [queueStatusFilter, setQueueStatusFilter] = useState<string>('ALL');

  const { data: myTickets = [], isLoading: isLoadingMine } = useQuery<HelpdeskTicket[]>({
    queryKey: ['helpdeskTickets', 'mine'],
    queryFn: () => fetchHelpdeskTickets('mine'),
  });

  const { data: queueTickets = [], isLoading: isLoadingQueue } = useQuery<HelpdeskTicket[]>({
    queryKey: ['helpdeskTickets', 'all', queueStatusFilter],
    queryFn: () => fetchHelpdeskTickets('all', queueStatusFilter),
    enabled: isAgent,
  });

  const submitRequestMutation = useMutation({
    mutationFn: createHelpdeskTicket,
    onSuccess: (newTicket) => {
      queryClient.invalidateQueries({ queryKey: ['helpdeskTickets'] });
      setActiveTab('MY_REQUESTS');
      setSelectedRequest(newTicket);
    },
  });

  const filterList = (list: HelpdeskTicket[]) =>
    list.filter(
      (t) =>
        t.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        t.ticketKey.toLowerCase().includes(searchQuery.toLowerCase()) ||
        t.category.toLowerCase().includes(searchQuery.toLowerCase())
    );

  return (
    <div className="flex-1 flex flex-col min-w-0">
      {/* Header */}
      <div className="mb-6 flex flex-col gap-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h1 className="text-xl md:text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
              Helpdesk Portal
            </h1>
            <p className="text-xs md:text-sm text-slate-500 dark:text-slate-400 mt-1">
              Submit IT service requests, report incidents, and track support responses.
            </p>
          </div>
        </div>

        {/* Search & Tabs */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 p-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-2xs">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-slate-400" />
            <input
              type="text"
              placeholder="Search requests by key, title, or category..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-8 pr-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:border-blue-600"
            />
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            <button
              onClick={() => setActiveTab('CATALOG')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold transition cursor-pointer ${
                activeTab === 'CATALOG'
                  ? 'bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 shadow-2xs'
                  : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100'
              }`}
            >
              <Sparkles className="h-3.5 w-3.5" />
              <span>Catalog</span>
            </button>
            <button
              onClick={() => setActiveTab('MY_REQUESTS')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold transition cursor-pointer ${
                activeTab === 'MY_REQUESTS'
                  ? 'bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 shadow-2xs'
                  : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100'
              }`}
            >
              <Inbox className="h-3.5 w-3.5" />
              <span>My Requests ({myTickets.length})</span>
            </button>
            {isAgent && (
              <button
                onClick={() => setActiveTab('AGENT_QUEUE')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold transition cursor-pointer ${
                  activeTab === 'AGENT_QUEUE'
                    ? 'bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 shadow-2xs'
                    : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100'
                }`}
              >
                <Headset className="h-3.5 w-3.5" />
                <span>Agent Queue ({queueTickets.length})</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Tab Content */}
      <div className="flex flex-col gap-6">
        {activeTab === 'CATALOG' && (
          <div>
            <div className="mb-4">
              <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Service Catalog</h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Choose a service category below to submit a helpdesk ticket directly to IT support.
              </p>
            </div>
            <ServiceCatalogGrid onSelectItem={(item) => setSelectedCatalogItem(item)} />
          </div>
        )}

        {activeTab === 'MY_REQUESTS' && (
          <div>
            <div className="mb-4">
              <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">My Submitted Requests</h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Track progress, SLA timers, and replies from support agents.
              </p>
            </div>
            <MyRequestsList
              tickets={filterList(myTickets)}
              isLoading={isLoadingMine}
              onSelectTicket={(t) => setSelectedRequest(t)}
            />
          </div>
        )}

        {activeTab === 'AGENT_QUEUE' && isAgent && (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Support Agent Queue</h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Triage incoming helpdesk tickets, assign agents, and respond to employees.
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-1.5">
                {(['ALL', 'OPEN', 'IN_PROGRESS', 'WAITING_ON_USER', 'RESOLVED', 'CLOSED'] as const).map((st) => (
                  <button
                    key={st}
                    onClick={() => setQueueStatusFilter(st)}
                    className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold transition cursor-pointer ${
                      queueStatusFilter === st
                        ? 'bg-blue-600 text-white'
                        : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
                    }`}
                  >
                    {st === 'ALL' ? 'All' : st.replace(/_/g, ' ')}
                  </button>
                ))}
              </div>
            </div>

            <MyRequestsList
              tickets={filterList(queueTickets)}
              isLoading={isLoadingQueue}
              showRequester
              onSelectTicket={(t) => setSelectedRequest(t)}
            />
          </div>
        )}
      </div>

      {/* Submit Request Modal */}
      {selectedCatalogItem && (
        <ServiceRequestModal
          item={selectedCatalogItem}
          isOpen={!!selectedCatalogItem}
          onClose={() => setSelectedCatalogItem(null)}
          onSubmit={async (data) => {
            await submitRequestMutation.mutateAsync(data);
          }}
        />
      )}

      {/* Detail & Conversation Modal */}
      {selectedRequest && (
        <PortalRequestDetailModal
          ticket={selectedRequest}
          isAgent={isAgent}
          onClose={() => setSelectedRequest(null)}
          onTicketUpdated={(updated) => setSelectedRequest(updated)}
        />
      )}
    </div>
  );
}
