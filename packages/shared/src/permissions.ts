/**
 * 64-Bit Bitmask Permission Architecture for CoreTrack
 * Delivers sub-millisecond O(1) authorization checks without recursive multi-table SQL joins.
 */
export const Permissions = {
  // Global / System (Bits 0-7)
  ORG_ADMIN: 1n << 0n, // 1
  PROJECT_CREATE: 1n << 1n, // 2
  USER_INVITE: 1n << 2n, // 4
  SETTINGS_EDIT: 1n << 3n, // 8

  // Project Level (Bits 8-19)
  PROJECT_VIEW: 1n << 8n,  // 256
  PROJECT_EDIT: 1n << 9n,  // 512
  PROJECT_DELETE: 1n << 10n, // 1024
  PROJECT_ADMIN: 1n << 11n, // 2048
  MEMBER_MANAGE: 1n << 12n, // 4096
  SPRINT_MANAGE: 1n << 13n, // 8192
  AUTOMATION_MANAGE: 1n << 14n, // 16384

  // Ticket Operations (Bits 20-35)
  TICKET_VIEW: 1n << 20n, // 1,048,576
  TICKET_CREATE: 1n << 21n, // 2,097,152
  TICKET_EDIT: 1n << 22n, // 4,194,304
  TICKET_DELETE: 1n << 23n, // 8,388,608
  TICKET_ASSIGN: 1n << 24n, // 16,777,216
  TICKET_TRANSITION: 1n << 25n, // 33,554,432
  TICKET_ATTACH: 1n << 26n, // 67,108,864
  TICKET_BATCH_EDIT: 1n << 27n, // 134,217,728

  // Collaboration & ITSM (Bits 36-47)
  COMMENT_VIEW_PUBLIC: 1n << 36n,
  COMMENT_CREATE_PUBLIC: 1n << 37n,
  COMMENT_VIEW_INTERNAL: 1n << 38n, // Internal notes
  COMMENT_CREATE_INTERNAL: 1n << 39n,
  APPROVAL_REVIEW: 1n << 40n,
  SLA_OVERRIDE: 1n << 41n,
} as const;

export type PermissionKey = keyof typeof Permissions;

/**
 * Evaluates whether a user's pre-computed bitmask holds the required capability.
 * Organization administrators bypass all permission checks.
 */
export function hasPermission(userBitmask: bigint, requiredPermission: bigint): boolean {
  if ((userBitmask & Permissions.ORG_ADMIN) === Permissions.ORG_ADMIN) {
    return true;
  }
  return (userBitmask & requiredPermission) === requiredPermission;
}

/**
 * Standard role bitmasks — 6-tier RBAC hierarchy
 *
 * SUPER_ADMIN  — full bypass, all modules
 * ADMIN        — all modules except Roles & Settings
 * MANAGER      — projects, boards, reports, automation; no settings
 * TEAM_LEAD    — boards, tasks, sprints; view-only projects & reports
 * EMPLOYEE     — dashboard, board (own tasks), portal only
 * CUSTOM       — configurable via module toggle grid in Roles & Settings
 */
