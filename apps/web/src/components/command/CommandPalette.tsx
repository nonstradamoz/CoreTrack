'use client';

import React, { useEffect } from 'react';
import { Command } from 'cmdk';
import { Ticket, Project } from '../../lib/api';
import {
  Search,
  Plus,
  Layers,
  Sparkles,
} from 'lucide-react';

interface CommandPaletteProps {
  isOpen: boolean;
  setIsOpen: (open: boolean) => void;
  tickets: Ticket[];
  projects: Project[];
  activeProjectKey: string;
  onSelectTicket: (ticket: Ticket) => void;
  onCreateTicket: () => void;
  onSelectProject: (key: string) => void;
}

export function CommandPalette({
  isOpen,
  setIsOpen,
  tickets,
  projects,
  activeProjectKey,
  onSelectTicket,
  onCreateTicket,
  onSelectProject,
}: CommandPaletteProps) {
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null;
      const isInput =
        target?.tagName === 'INPUT' ||
        target?.tagName === 'TEXTAREA' ||
        target?.tagName === 'SELECT' ||
        target?.isContentEditable;

      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setIsOpen(!isOpen);
      } else if (!isInput && e.key === 'c' && !e.metaKey && !e.ctrlKey) {
        e.preventDefault();
        onCreateTicket();
      } else if (e.key === 'Escape' && isOpen) {
        setIsOpen(false);
      }
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, setIsOpen, onCreateTicket]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-24 p-4 bg-slate-900/40 dark:bg-black/60 backdrop-blur-xs">
      <div
        className="relative w-full max-w-2xl rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-2xl overflow-hidden transition-colors"
        onClick={(e) => e.stopPropagation()}
      >
        <Command label="Global Command Palette" className="w-full flex flex-col">
          {/* Top Search Input */}
          <div className="flex items-center gap-3 px-4 py-3 border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/40">
            <Search className="h-4 w-4 text-slate-400 shrink-0" />
            <Command.Input
              autoFocus
              placeholder="Search tasks, projects, or type 'c' to create..."
              className="w-full bg-transparent text-sm text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:outline-none"
            />
            <kbd className="px-1.5 py-0.5 rounded bg-white dark:bg-slate-800 text-[10px] font-mono text-slate-500 dark:text-slate-400 border border-slate-200 dark:border-slate-700 shadow-2xs">
              ESC
            </kbd>
          </div>

          {/* List of Results */}
          <Command.List className="max-h-80 overflow-y-auto p-2 space-y-1 text-xs">
            <Command.Empty className="p-6 text-center text-slate-400 text-xs">
              No matching tasks or commands found.
            </Command.Empty>

            {/* Quick Actions Group */}
            <Command.Group heading="Quick Actions" className="px-2 py-1 text-[10px] font-semibold text-slate-400 uppercase tracking-wider">
              <Command.Item
                onSelect={() => {
                  setIsOpen(false);
                  onCreateTicket();
                }}
                className="flex items-center justify-between px-3 py-2 rounded-xl cursor-pointer text-slate-700 dark:text-slate-300 aria-selected:bg-slate-100 dark:aria-selected:bg-slate-800 aria-selected:text-slate-900 dark:aria-selected:text-slate-100 transition"
              >
                <div className="flex items-center gap-2.5">
                  <div className="p-1 rounded bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
                    <Plus className="h-3.5 w-3.5" />
                  </div>
                  <span className="font-medium">Create new Task</span>
                </div>
                <kbd className="px-1.5 py-0.5 rounded bg-white dark:bg-slate-800 text-[10px] font-mono text-slate-500 border border-slate-200 dark:border-slate-700">
                  C
                </kbd>
              </Command.Item>
            </Command.Group>

            {/* Tasks Group */}
            {tickets.length > 0 && (
              <Command.Group heading="Tasks" className="px-2 py-1 text-[10px] font-semibold text-slate-400 uppercase tracking-wider">
                {tickets.map((ticket) => (
                  <Command.Item
                    key={ticket.id}
                    value={`${ticket.ticketKey} ${ticket.title}`}
                    onSelect={() => {
                      setIsOpen(false);
                      onSelectTicket(ticket);
                    }}
                    className="flex items-center justify-between px-3 py-2 rounded-xl cursor-pointer text-slate-700 dark:text-slate-300 aria-selected:bg-slate-100 dark:aria-selected:bg-slate-800 aria-selected:text-slate-900 dark:aria-selected:text-slate-100 transition group"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <span className="font-mono text-xs font-semibold text-slate-500 dark:text-slate-400 group-aria-selected:text-slate-900 dark:group-aria-selected:text-slate-100 shrink-0">
                        {ticket.ticketKey}
                      </span>
                      <span className="truncate text-xs font-medium text-slate-800 dark:text-slate-200 group-aria-selected:text-slate-900 dark:group-aria-selected:text-slate-100">
                        {ticket.title}
                      </span>
                    </div>

                    <div className="flex items-center gap-2 shrink-0 ml-3">
                      <span className="px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-[10px] font-mono text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-slate-700">
                        {ticket.status}
                      </span>
                      <span
                        className={`px-1.5 py-0.5 rounded text-[10px] font-medium border ${ticket.priority === 'URGENT'
                            ? 'bg-rose-50 dark:bg-rose-950 text-rose-800 dark:text-rose-300 border-rose-200 dark:border-rose-900'
                            : ticket.priority === 'HIGH'
                              ? 'bg-amber-50 dark:bg-amber-950 text-amber-800 dark:text-amber-300 border-amber-200 dark:border-amber-900'
                              : 'bg-blue-50 dark:bg-blue-950 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-900'
                          }`}
                      >
                        {ticket.priority}
                      </span>
                    </div>
                  </Command.Item>
                ))}
              </Command.Group>
            )}

            {/* Projects Switcher Group */}
            {projects.length > 0 && (
              <Command.Group heading="Switch Project" className="px-2 py-1 text-[10px] font-semibold text-slate-400 uppercase tracking-wider">
                {projects.map((proj) => (
                  <Command.Item
                    key={proj.id}
                    value={`project ${proj.key} ${proj.name}`}
                    onSelect={() => {
                      setIsOpen(false);
                      onSelectProject(proj.key);
                    }}
                    className="flex items-center justify-between px-3 py-2 rounded-xl cursor-pointer text-slate-700 dark:text-slate-300 aria-selected:bg-slate-100 dark:aria-selected:bg-slate-800 aria-selected:text-slate-900 dark:aria-selected:text-slate-100 transition"
                  >
                    <div className="flex items-center gap-2.5">
                      <Layers className="h-3.5 w-3.5 text-slate-500" />
                      <span className="font-medium">{proj.name}</span>
                      <span className="font-mono text-[11px] text-slate-400">({proj.key})</span>
                    </div>
                    {proj.key === activeProjectKey && (
                      <span className="text-[10px] text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950 px-1.5 py-0.5 rounded border border-emerald-200 dark:border-emerald-800 font-medium">
                        Active
                      </span>
                    )}
                  </Command.Item>
                ))}
              </Command.Group>
            )}
          </Command.List>

          {/* Bottom Shortcuts Bar */}
          <div className="flex items-center justify-between px-4 py-2 border-t border-slate-100 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/50 text-[11px] text-slate-400 font-mono">
            <div className="flex items-center gap-3">
              <span>↑↓ Navigate</span>
              <span>↵ Select</span>
              <span>ESC Close</span>
            </div>
            <div className="flex items-center gap-1.5 text-slate-500 dark:text-slate-400">
              <Sparkles className="h-3 w-3" />
              <span>CoreTrack</span>
            </div>
          </div>
        </Command>
      </div>
    </div>
  );
}
