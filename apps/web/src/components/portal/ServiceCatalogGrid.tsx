'use client';

import React from 'react';
import { Laptop, KeyRound, AlertTriangle, HelpCircle, ArrowRight } from 'lucide-react';

export interface CatalogItem {
  id: string;
  category: string;
  title: string;
  description: string;
  icon: React.ElementType;
  ticketType: 'SERVICE_REQUEST' | 'INCIDENT';
  defaultPriority: 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';
  accentColor: string;
}

export const CATALOG_ITEMS: CatalogItem[] = [
  {
    id: 'hardware',
    category: 'Equipment',
    title: 'Hardware & Workstation',
    description: 'Request a new laptop, 4K monitor, mechanical keyboard, or dock replacement.',
    icon: Laptop,
    ticketType: 'SERVICE_REQUEST',
    defaultPriority: 'MEDIUM',
    accentColor: 'bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-800',
  },
  {
    id: 'access',
    category: 'Permissions',
    title: 'Software & Cloud Access',
    description: 'Request access to GitHub orgs, AWS consoles, Figma teams, VPN, or Jira.',
    icon: KeyRound,
    ticketType: 'SERVICE_REQUEST',
    defaultPriority: 'MEDIUM',
    accentColor: 'bg-purple-50 dark:bg-purple-950/60 text-purple-700 dark:text-purple-300 border-purple-200 dark:border-purple-800',
  },
  {
    id: 'incident',
    category: 'Report a Problem',
    title: 'IT Incident / System Down',
    description: 'Report broken WiFi, SSO login failure, VPN disconnection, or email issues.',
    icon: AlertTriangle,
    ticketType: 'INCIDENT',
    defaultPriority: 'HIGH',
    accentColor: 'bg-rose-50 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300 border-rose-200 dark:border-rose-800',
  },
  {
    id: 'general',
    category: 'General',
    title: 'Workplace & Administrative',
    description: 'Security badge renewals, ergonomic assessments, desk allocation, or general questions.',
    icon: HelpCircle,
    ticketType: 'SERVICE_REQUEST',
    defaultPriority: 'LOW',
    accentColor: 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800',
  },
];

interface ServiceCatalogGridProps {
  onSelectItem: (item: CatalogItem) => void;
}

export function ServiceCatalogGrid({ onSelectItem }: ServiceCatalogGridProps) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {CATALOG_ITEMS.map((item) => {
        const Icon = item.icon;
        return (
          <div
            key={item.id}
            onClick={() => onSelectItem(item)}
            className="group relative p-6 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:border-slate-300 dark:hover:border-slate-700 hover:shadow-2xs transition-all duration-150 cursor-pointer flex flex-col justify-between"
          >
            <div>
              <div className="flex items-center justify-between mb-4">
                <div className={`p-2.5 rounded-xl border ${item.accentColor}`}>
                  <Icon className="h-5 w-5" />
                </div>
                <span className="text-[10px] font-mono uppercase tracking-wider text-slate-400 dark:text-slate-500">
                  {item.category}
                </span>
              </div>

              <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100 group-hover:text-blue-600 dark:group-hover:text-blue-400 transition mb-1.5">
                {item.title}
              </h3>
              <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                {item.description}
              </p>
            </div>

            <div className="mt-6 pt-4 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-xs font-semibold text-slate-700 dark:text-slate-300 group-hover:text-blue-600 dark:group-hover:text-blue-400">
              <span>Submit request</span>
              <ArrowRight className="h-4 w-4 transform group-hover:translate-x-1 transition-transform" />
            </div>
          </div>
        );
      })}
    </div>
  );
}