export const StandardRoleBitmasks = {
  /** Bit 0 (ORG_ADMIN) gives full platform bypass */
  SUPER_ADMIN: Permissions.ORG_ADMIN,

  /** All task + project capabilities; blocked from SETTINGS_EDIT */
  ADMIN:
    Permissions.PROJECT_CREATE |
    Permissions.USER_INVITE |
    Permissions.PROJECT_VIEW |
    Permissions.PROJECT_EDIT |
    Permissions.PROJECT_DELETE |
    Permissions.PROJECT_ADMIN |
    Permissions.MEMBER_MANAGE |
    Permissions.SPRINT_MANAGE |
    Permissions.AUTOMATION_MANAGE |
    Permissions.TICKET_VIEW |
    Permissions.TICKET_CREATE |
    Permissions.TICKET_EDIT |
    Permissions.TICKET_DELETE |
    Permissions.TICKET_ASSIGN |
    Permissions.TICKET_TRANSITION |
    Permissions.TICKET_ATTACH |
    Permissions.TICKET_BATCH_EDIT |
    Permissions.COMMENT_VIEW_PUBLIC |
    Permissions.COMMENT_CREATE_PUBLIC |
    Permissions.COMMENT_VIEW_INTERNAL |
    Permissions.COMMENT_CREATE_INTERNAL |
    Permissions.APPROVAL_REVIEW |
    Permissions.SLA_OVERRIDE,

  /** Projects, boards, reports, automation — no Roles & Settings */
  MANAGER:
    Permissions.PROJECT_CREATE |
    Permissions.USER_INVITE |
    Permissions.PROJECT_VIEW |
    Permissions.PROJECT_EDIT |
    Permissions.PROJECT_ADMIN |
    Permissions.MEMBER_MANAGE |
    Permissions.SPRINT_MANAGE |
    Permissions.AUTOMATION_MANAGE |
    Permissions.TICKET_VIEW |
    Permissions.TICKET_CREATE |
    Permissions.TICKET_EDIT |
    Permissions.TICKET_DELETE |
    Permissions.TICKET_ASSIGN |
    Permissions.TICKET_TRANSITION |
    Permissions.TICKET_ATTACH |
    Permissions.TICKET_BATCH_EDIT |
    Permissions.COMMENT_VIEW_PUBLIC |
    Permissions.COMMENT_CREATE_PUBLIC |
    Permissions.COMMENT_VIEW_INTERNAL |
    Permissions.COMMENT_CREATE_INTERNAL |
    Permissions.APPROVAL_REVIEW |
    Permissions.SLA_OVERRIDE,

  /** Boards, tasks, sprints; view-only projects & reports; no automation/settings */
  TEAM_LEAD:
    Permissions.PROJECT_VIEW |
    Permissions.SPRINT_MANAGE |
    Permissions.TICKET_VIEW |
    Permissions.TICKET_CREATE |
    Permissions.TICKET_EDIT |
    Permissions.TICKET_ASSIGN |
    Permissions.TICKET_TRANSITION |
    Permissions.TICKET_ATTACH |
    Permissions.TICKET_BATCH_EDIT |
    Permissions.COMMENT_VIEW_PUBLIC |
    Permissions.COMMENT_CREATE_PUBLIC |
    Permissions.COMMENT_VIEW_INTERNAL |
    Permissions.COMMENT_CREATE_INTERNAL,

  /** Dashboard, board (own tasks), portal; no backlog/timeline/reports/automation/settings */
  EMPLOYEE:
    Permissions.PROJECT_VIEW |
    Permissions.TICKET_VIEW |
    Permissions.TICKET_CREATE |
    Permissions.TICKET_ATTACH |
    Permissions.COMMENT_VIEW_PUBLIC |
    Permissions.COMMENT_CREATE_PUBLIC,

  /** Starting point for the customisable role — Super Admin edits via toggle grid */
  CUSTOM: 0n,

  // ── Legacy aliases kept for backward compatibility ──
  ADMIN_LEGACY: Permissions.ORG_ADMIN,
  PROJECT_LEAD:
    Permissions.PROJECT_VIEW |
    Permissions.PROJECT_EDIT |
    Permissions.PROJECT_ADMIN |
    Permissions.MEMBER_MANAGE |
    Permissions.SPRINT_MANAGE |
    Permissions.AUTOMATION_MANAGE |
    Permissions.TICKET_VIEW |
    Permissions.TICKET_CREATE |
    Permissions.TICKET_EDIT |
    Permissions.TICKET_DELETE |
    Permissions.TICKET_ASSIGN |
    Permissions.TICKET_TRANSITION |
    Permissions.TICKET_ATTACH |
    Permissions.TICKET_BATCH_EDIT |
    Permissions.COMMENT_VIEW_PUBLIC |
    Permissions.COMMENT_CREATE_PUBLIC |
    Permissions.COMMENT_VIEW_INTERNAL |
    Permissions.COMMENT_CREATE_INTERNAL |
    Permissions.APPROVAL_REVIEW |
    Permissions.SLA_OVERRIDE,
  TEAM_MEMBER:
    Permissions.PROJECT_VIEW |
    Permissions.TICKET_VIEW |
    Permissions.TICKET_CREATE |
    Permissions.TICKET_EDIT |
    Permissions.TICKET_ASSIGN |
    Permissions.TICKET_TRANSITION |
    Permissions.TICKET_ATTACH |
    Permissions.COMMENT_VIEW_PUBLIC |
    Permissions.COMMENT_CREATE_PUBLIC |
    Permissions.COMMENT_VIEW_INTERNAL |
    Permissions.COMMENT_CREATE_INTERNAL,
  SUPPORT_AGENT:
    Permissions.PROJECT_VIEW |
    Permissions.TICKET_VIEW |
    Permissions.TICKET_CREATE |
    Permissions.TICKET_EDIT |
    Permissions.TICKET_TRANSITION |
    Permissions.TICKET_ATTACH |
    Permissions.COMMENT_VIEW_PUBLIC |
    Permissions.COMMENT_CREATE_PUBLIC |
    Permissions.COMMENT_VIEW_INTERNAL |
    Permissions.COMMENT_CREATE_INTERNAL |
    Permissions.SLA_OVERRIDE,
  VIEWER_REQUESTER:
    Permissions.PROJECT_VIEW |
    Permissions.TICKET_VIEW |
    Permissions.TICKET_CREATE |
    Permissions.TICKET_ATTACH |
    Permissions.COMMENT_VIEW_PUBLIC |
    Permissions.COMMENT_CREATE_PUBLIC,
} as const;

