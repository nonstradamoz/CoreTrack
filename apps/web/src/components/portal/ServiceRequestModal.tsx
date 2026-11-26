'use client';

import React, { useState } from 'react';
import { X, Send, AlertCircle, ShieldCheck } from 'lucide-react';
import { CatalogItem } from './ServiceCatalogGrid';
import { HelpdeskTicket } from '../../lib/api';

interface ServiceRequestModalProps {
  item: CatalogItem | null;
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: {
    category: string;
    requestType: 'SERVICE_REQUEST' | 'INCIDENT';
    title: string;
    description: string;
    department: string;
    priority: HelpdeskTicket['priority'];
  }) => Promise<void>;
}

export function ServiceRequestModal({
  item,
  isOpen,
  onClose,
  onSubmit,
}: ServiceRequestModalProps) {
  const [title, setTitle] = useState('');
  const [details, setDetails] = useState('');
  const [priority, setPriority] = useState<HelpdeskTicket['priority']>('MEDIUM');
  const [department, setDepartment] = useState('Engineering');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  React.useEffect(() => {
    if (item) {
      setPriority(item.defaultPriority);
      setTitle('');
      setDetails('');
      setError(null);
    }
  }, [item]);

  if (!isOpen || !item) return null;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!item) return;
    if (!title.trim()) {
      setError('Please provide a brief summary of your request.');
      return;
    }

    try {
      setIsSubmitting(true);
      setError(null);

      await onSubmit({
        category: item.title,
        requestType: item.ticketType === 'INCIDENT' ? 'INCIDENT' : 'SERVICE_REQUEST',
        title: title.trim(),
        description: details.trim() || 'No additional details provided.',
        department,
        priority,
      });

      onClose();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to submit request');
    } finally {
      setIsSubmitting(false);
    }
  }

  const Icon = item.icon;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 dark:bg-black/60 backdrop-blur-xs">
      <div className="relative w-full max-w-xl rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-2xl p-6 transition-colors">
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-slate-100 dark:border-slate-800">
          <div className="flex items-center gap-3">
            <div className={`p-2 rounded-xl border ${item.accentColor}`}>
              <Icon className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">{item.title}</h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">Employee Service Request</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {error && (
          <div className="mt-4 p-3 rounded-lg bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 text-rose-800 dark:text-rose-200 text-xs flex items-center gap-2">
            <AlertCircle className="h-4 w-4 shrink-0 text-rose-600" />
            <span>{error}</span>
          </div>
        )}

        {/* Guided Form */}
        <form onSubmit={handleSubmit} className="mt-4 space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
              Summary of Request <span className="text-rose-600">*</span>
            </label>
            <input
              type="text"
              required
              autoFocus
              placeholder={
                item.ticketType === 'INCIDENT'
                  ? 'e.g. Cannot connect to corporate VPN after password reset'
                  : 'e.g. 32-inch 4K External Monitor for home office'
              }
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full px-3.5 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:border-blue-600 focus:ring-1 focus:ring-blue-600 transition"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">Department</label>
              <select
                value={department}
                onChange={(e) => setDepartment(e.target.value)}
                className="w-full px-2.5 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-medium text-slate-900 dark:text-slate-100 focus:outline-none focus:border-blue-600"
              >
                <option value="Engineering">Engineering</option>
                <option value="Product & Design">Product & Design</option>
                <option value="Sales & Marketing">Sales & Marketing</option>
                <option value="Operations & HR">Operations & HR</option>
                <option value="Finance & Legal">Finance & Legal</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">Urgency / Impact</label>
              <select
                value={priority}
                onChange={(e) => setPriority(e.target.value as HelpdeskTicket['priority'])}
                className="w-full px-2.5 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-medium text-slate-900 dark:text-slate-100 focus:outline-none focus:border-blue-600"
              >
                <option value="LOW">Low (Can wait several days)</option>
                <option value="MEDIUM">Medium (Affects daily work)</option>
                <option value="HIGH">High (Work is currently blocked)</option>
                <option value="URGENT">Urgent (Critical production outage)</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
              Details & Business Justification
            </label>
            <textarea
              rows={4}
              placeholder="Provide serial numbers, model preferences, links, or error messages..."
              value={details}
              onChange={(e) => setDetails(e.target.value)}
              className="w-full px-3.5 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:border-blue-600 focus:ring-1 focus:ring-blue-600 transition"
            />
          </div>

          <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 text-[11px] flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 shrink-0 text-slate-500" />
            <span>
              Your request will be routed directly to IT with an automated SLA countdown clock.
            </span>
          </div>

          {/* Footer Actions */}
          <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-slate-100 dark:border-slate-800">
            <button
              type="button"
              onClick={onClose}
              className="px-3.5 py-2 rounded-lg text-xs font-medium text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-4 py-2 rounded-lg text-xs font-semibold bg-blue-600 hover:bg-blue-700 text-white shadow-2xs disabled:opacity-50 transition flex items-center gap-1.5"
            >
              <Send className="h-3.5 w-3.5" />
              <span>{isSubmitting ? 'Submitting...' : 'Submit Request'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
