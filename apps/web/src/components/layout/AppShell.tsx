'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useProject } from '../../context/ProjectContext';
import { fetchTickets, fetchCurrentUser, createTicket, Ticket } from '../../lib/api';
import { UserProfileMenu } from '../auth/UserProfileMenu';
import { NotificationsPopover } from '../notifications/NotificationsPopover';
import { Logo } from '../brand/Logo';
import { useProjectWebSocket } from '../../hooks/useProjectWebSocket';
import { useTheme } from '../theme/ThemeProvider';
import { CommandPalette } from '../command/CommandPalette';
import { CreateTicketModal } from '../kanban/CreateTicketModal';
import { CreateProjectModal } from '../projects/CreateProjectModal';
import { TicketDetailModal } from '../kanban/TicketDetailModal';
import { DailyStatusDrawer } from '../standup/DailyStatusDrawer';
import { ContextualRightPanel } from './ContextualRightPanel';
import { useModuleAccess } from '../../hooks/useModuleAccess';
import { usePermissions } from '../../hooks/usePermissions';
import { Permissions } from '../../lib/permissions';
import {
  LayoutDashboard,
  LayoutGrid,
  Layers,
  LifeBuoy,
  Search,
  Plus,
  Radio,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  Building2,
  FolderGit2,
  ExternalLink,
  Menu,
  X,
  Sun,
  Moon,
  CalendarRange,
  Table2,
  BarChart3,
  Zap,
  CalendarCheck2,
  Shield,
  PanelRight,
  MessageSquare,
  Users,
  UserPlus,
  Calendar,
  Settings,
  Mail,
} from 'lucide-react';

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  if (pathname === '/login') {
    return <>{children}</>;
  }

  const queryClient = useQueryClient();
  const { projects, selectedProjectKey, setSelectedProjectKey, activeProject } = useProject();
  const { theme, toggleTheme } = useTheme();
  const { hasPermission, isOrgAdmin, roleTier } = usePermissions();
  const { canAccess, canAccessSettings, canAccessMail } = useModuleAccess();
  const canManageMembers = hasPermission(Permissions.MEMBER_MANAGE);
  const canCreateProject = isOrgAdmin || (roleTier >= 3 && hasPermission(Permissions.PROJECT_CREATE));

  const [isCollapsed, setIsCollapsed] = useState(false);
  const [isRightPanelOpen, setIsRightPanelOpen] = useState(true);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isCommandPaletteOpen, setIsCommandPaletteOpen] = useState(false);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isCreateProjectModalOpen, setIsCreateProjectModalOpen] = useState(false);
  const [isDailyStatusDrawerOpen, setIsDailyStatusDrawerOpen] = useState(false);
  const [selectedTicket, setSelectedTicket] = useState<Ticket | null>(null);

  // Live Digital Clock state matching reference: "20:12:44", "Wednesday, 11 May"
  const [timeString, setTimeString] = useState('');
  const [dateString, setDateString] = useState('');

  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      setTimeString(now.toLocaleTimeString('en-GB', { hour12: false }));
      setDateString(
        now.toLocaleDateString('en-US', {
          weekday: 'long',
          day: 'numeric',
          month: 'short',
        })
      );
    };
    updateTime();
    const interval = setInterval(updateTime, 1000);
    return () => clearInterval(interval);
  }, []);

  const { data: currentUser } = useQuery({
    queryKey: ['currentUser'],
    queryFn: fetchCurrentUser,
  });

  const initials = currentUser?.fullName
    ? currentUser.fullName
      .split(' ')
      .map((n) => n[0])
      .join('')
      .toUpperCase()
    : 'U';

  // Active navigation derived from current URL
  const activeNav = pathname.startsWith('/dashboard')
    ? 'DASHBOARD'
    : pathname.startsWith('/projects')
      ? 'PROJECTS'
      : pathname.startsWith('/teams')
        ? 'TEAMS'
        : pathname.startsWith('/backlog')
          ? 'BACKLOG'
          : pathname.startsWith('/timeline')
            ? 'TIMELINE'
            : pathname.startsWith('/table')
              ? 'TABLE'
              : pathname.startsWith('/reports')
                ? 'REPORTS'
                : pathname.startsWith('/automation')
                  ? 'AUTOMATION'
                  : pathname.startsWith('/mail')
                    ? 'MAIL'
                    : pathname.startsWith('/settings/users')
                      ? 'USERS'
                      : pathname.startsWith('/settings/roles')
                        ? 'ROLES'
                    : pathname.startsWith('/portal')
                      ? 'PORTAL'
                      : pathname === '/'
                        ? 'BOARD'
                        : '';

  // Persist sidebar collapsed & right panel preferences
  useEffect(() => {
    try {
      const savedCollapsed = localStorage.getItem('coretrack_sidebar_collapsed');
      if (savedCollapsed !== null) {
        setIsCollapsed(savedCollapsed === 'true');
      }
      const savedRightPanel = localStorage.getItem('coretrack_right_panel_open');
      if (savedRightPanel !== null) {
        setIsRightPanelOpen(savedRightPanel === 'true');
      }
    } catch {
      // ignore
    }
  }, []);

  const handleToggleCollapse = () => {
    setIsCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem('coretrack_sidebar_collapsed', String(next));
      } catch {
        // ignore
      }
      return next;
    });
  };

  const handleToggleRightPanel = () => {
    setIsRightPanelOpen((prev) => {
      const next = !prev;
      try {
        localStorage.setItem('coretrack_right_panel_open', String(next));
      } catch {
        // ignore
      }
      return next;
    });
  };

  const { isConnected } = useProjectWebSocket(activeProject?.key || 'CORE');

  // Fetch tickets for command palette search
  const { data: tickets = [] } = useQuery({
    queryKey: ['tickets', activeProject?.key || 'CORE'],
    queryFn: () => fetchTickets(activeProject?.key || 'CORE'),
    enabled: !!activeProject,
  });

  const createTicketMutation = useMutation({
    mutationFn: createTicket,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tickets'] });
      setIsCreateModalOpen(false);
    },
  });

  // Global Keyboard Shortcuts (Cmd+K and C)
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
        setIsCommandPaletteOpen(true);
      } else if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'd') {
        e.preventDefault();
        setIsDailyStatusDrawerOpen((prev) => !prev);
      } else if (!isInput && e.key === 'c' && !e.metaKey && !e.ctrlKey) {
        e.preventDefault();
        setIsCreateModalOpen(true);
      }
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-[#F5F6F8] dark:bg-[#111318] text-[#17191F] dark:text-[#F3F4F6] font-sans transition-colors duration-150">
      {/* 1. COLLAPSIBLE PRIMARY SIDEBAR (Matching Reference Visual Design) */}
      <aside
        className={`hidden md:flex flex-col border-r border-slate-200/80 dark:border-slate-800/80 bg-white dark:bg-slate-900 transition-all duration-200 select-none z-30 shrink-0 ${isCollapsed ? 'w-[72px]' : 'w-64'
          }`}
      >
        {/* Top Header: User Profile Greeting Card matching Reference ("Jack Martines", "Morning, Jack") */}
        <div className="h-16 flex items-center justify-between px-4 border-b border-slate-100 dark:border-slate-800/80">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="h-9 w-9 rounded-full bg-blue-600 text-white font-bold text-xs flex items-center justify-center shrink-0 shadow-2xs">
              {initials}
            </div>
            {!isCollapsed && (
              <div className="min-w-0 flex-1">
                <span className="block text-xs font-bold text-slate-900 dark:text-slate-100 truncate leading-snug">
                  {currentUser?.fullName || 'Active User'}
                </span>
                <span className="block text-[11px] text-slate-400 dark:text-slate-500 truncate leading-none">
                  Hello, {currentUser?.fullName?.split(' ')[0] || 'Member'}
                </span>
              </div>
            )}
          </div>

          <button
            onClick={handleToggleCollapse}
            title={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            className="p-1 rounded-md text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
          >
            {isCollapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
          </button>
        </div>

        {/* Primary Navigation Groups */}
        <nav className="flex-1 p-3 space-y-4 overflow-y-auto">
          {/* SECTION: MENU */}
          <div>
            {!isCollapsed && (
              <div className="px-2 pb-1.5 text-[11px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                Menu
              </div>
            )}
            <div className="space-y-1">
              {/* Dashboard — all roles */}
              {canAccess('dashboard') && (
                <Link
                  href="/dashboard"
                  title="Dashboard"
                  className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-semibold transition ${activeNav === 'DASHBOARD'
                    ? 'bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 shadow-2xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800'
                    }`}
                >
                  <LayoutDashboard className={`h-4 w-4 shrink-0 ${activeNav === 'DASHBOARD' ? 'text-blue-600 dark:text-blue-400' : 'text-slate-400'}`} />
                  {!isCollapsed && <span>Dashboard</span>}
                </Link>
              )}

              {/* Projects Management Module */}
              <Link
                href="/projects"
                title="Projects"
                className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-semibold transition ${activeNav === 'PROJECTS'
                  ? 'bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 shadow-2xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800'
                  }`}
              >
                <FolderGit2 className={`h-4 w-4 shrink-0 ${activeNav === 'PROJECTS' ? 'text-blue-600 dark:text-blue-400' : 'text-slate-400'}`} />
                {!isCollapsed && <span>Projects</span>}
              </Link>

              {/* Boards — all with PROJECT_VIEW */}
              {canAccess('board') && (
                <Link
                  href="/"
                  title="Kanban Board"
                  className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-semibold transition ${activeNav === 'BOARD'
                    ? 'bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 shadow-2xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800'
                    }`}
                >
                  <LayoutGrid className={`h-4 w-4 shrink-0 ${activeNav === 'BOARD' ? 'text-blue-600 dark:text-blue-400' : 'text-slate-400'}`} />
                  {!isCollapsed && <span>Boards</span>}
                </Link>
              )}

              {/* Teams Management */}
              <Link
                href="/teams"
                title="Teams"
                className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-semibold transition ${activeNav === 'TEAMS'
                  ? 'bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 shadow-2xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800'
                  }`}
              >
                <Users className={`h-4 w-4 shrink-0 ${activeNav === 'TEAMS' ? 'text-blue-600 dark:text-blue-400' : 'text-slate-400'}`} />
                {!isCollapsed && <span>Teams</span>}
              </Link>

              {/* Today's Task standup — all roles */}
              <button
                type="button"
                onClick={() => setIsDailyStatusDrawerOpen(true)}
                title="Today's Task & Standup"
                className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-semibold text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800 transition w-full text-left cursor-pointer"
              >
                <CalendarCheck2 className="h-4 w-4 shrink-0 text-slate-400" />
                {!isCollapsed && <span>Today&apos;s Task</span>}
              </button>

              {/* All Tasks (Table) — Team Lead+ (requires TICKET_BATCH_EDIT) */}
              {canAccess('table') && (
                <Link
                  href="/table"
                  title="All Tasks Spreadsheet"
                  className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-semibold transition ${activeNav === 'TABLE'
                    ? 'bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 shadow-2xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800'
                    }`}
                >
                  <Table2 className={`h-4 w-4 shrink-0 ${activeNav === 'TABLE' ? 'text-blue-600 dark:text-blue-400' : 'text-slate-400'}`} />
                  {!isCollapsed && <span>All Tasks</span>}
                </Link>
              )}

              {/* Calendar / Timeline — Team Lead+ (requires SPRINT_MANAGE) */}
              {canAccess('timeline') && (
                <Link
                  href="/timeline"
                  title="Calendar & Timeline Schedule"
                  className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-semibold transition ${activeNav === 'TIMELINE'
                    ? 'bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 shadow-2xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800'
                    }`}
                >
                  <Calendar className={`h-4 w-4 shrink-0 ${activeNav === 'TIMELINE' ? 'text-blue-600 dark:text-blue-400' : 'text-slate-400'}`} />
                  {!isCollapsed && <span>Calender</span>}
                </Link>
              )}

              {/* Backlog — Team Lead+ (requires SPRINT_MANAGE) */}
              {canAccess('backlog') && (
                <Link
                  href="/backlog"
                  title="Sprint Backlog"
                  className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-semibold transition ${activeNav === 'BACKLOG'
                    ? 'bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 shadow-2xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800'
                    }`}
                >
                  <Layers className={`h-4 w-4 shrink-0 ${activeNav === 'BACKLOG' ? 'text-blue-600 dark:text-blue-400' : 'text-slate-400'}`} />
                  {!isCollapsed && <span>Backlog</span>}
                </Link>
              )}

              {/* Reports — Team Lead+ view (PROJECT_VIEW), Manager+ full */}
              {canAccess('reports') && (
                <Link
                  href="/reports"
                  title="Agile Reports"
                  className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-semibold transition ${activeNav === 'REPORTS'
                    ? 'bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 shadow-2xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800'
                    }`}
                >
                  <BarChart3 className={`h-4 w-4 shrink-0 ${activeNav === 'REPORTS' ? 'text-blue-600 dark:text-blue-400' : 'text-slate-400'}`} />
                  {!isCollapsed && <span>Reports</span>}
                </Link>
              )}

              {/* Automation & SLA Engine — Manager+ / Admin (requires AUTOMATION_MANAGE) */}
              {canAccess('automation') && (
                <Link
                  href="/automation"
                  title="Automation & SLA Engine"
                  className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-semibold transition ${activeNav === 'AUTOMATION'
                    ? 'bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 shadow-2xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800'
                    }`}
                >
                  <Zap className={`h-4 w-4 shrink-0 ${activeNav === 'AUTOMATION' ? 'text-blue-600 dark:text-blue-400' : 'text-slate-400'}`} />
                  {!isCollapsed && <span>Automation</span>}
                </Link>
              )}

              {/* Mailing Center — Super Admins, Admins, Project Managers */}
              {canAccessMail() && (
                <Link
                  href="/mail"
                  title="Mailing Center"
                  className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-semibold transition ${activeNav === 'MAIL'
                    ? 'bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 shadow-2xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800'
                    }`}
                >
                  <Mail className={`h-4 w-4 shrink-0 ${activeNav === 'MAIL' ? 'text-blue-600 dark:text-blue-400' : 'text-slate-400'}`} />
                  {!isCollapsed && <span>Mailing</span>}
                </Link>
              )}
            </div>
          </div>

          {/* SECTION: TEAMS with avatar stacks matching Reference */}
          <div>
            {!isCollapsed && (
              <div className="flex items-center justify-between px-2 pb-1.5 text-[11px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                <span>Projects</span>
                {canCreateProject && (
                  <button
                    onClick={() => setIsCreateProjectModalOpen(true)}
                    title="New Project"
                    className="p-0.5 rounded-md hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 hover:text-blue-600 transition cursor-pointer"
                  >
                    <Plus className="h-3 w-3" />
                  </button>
                )}
              </div>
            )}
            <div className="space-y-1.5">
              {projects.slice(0, 3).map((p) => {
                const isActive = p.key === selectedProjectKey;
                return (
                  <button
                    key={p.id}
                    onClick={() => setSelectedProjectKey(p.key)}
                    className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-medium transition cursor-pointer text-left ${isActive
                      ? 'bg-slate-100 dark:bg-slate-800/80 text-slate-900 dark:text-slate-100 font-semibold'
                      : 'text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800/50'
                      }`}
                  >
                    <span className="truncate">{p.name}</span>
                    {!isCollapsed && (
                      <div className="flex items-center -space-x-1.5 shrink-0 ml-1">
                        <div className="h-4 w-4 rounded-full bg-blue-500 text-[8px] font-bold text-white flex items-center justify-center border border-white dark:border-slate-900">
                          {p.key.charAt(0)}
                        </div>
                        <div className="h-4 w-4 rounded-full bg-slate-700 text-[8px] font-bold text-white flex items-center justify-center border border-white dark:border-slate-900">
                          +
                        </div>
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* SECTION: GENERAL / SETTING — Super Admin only */}
          {canAccessSettings() && (
            <div>
              {!isCollapsed && (
                <div className="px-2 pb-1.5 text-[11px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                  General
                </div>
              )}
              <div className="space-y-1">
                <Link
                  href="/settings/users"
                  title="User Management & Provisioning"
                  className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-semibold transition ${activeNav === 'USERS'
                    ? 'bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 shadow-2xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800'
                    }`}
                >
                  <UserPlus className={`h-4 w-4 shrink-0 ${activeNav === 'USERS' ? 'text-blue-600 dark:text-blue-400' : 'text-slate-400'}`} />
                  {!isCollapsed && <span>Users</span>}
                </Link>

                <Link
                  href="/settings/roles"
                  title="Settings & Roles"
                  className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-semibold transition ${activeNav === 'ROLES'
                    ? 'bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 shadow-2xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800'
                    }`}
                >
                  <Settings className={`h-4 w-4 shrink-0 ${activeNav === 'ROLES' ? 'text-blue-600 dark:text-blue-400' : 'text-slate-400'}`} />
                  {!isCollapsed && <span>Setting</span>}
                </Link>
              </div>
            </div>
          )}
        </nav>

        {/* Sidebar Footer: Pill Theme Switcher matching Reference (Dark | Light) */}
        <div className="p-3 border-t border-slate-100 dark:border-slate-800/80 bg-slate-50/50 dark:bg-slate-900/40">
          {!isCollapsed ? (
            <div className="flex items-center justify-center p-1 rounded-full bg-slate-200/80 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 shadow-2xs">
              <button
                onClick={() => {
                  if (theme !== 'dark') toggleTheme();
                }}
                className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 px-3 rounded-full text-xs font-semibold transition ${theme === 'dark'
                  ? 'bg-slate-900 text-white shadow-2xs'
                  : 'text-slate-500 hover:text-slate-900'
                  }`}
              >
                <Moon className="h-3.5 w-3.5" />
                <span>Dark</span>
              </button>
              <button
                onClick={() => {
                  if (theme !== 'light') toggleTheme();
                }}
                className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 px-3 rounded-full text-xs font-semibold transition ${theme === 'light'
                  ? 'bg-white text-slate-900 shadow-2xs'
                  : 'text-slate-400 hover:text-slate-100'
                  }`}
              >
                <Sun className="h-3.5 w-3.5 text-amber-500" />
                <span>Light</span>
              </button>
            </div>
          ) : (
            <button
              onClick={toggleTheme}
              title={`Switch to ${theme === 'light' ? 'dark' : 'light'} mode`}
              className="w-full flex items-center justify-center p-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:text-blue-600 transition"
            >
              {theme === 'dark' ? <Sun className="h-4 w-4 text-amber-400" /> : <Moon className="h-4 w-4 text-slate-700" />}
            </button>
          )}
        </div>
      </aside>

      {/* 2. MAIN APPLICATION CONTENT REGION */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* TOP NAVIGATION BAR: Pill Search + Digital Clock + Controls */}
        <header className="h-16 border-b border-slate-200/80 dark:border-slate-800/80 bg-white dark:bg-slate-900 px-4 md:px-6 flex items-center justify-between shrink-0 z-20 transition-colors">
          {/* Left: Mobile Toggle & Context */}
          <div className="flex items-center gap-3">
            <button
              onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
              className="md:hidden p-1.5 rounded-lg text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
            >
              <Menu className="h-5 w-5" />
            </button>
            <div className="hidden sm:flex items-center gap-2">
              <Logo size="sm" showWordmark={false} />
              <span className="font-bold text-sm text-slate-900 dark:text-slate-100">
                {activeProject?.name || 'Workspace'}
              </span>
            </div>
          </div>

          {/* Center: Global Pill Search Bar matching Reference ("Find your Task , Projects ...") */}
          <div
            onClick={() => setIsCommandPaletteOpen(true)}
            className="flex-1 max-w-md mx-4 flex items-center gap-2.5 px-4 py-2 rounded-full border border-slate-200/80 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/70 hover:border-blue-400 dark:hover:border-blue-500 text-xs text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 shadow-2xs transition cursor-pointer"
          >
            <Search className="h-4 w-4 text-slate-400 shrink-0" />
            <span className="truncate">Find your Task , Projects ...</span>
            <kbd className="ml-auto hidden sm:inline-block px-1.5 py-0.5 rounded-md bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-[10px] font-mono text-slate-400 shadow-2xs">
              ⌘K
            </kbd>
          </div>

          {/* Right: Digital Clock + Messages + Notification Bell + Panel Toggle */}
          <div className="flex items-center gap-3 shrink-0">
            {/* Live Clock Widget matching Reference: "20:12:44", "Wednesday, 11 May" */}
            <div className="hidden lg:flex flex-col text-right">
              <span className="text-xs font-mono font-bold text-slate-800 dark:text-slate-200 leading-tight">
                {timeString || '12:00:00'}
              </span>
              <span className="text-[10px] text-slate-400 dark:text-slate-500 leading-tight mt-0.5">
                {dateString || 'Today'}
              </span>
            </div>

            {/* Standup Drawer / Message bubble button */}
            <button
              onClick={() => setIsDailyStatusDrawerOpen(true)}
              title="Daily Standup (Cmd+D)"
              className="p-2 rounded-full border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-400 hover:text-blue-600 transition shadow-2xs cursor-pointer"
            >
              <MessageSquare className="h-4 w-4" />
            </button>

            {/* Notifications Popover */}
            <NotificationsPopover />

            {/* Right Contextual Panel Toggle Button */}
            <button
              onClick={handleToggleRightPanel}
              title={isRightPanelOpen ? 'Hide right panel' : 'Show right panel'}
              className={`p-2 rounded-full border transition cursor-pointer ${isRightPanelOpen
                ? 'border-blue-200 bg-blue-50 text-blue-600 dark:border-blue-900/60 dark:bg-blue-950/60 dark:text-blue-400'
                : 'border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800'
                }`}
            >
              <PanelRight className="h-4 w-4" />
            </button>

            {/* Persona Switcher Menu */}
            <UserProfileMenu />
          </div>
        </header>

        {/* 3. CENTRAL WORKSPACE & CONTEXTUAL RIGHT PANEL */}
        <div className="flex-1 flex overflow-hidden min-w-0">
          <main className="flex-1 overflow-y-auto flex flex-col p-4 md:p-6 lg:p-8">
            {children}
          </main>

          <ContextualRightPanel
            isOpen={isRightPanelOpen}
            onClose={() => setIsRightPanelOpen(false)}
            onSelectTicket={(ticket) => setSelectedTicket(ticket)}
            onOpenCreateModal={() => setIsCreateModalOpen(true)}
          />
        </div>
      </div>

      {/* Mobile Drawer Menu */}
      {isMobileMenuOpen && (
        <div className="fixed inset-0 z-50 md:hidden flex">
          <div
            className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs"
            onClick={() => setIsMobileMenuOpen(false)}
          />
          <div className="relative w-72 bg-white dark:bg-slate-900 h-full flex flex-col p-4 z-10 border-r border-slate-200 dark:border-slate-800">
            <div className="flex items-center justify-between pb-4 border-b border-slate-200 dark:border-slate-800">
              <Logo size="sm" />
              <button onClick={() => setIsMobileMenuOpen(false)} className="p-1 rounded-md text-slate-400">
                <X className="h-5 w-5" />
              </button>
            </div>
            <nav className="flex-1 py-4 space-y-1">
              <Link
                href="/dashboard"
                onClick={() => setIsMobileMenuOpen(false)}
                className={`flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-semibold ${activeNav === 'DASHBOARD'
                  ? 'bg-blue-50 dark:bg-blue-950 text-blue-700 dark:text-blue-400'
                  : 'text-slate-700 dark:text-slate-300'
                  }`}
              >
                <LayoutDashboard className="h-4 w-4" />
                <span>Dashboard</span>
              </Link>
              <Link
                href="/projects"
                onClick={() => setIsMobileMenuOpen(false)}
                className={`flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-semibold ${activeNav === 'PROJECTS'
                  ? 'bg-blue-50 dark:bg-blue-950 text-blue-700 dark:text-blue-400'
                  : 'text-slate-700 dark:text-slate-300'
                  }`}
              >
                <FolderGit2 className="h-4 w-4" />
                <span>Projects</span>
              </Link>
              <Link
                href="/"
                onClick={() => setIsMobileMenuOpen(false)}
                className={`flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-semibold ${activeNav === 'BOARD'
                  ? 'bg-blue-50 dark:bg-blue-950 text-blue-700 dark:text-blue-400'
                  : 'text-slate-700 dark:text-slate-300'
                  }`}
              >
                <LayoutGrid className="h-4 w-4" />
                <span>Boards</span>
              </Link>
              <Link
                href="/teams"
                onClick={() => setIsMobileMenuOpen(false)}
                className={`flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-semibold ${activeNav === 'TEAMS'
                  ? 'bg-blue-50 dark:bg-blue-950 text-blue-700 dark:text-blue-400'
                  : 'text-slate-700 dark:text-slate-300'
                  }`}
              >
                <Users className="h-4 w-4" />
                <span>Teams</span>
              </Link>
              <Link
                href="/table"
                onClick={() => setIsMobileMenuOpen(false)}
                className={`flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-semibold ${activeNav === 'TABLE'
                  ? 'bg-blue-50 dark:bg-blue-950 text-blue-700 dark:text-blue-400'
                  : 'text-slate-700 dark:text-slate-300'
                  }`}
              >
                <Table2 className="h-4 w-4" />
                <span>All Tasks</span>
              </Link>
              <Link
                href="/timeline"
                onClick={() => setIsMobileMenuOpen(false)}
                className={`flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-semibold ${activeNav === 'TIMELINE'
                  ? 'bg-blue-50 dark:bg-blue-950 text-blue-700 dark:text-blue-400'
                  : 'text-slate-700 dark:text-slate-300'
                  }`}
              >
                <CalendarRange className="h-4 w-4" />
                <span>Calender</span>
              </Link>
              <Link
                href="/backlog"
                onClick={() => setIsMobileMenuOpen(false)}
                className={`flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-semibold ${activeNav === 'BACKLOG'
                  ? 'bg-blue-50 dark:bg-blue-950 text-blue-700 dark:text-blue-400'
                  : 'text-slate-700 dark:text-slate-300'
                  }`}
              >
                <Layers className="h-4 w-4" />
                <span>Backlog</span>
              </Link>
              <Link
                href="/reports"
                onClick={() => setIsMobileMenuOpen(false)}
                className={`flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-semibold ${activeNav === 'REPORTS'
                  ? 'bg-blue-50 dark:bg-blue-950 text-blue-700 dark:text-blue-400'
                  : 'text-slate-700 dark:text-slate-300'
                  }`}
              >
                <BarChart3 className="h-4 w-4" />
                <span>Reports</span>
              </Link>
              {canAccess('automation') && (
                <Link
                  href="/automation"
                  onClick={() => setIsMobileMenuOpen(false)}
                  className={`flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-semibold ${activeNav === 'AUTOMATION'
                    ? 'bg-blue-50 dark:bg-blue-950 text-blue-700 dark:text-blue-400'
                    : 'text-slate-700 dark:text-slate-300'
                    }`}
                >
                  <Zap className="h-4 w-4" />
                  <span>Automation</span>
                </Link>
              )}
              {canAccessMail() && (
                <Link
                  href="/mail"
                  onClick={() => setIsMobileMenuOpen(false)}
                  className={`flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-semibold ${activeNav === 'MAIL'
                    ? 'bg-blue-50 dark:bg-blue-950 text-blue-700 dark:text-blue-400'
                    : 'text-slate-700 dark:text-slate-300'
                    }`}
                >
                  <Mail className="h-4 w-4" />
                  <span>Mailing</span>
                </Link>
              )}
              {canAccessSettings() && (
                <Link
                  href="/settings/users"
                  onClick={() => setIsMobileMenuOpen(false)}
                  className={`flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-semibold ${activeNav === 'USERS'
                    ? 'bg-blue-50 dark:bg-blue-950 text-blue-700 dark:text-blue-400'
                    : 'text-slate-700 dark:text-slate-300'
                    }`}
                >
                  <UserPlus className="h-4 w-4" />
                  <span>Users</span>
                </Link>
              )}
              <Link
                href="/settings/roles"
                onClick={() => setIsMobileMenuOpen(false)}
                className={`flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-semibold ${activeNav === 'ROLES'
                  ? 'bg-blue-50 dark:bg-blue-950 text-blue-700 dark:text-blue-400'
                  : 'text-slate-700 dark:text-slate-300'
                  }`}
              >
                <Shield className="h-4 w-4" />
                <span>Setting</span>
              </Link>
            </nav>
          </div>
        </div>
      )}

      {/* Global Command Palette (⌘K) */}
      <CommandPalette
        isOpen={isCommandPaletteOpen}
        setIsOpen={setIsCommandPaletteOpen}
        tickets={tickets}
        projects={projects}
        activeProjectKey={selectedProjectKey}
        onSelectTicket={(ticket) => setSelectedTicket(ticket)}
        onCreateTicket={() => setIsCreateModalOpen(true)}
        onSelectProject={(key) => setSelectedProjectKey(key)}
      />

      {/* Global Quick Create Task Modal */}
      {isCreateModalOpen && activeProject && (
        <CreateTicketModal
          projectId={activeProject.id}
          isOpen={isCreateModalOpen}
          onClose={() => setIsCreateModalOpen(false)}
          onSubmit={async (data) => {
            await createTicketMutation.mutateAsync(data);
          }}
        />
      )}

      {/* Global Quick Create Project Modal */}
      {canCreateProject && isCreateProjectModalOpen && (
        <CreateProjectModal
          isOpen={isCreateProjectModalOpen}
          onClose={() => setIsCreateProjectModalOpen(false)}
        />
      )}

      {/* Global Ticket Detail Modal */}
      {selectedTicket && (
        <TicketDetailModal
          ticket={selectedTicket}
          onClose={() => setSelectedTicket(null)}
        />
      )}

      {/* Global Slide-Over Daily Status & Standup Drawer (Cmd+D) */}
      <DailyStatusDrawer
        isOpen={isDailyStatusDrawerOpen}
        onClose={() => setIsDailyStatusDrawerOpen(false)}
      />
    </div>
  );
}