/**
 * Module-level access control
 *
 * Maps each app route module to the minimum permission bit required to access it.
 * Super Admin (ORG_ADMIN bit) always bypasses these checks.
 *
 * Access matrix:
 *  Module         | SuperAdmin | Admin | Manager | TeamLead | Employee | Custom
 *  ─────────────────────────────────────────────────────────────────────────────
 *  dashboard      | ✓          | ✓     | ✓       | ✓        | ✓        | ?
 *  board (/)      | ✓          | ✓     | ✓       | ✓        | ✓        | ?
 *  table          | ✓          | ✓     | ✓       | ✓        | ✗        | ?
 *  timeline       | ✓          | ✓     | ✓       | ✓        | ✗        | ?
 *  backlog        | ✓          | ✓     | ✓       | ✓        | ✗        | ?
 *  reports        | ✓          | ✓     | ✓       | view     | ✗        | ?
 *  automation     | ✓          | ✓     | ✓       | ✗        | ✗        | ?
 *  portal         | ✓          | ✓     | ✓       | ✓        | ✓        | ?
 *  settings/roles | ✓          | ✗     | ✗       | ✗        | ✗        | ?
 */
export const MODULE_ACCESS: Record<string, bigint> = {
  dashboard: Permissions.PROJECT_VIEW,
  board: Permissions.PROJECT_VIEW,
  table: Permissions.TICKET_BATCH_EDIT,   // Team Lead+ has this
  timeline: Permissions.SPRINT_MANAGE,        // Team Lead+ has this
  backlog: Permissions.SPRINT_MANAGE,        // Team Lead+ has this
  reports: Permissions.PROJECT_VIEW,         // All with project access; page filters by role
  automation: Permissions.AUTOMATION_MANAGE,    // Manager+ only
  mail: Permissions.AUTOMATION_MANAGE,          // Super Admin, Admin, Project Manager
  portal: Permissions.TICKET_CREATE,        // Employee+ can create requests
  settings: Permissions.SETTINGS_EDIT,        // Super Admin only (bit 3)
};

export interface PermissionDefinition {
  key: PermissionKey;
  bit: bigint;
  name: string;
  category: 'ORG' | 'PROJECT' | 'TASK' | 'ITSM';
  description: string;
}

