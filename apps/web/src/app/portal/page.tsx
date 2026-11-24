'use client';

import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { fetchProjects, fetchTickets, createTicket, Project, Ticket } from '../../lib/api';
import { ServiceCatalogGrid, CatalogItem, CATALOG_ITEMS } from '../../components/portal/ServiceCatalogGrid';
import { ServiceRequestModal } from '../../components/portal/ServiceRequestModal';
import { PortalRequestDetailModal } from '../../components/portal/PortalRequestDetailModal';
import { MyRequestsList } from '../../components/portal/MyRequestsList';
import {
  Search,
  Sparkles,
  Inbox,
  Plus,
} from 'lucide-react';

export default function EmployeePortalPage() {
  const queryClient = useQueryClient();
  const [selectedCatalogItem, setSelectedCatalogItem] = useState<CatalogItem | null>(null);
  const [selectedRequest, setSelectedRequest] = useState<Ticket | null>(null);
  const [activeTab, setActiveTab] = useState<'CATALOG' | 'MY_REQUESTS'>('CATALOG');
  const [searchQuery, setSearchQuery] = useState('');

  // 1. Fetch Projects to locate the Service Desk project ('HD')
  const { data: projects = [] } = useQuery({
    queryKey: ['projects'],
    queryFn: fetchProjects,
  });

  const serviceDeskProject: Project | undefined =
    projects.find((p) => p.projectType === 'SERVICE_DESK' || p.key === 'HD') || projects[0];

  // 2. Fetch Tickets for the Helpdesk
  const { data: helpdeskTickets = [], isLoading: isLoadingTickets } = useQuery({
    queryKey: ['tickets', serviceDeskProject?.key || 'HD'],
    queryFn: () => fetchTickets(serviceDeskProject?.key || 'HD'),
    enabled: !!serviceDeskProject,
  });

  // 3. Create Service Request Mutation
  const submitRequestMutation = useMutation({
    mutationFn: createTicket,
    onSuccess: (newTicket) => {
      queryClient.invalidateQueries({ queryKey: ['tickets', serviceDeskProject?.key || 'HD'] });
      setActiveTab('MY_REQUESTS');
      setSelectedRequest(newTicket);
    },
  });

  // Filter requests if search query is entered
  const filteredTickets = helpdeskTickets.filter((t) =>
    t.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
    t.ticketKey.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="flex-1 flex flex-col min-w-0">
      {/* Standard Page Header */}
      <div className="mb-6 flex flex-col gap-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h1 className="text-xl md:text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
              Helpdesk
            </h1>
            <p className="text-xs md:text-sm text-slate-500 dark:text-slate-400 mt-1">
              Service catalog and support ticket tracking.
            </p>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={() => setSelectedCatalogItem(CATALOG_ITEMS[0])}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold shadow-2xs transition active:scale-[0.98] cursor-pointer"
            >
              <Plus className="h-3.5 w-3.5" />
              <span>New Request</span>
            </button>
          </div>
        </div>

        {/* Search & Tab Switcher Bar */}
        <div className="pt-2">
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 p-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-2xs">
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-slate-400" />
              <input
                type="text"
                placeholder="Search requests..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-8 pr-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:border-blue-600 focus:bg-white dark:focus:bg-slate-900 transition"
              />
            </div>

            <div className="flex items-center gap-1.5">
              <button
                onClick={() => setActiveTab('CATALOG')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold transition ${
                  activeTab === 'CATALOG'
                    ? 'bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 shadow-2xs'
                    : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-200 dark:hover:bg-slate-700'
                }`}
              >
                <Sparkles className="h-3.5 w-3.5" />
                <span>Catalog</span>
              </button>
              <button
                onClick={() => setActiveTab('MY_REQUESTS')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold transition ${
                  activeTab === 'MY_REQUESTS'
                    ? 'bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 shadow-2xs'
                    : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-200 dark:hover:bg-slate-700'
                }`}
              >
                <Inbox className="h-3.5 w-3.5" />
                <span>My Requests ({helpdeskTickets.length})</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-6">
        {/* Tab 1: Service Catalog */}
        {activeTab === 'CATALOG' && (
          <div>
            <div className="mb-4">
              <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Available Services & Catalog</h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Choose a request category below to initiate an automated ticket routed to the IT team.
              </p>
            </div>
            <ServiceCatalogGrid onSelectItem={(item) => setSelectedCatalogItem(item)} />
          </div>
        )}

        {/* Tab 2: My Requests */}
        {activeTab === 'MY_REQUESTS' && (
          <div>
            <div className="mb-4">
              <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Your Submitted Requests</h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Track real-time progress, SLA countdown timers, and messages from IT support engineers.
              </p>
            </div>
            <MyRequestsList
              tickets={filteredTickets}
              isLoading={isLoadingTickets}
              onSelectTicket={(ticket) => setSelectedRequest(ticket)}
            />
          </div>
        )}
      </div>

      {/* Guided Service Request Modal */}
      {selectedCatalogItem && serviceDeskProject && (
        <ServiceRequestModal
          item={selectedCatalogItem}
          projectId={serviceDeskProject.id}
          isOpen={!!selectedCatalogItem}
          onClose={() => setSelectedCatalogItem(null)}
          onSubmit={async (data) => {
            await submitRequestMutation.mutateAsync(data);
          }}
        />
      )}

      {/* Request Detail & Conversation Modal */}
      {selectedRequest && (
        <PortalRequestDetailModal
          ticket={selectedRequest}
          onClose={() => setSelectedRequest(null)}
        />
      )}
    </div>
  );
}