export const PERMISSION_DEFINITIONS: PermissionDefinition[] = [
  // Org & System
  { key: 'ORG_ADMIN', bit: Permissions.ORG_ADMIN, name: 'Organization Admin', category: 'ORG', description: 'Full bypass access across all workspaces and settings.' },
  { key: 'PROJECT_CREATE', bit: Permissions.PROJECT_CREATE, name: 'Create Projects', category: 'ORG', description: 'Permission to initialize new project workspaces.' },
  { key: 'USER_INVITE', bit: Permissions.USER_INVITE, name: 'Manage Users', category: 'ORG', description: 'Invite and manage organization team members.' },
  { key: 'SETTINGS_EDIT', bit: Permissions.SETTINGS_EDIT, name: 'System Settings', category: 'ORG', description: 'Modify global tenant settings and integrations.' },

  // Project Management
  { key: 'PROJECT_VIEW', bit: Permissions.PROJECT_VIEW, name: 'View Project', category: 'PROJECT', description: 'Access project boards, backlogs, and telemetry.' },
  { key: 'PROJECT_EDIT', bit: Permissions.PROJECT_EDIT, name: 'Edit Project Settings', category: 'PROJECT', description: 'Update project keys, descriptions, and workflow rules.' },
  { key: 'PROJECT_DELETE', bit: Permissions.PROJECT_DELETE, name: 'Delete Project', category: 'PROJECT', description: 'Archive or permanently delete a project.' },
  { key: 'MEMBER_MANAGE', bit: Permissions.MEMBER_MANAGE, name: 'Manage Members & Roles', category: 'PROJECT', description: 'Assign project roles and configure permissions.' },
  { key: 'SPRINT_MANAGE', bit: Permissions.SPRINT_MANAGE, name: 'Manage Sprints', category: 'PROJECT', description: 'Create, start, plan, and complete sprints.' },
  { key: 'AUTOMATION_MANAGE', bit: Permissions.AUTOMATION_MANAGE, name: 'Manage Automation', category: 'PROJECT', description: 'Create and configure trigger-condition-action rules.' },

  // Task Lifecycle
  { key: 'TICKET_VIEW', bit: Permissions.TICKET_VIEW, name: 'View Tasks', category: 'TASK', description: 'Read tasks and discussion history.' },
  { key: 'TICKET_CREATE', bit: Permissions.TICKET_CREATE, name: 'Create Tasks', category: 'TASK', description: 'File new tasks, bugs, and service requests.' },
  { key: 'TICKET_EDIT', bit: Permissions.TICKET_EDIT, name: 'Edit Tasks', category: 'TASK', description: 'Modify titles, descriptions, points, and deadlines.' },
  { key: 'TICKET_DELETE', bit: Permissions.TICKET_DELETE, name: 'Delete Tasks', category: 'TASK', description: 'Permanently remove tasks.' },
  { key: 'TICKET_ASSIGN', bit: Permissions.TICKET_ASSIGN, name: 'Assign Tasks', category: 'TASK', description: 'Reassign tasks to team members.' },
  { key: 'TICKET_TRANSITION', bit: Permissions.TICKET_TRANSITION, name: 'Transition Tasks', category: 'TASK', description: 'Move tasks across Kanban workflow columns.' },
  { key: 'TICKET_ATTACH', bit: Permissions.TICKET_ATTACH, name: 'Upload Attachments', category: 'TASK', description: 'Attach files and screenshots to tasks.' },
  { key: 'TICKET_BATCH_EDIT', bit: Permissions.TICKET_BATCH_EDIT, name: 'Bulk Batch Edit', category: 'TASK', description: 'Perform bulk status and priority mutations.' },

  // ITSM & Collaboration
  { key: 'COMMENT_VIEW_PUBLIC', bit: Permissions.COMMENT_VIEW_PUBLIC, name: 'View Public Comments', category: 'ITSM', description: 'Read public comments on tasks.' },
  { key: 'COMMENT_CREATE_PUBLIC', bit: Permissions.COMMENT_CREATE_PUBLIC, name: 'Post Public Comments', category: 'ITSM', description: 'Post customer and requester-facing comments.' },
  { key: 'COMMENT_VIEW_INTERNAL', bit: Permissions.COMMENT_VIEW_INTERNAL, name: 'View Internal Notes', category: 'ITSM', description: 'Read staff-only internal discussion.' },
  { key: 'COMMENT_CREATE_INTERNAL', bit: Permissions.COMMENT_CREATE_INTERNAL, name: 'Post Internal Notes', category: 'ITSM', description: 'Post staff-only internal notes.' },
  { key: 'APPROVAL_REVIEW', bit: Permissions.APPROVAL_REVIEW, name: 'Review Approvals', category: 'ITSM', description: 'Sign off or reject ITSM change requests.' },
  { key: 'SLA_OVERRIDE', bit: Permissions.SLA_OVERRIDE, name: 'SLA Clocks Override', category: 'ITSM', description: 'Manually pause, resume, or adjust SLA targets.' },
];
