import {
  pgTable,
  uuid,
  varchar,
  text,
  boolean,
  integer,
  numeric,
  timestamp,
  bigint,
  jsonb,
  uniqueIndex,
  index,
} from 'drizzle-orm/pg-core';
import { relations, sql } from 'drizzle-orm';

// 1. USERS & IDENTITY
export const users = pgTable('users', {
  id: uuid('id').defaultRandom().primaryKey(),
  email: varchar('email', { length: 255 }).notNull().unique(),
  fullName: varchar('full_name', { length: 150 }).notNull(),
  avatarUrl: text('avatar_url'),
  userType: varchar('user_type', { length: 30 }).default('INTERNAL_EMPLOYEE').notNull(),
  status: varchar('status', { length: 30 }).default('ACTIVE').notNull(),
  globalPermissions: bigint('global_permissions', { mode: 'bigint' }).default(sql`0`).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

// 2. DEPARTMENTS & TEAMS
export const departments = pgTable('departments', {
  id: uuid('id').defaultRandom().primaryKey(),
  name: varchar('name', { length: 100 }).notNull().unique(),
  code: varchar('code', { length: 20 }).notNull().unique(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export const teams = pgTable('teams', {
  id: uuid('id').defaultRandom().primaryKey(),
  departmentId: uuid('department_id').notNull().references(() => departments.id, { onDelete: 'restrict' }),
  name: varchar('name', { length: 100 }).notNull(),
  keyPrefix: varchar('key_prefix', { length: 10 }).notNull().unique(),
  leadId: uuid('lead_id').references(() => users.id, { onDelete: 'set null' }),
  description: text('description'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

// 2b. TEAM MEMBERS (Employees assigned to teams)
export const teamMembers = pgTable(
  'team_members',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    teamId: uuid('team_id').notNull().references(() => teams.id, { onDelete: 'cascade' }),
    userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    role: varchar('role', { length: 50 }).default('MEMBER').notNull(), // 'LEAD', 'MEMBER'
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('idx_team_members_team_user').on(table.teamId, table.userId),
    index('idx_team_members_user').on(table.userId),
  ]
);

// 3. PROJECTS
export const projects = pgTable('projects', {
  id: uuid('id').defaultRandom().primaryKey(),
  departmentId: uuid('department_id').references(() => departments.id, { onDelete: 'set null' }),
  primaryTeamId: uuid('primary_team_id').references(() => teams.id, { onDelete: 'set null' }),
  key: varchar('key', { length: 10 }).notNull().unique(), // e.g. 'CORE'
  name: varchar('name', { length: 150 }).notNull(),
  description: text('description'),
  projectType: varchar('project_type', { length: 30 }).default('ENGINEERING').notNull(),
  privacyTier: varchar('privacy_tier', { length: 30 }).default('PUBLIC').notNull(),
  status: varchar('status', { length: 30 }).default('NOT_STARTED').notNull(), // NOT_STARTED, IN_PROGRESS, ON_HOLD, UNDER_REVIEW, COMPLETED, OVERDUE
  startDate: timestamp('start_date', { withTimezone: true }),
  deadline: timestamp('deadline', { withTimezone: true }),
  deadlineSetByUserId: uuid('deadline_set_by_user_id').references(() => users.id, { onDelete: 'set null' }),
  deadlineSetByRoleTier: integer('deadline_set_by_role_tier').default(1),
  lastOverdueNotifiedAt: timestamp('last_overdue_notified_at', { withTimezone: true }),
  githubRepoOwner: varchar('github_repo_owner', { length: 100 }),
  githubRepoName: varchar('github_repo_name', { length: 150 }),
  githubAccessToken: text('github_access_token'),
  githubLastSyncedAt: timestamp('github_last_synced_at', { withTimezone: true }),
  projectManagerId: uuid('project_manager_id').references(() => users.id, { onDelete: 'set null' }),
  reviewerId: uuid('reviewer_id').references(() => users.id, { onDelete: 'set null' }),
  archived: boolean('archived').default(false).notNull(),
  nextTicketNumber: integer('next_ticket_number').default(1).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

// 3b. PROJECT MILESTONES & DELIVERABLES
export const projectMilestones = pgTable('project_milestones', {
  id: uuid('id').defaultRandom().primaryKey(),
  projectId: uuid('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  title: varchar('title', { length: 150 }).notNull(),
  description: text('description'),
  status: varchar('status', { length: 30 }).default('PENDING').notNull(), // PENDING, IN_PROGRESS, COMPLETED
  dueDate: timestamp('due_date', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

// 3c. PROJECT ACTIVITY & ASSIGNMENT AUDIT LOGS
export const projectActivityLogs = pgTable('project_activity_logs', {
  id: uuid('id').defaultRandom().primaryKey(),
  projectId: uuid('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'set null' }),
  action: varchar('action', { length: 100 }).notNull(),
  details: text('details').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

// 4. SPRINTS
export const sprints = pgTable('sprints', {
  id: uuid('id').defaultRandom().primaryKey(),
  projectId: uuid('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  name: varchar('name', { length: 100 }).notNull(),
  goal: text('goal'),
  status: varchar('status', { length: 30 }).default('PLANNING').notNull(),
  startDate: timestamp('start_date', { withTimezone: true }),
  endDate: timestamp('end_date', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

// 5. TICKETS & TASKS (CORE ENTITY)
export const tickets = pgTable(
  'tickets',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    projectId: uuid('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
    ticketKey: varchar('ticket_key', { length: 20 }).notNull().unique(),
    ticketNumber: integer('ticket_number').notNull(),
    ticketType: varchar('ticket_type', { length: 30 }).notNull(),
    parentId: uuid('parent_id'),
    sprintId: uuid('sprint_id').references(() => sprints.id, { onDelete: 'set null' }),
    title: varchar('title', { length: 255 }).notNull(),
    description: text('description').default('').notNull(),
    status: varchar('status', { length: 50 }).default('TODO').notNull(),
    priority: varchar('priority', { length: 20 }).default('MEDIUM').notNull(),
    storyPoints: integer('story_points'),
    estimatedHours: numeric('estimated_hours', { precision: 6, scale: 2 }),
    spentHours: numeric('spent_hours', { precision: 6, scale: 2 }).default('0.0').notNull(),
    reporterId: uuid('reporter_id').notNull().references(() => users.id, { onDelete: 'restrict' }),
    assigneeId: uuid('assignee_id').references(() => users.id, { onDelete: 'set null' }),
    assignedByUserId: uuid('assigned_by_user_id').references(() => users.id, { onDelete: 'set null' }),
    assignedByRoleTier: integer('assigned_by_role_tier').default(1),
    startDate: timestamp('start_date', { withTimezone: true }),
    dueDate: timestamp('due_date', { withTimezone: true }),
    dueDateSetByUserId: uuid('due_date_set_by_user_id').references(() => users.id, { onDelete: 'set null' }),
    dueDateSetByRoleTier: integer('due_date_set_by_role_tier').default(1),
    lastOverdueNotifiedAt: timestamp('last_overdue_notified_at', { withTimezone: true }),
    lastApproachingNotifiedAt: timestamp('last_approaching_notified_at', { withTimezone: true }),

    // ITSM SLA fields
    slaResponseDueAt: timestamp('sla_response_due_at', { withTimezone: true }),
    slaResolutionDueAt: timestamp('sla_resolution_due_at', { withTimezone: true }),
    isSlaPaused: boolean('is_sla_paused').default(false).notNull(),

    // Dynamic JSONB Custom Fields
    customFields: jsonb('custom_fields').default({}).notNull(),

    // Optimistic Concurrency & Lifecycle
    lockVersion: integer('lock_version').default(1).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (table) => [
    uniqueIndex('idx_tickets_key_unique').on(table.ticketKey),
    index('idx_tickets_project_status').on(table.projectId, table.status),
    index('idx_tickets_assignee_active').on(table.assigneeId, table.status),
  ]
);

// 6. TICKET COMMENTS
export const ticketComments = pgTable('ticket_comments', {
  id: uuid('id').defaultRandom().primaryKey(),
  ticketId: uuid('ticket_id').notNull().references(() => tickets.id, { onDelete: 'cascade' }),
  authorId: uuid('author_id').notNull().references(() => users.id, { onDelete: 'restrict' }),
  body: text('body').notNull(),
  visibilityScope: varchar('visibility_scope', { length: 30 }).default('PUBLIC').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

// 7. TICKET DEPENDENCIES
export const ticketDependencies = pgTable(
  'ticket_dependencies',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    sourceTicketId: uuid('source_ticket_id').notNull().references(() => tickets.id, { onDelete: 'cascade' }),
    targetTicketId: uuid('target_ticket_id').references(() => tickets.id, { onDelete: 'cascade' }),
    dependencyType: varchar('dependency_type', { length: 30 }).default('BLOCKS').notNull(), // 'BLOCKS' | 'BLOCKED_BY' | 'RELATES_TO' | 'DUPLICATES'
    externalText: text('external_text'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index('idx_ticket_dependencies_source').on(table.sourceTicketId),
    index('idx_ticket_dependencies_target').on(table.targetTicketId),
  ]
);

// 8. TICKET ATTACHMENTS
export const ticketAttachments = pgTable('ticket_attachments', {
  id: uuid('id').defaultRandom().primaryKey(),
  ticketId: uuid('ticket_id').notNull().references(() => tickets.id, { onDelete: 'cascade' }),
  uploaderId: uuid('uploader_id').notNull().references(() => users.id, { onDelete: 'restrict' }),
  fileName: varchar('file_name', { length: 255 }).notNull(),
  fileSize: integer('file_size').notNull(),
  mimeType: varchar('mime_type', { length: 100 }).notNull(),
  s3Key: varchar('s3_key', { length: 500 }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

// 9. TICKET APPROVALS (ITSM Multi-Tier Staged Approvals)
export const ticketApprovals = pgTable(
  'ticket_approvals',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    ticketId: uuid('ticket_id').notNull().references(() => tickets.id, { onDelete: 'cascade' }),
    approverId: uuid('approver_id').notNull().references(() => users.id, { onDelete: 'restrict' }),
    tier: integer('tier').default(1).notNull(), // 1 = Direct Manager, 2 = IT Director
    status: varchar('status', { length: 30 }).default('PENDING').notNull(), // 'PENDING' | 'APPROVED' | 'REJECTED'
    comment: text('comment'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    decidedAt: timestamp('decided_at', { withTimezone: true }),
  },
  (table) => [
    index('idx_ticket_approvals_ticket').on(table.ticketId),
    index('idx_ticket_approvals_approver').on(table.approverId, table.status),
  ]
);

// 10. TICKET VCS LINKS (GitHub / GitLab Integration)
export const ticketVcsLinks = pgTable(
  'ticket_vcs_links',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    ticketId: uuid('ticket_id').notNull().references(() => tickets.id, { onDelete: 'cascade' }),
    provider: varchar('provider', { length: 30 }).default('GITHUB').notNull(), // 'GITHUB' | 'GITLAB'
    linkType: varchar('link_type', { length: 30 }).notNull(), // 'PULL_REQUEST' | 'COMMIT' | 'BRANCH'
    externalId: varchar('external_id', { length: 150 }).notNull(),
    title: varchar('title', { length: 255 }).notNull(),
    url: varchar('url', { length: 500 }).notNull(),
    branchName: varchar('branch_name', { length: 200 }),
    status: varchar('status', { length: 30 }).default('OPEN').notNull(), // 'OPEN' | 'MERGED' | 'CLOSED'
    author: varchar('author', { length: 150 }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index('idx_ticket_vcs_links_ticket').on(table.ticketId),
  ]
);

// 11. AUTOMATION RULES (Trigger -> Condition -> Action Engine)
export const automationRules = pgTable(
  'automation_rules',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    projectId: uuid('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
    name: varchar('name', { length: 150 }).notNull(),
    description: text('description'),
    triggerType: varchar('trigger_type', { length: 50 }).notNull(), // 'TASK_CREATED' | 'STATUS_CHANGED' | 'PRIORITY_CHANGED' | 'ASSIGNEE_CHANGED'
    conditions: jsonb('conditions').default([]).notNull(),
    actions: jsonb('actions').default([]).notNull(),
    isActive: boolean('is_active').default(true).notNull(),
    executionCount: integer('execution_count').default(0).notNull(),
    lastExecutedAt: timestamp('last_executed_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index('idx_automation_rules_project').on(table.projectId, table.isActive),
  ]
);

// 12. DAILY STANDUPS & STATUS UPDATES
export const dailyStandups = pgTable(
  'daily_standups',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    projectId: uuid('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
    standupDate: varchar('standup_date', { length: 10 }).notNull(), // 'YYYY-MM-DD'
    completedTaskIds: jsonb('completed_task_ids').default([]).notNull(),
    inProgressTaskIds: jsonb('in_progress_task_ids').default([]).notNull(),
    blockers: text('blockers').default(''),
    customNotes: text('custom_notes').default(''),
    summaryMarkdown: text('summary_markdown').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('idx_standups_user_project_date').on(table.userId, table.projectId, table.standupDate),
    index('idx_standups_project_date').on(table.projectId, table.standupDate),
  ]
);

// 12. ROLES (Custom Dynamic Roles)
export const roles = pgTable('roles', {
  id: uuid('id').defaultRandom().primaryKey(),
  projectId: uuid('project_id').references(() => projects.id, { onDelete: 'cascade' }), // null = Global Org role
  name: varchar('name', { length: 100 }).notNull(),
  description: text('description').default('').notNull(),
  color: varchar('color', { length: 20 }).default('#4F46E5').notNull(),
  isSystem: boolean('is_system').default(false).notNull(),
  permissions: bigint('permissions', { mode: 'bigint' }).default(sql`0`).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

// 13. PROJECT MEMBERS (Project-Scoped User Role Overrides)
export const projectMembers = pgTable(
  'project_members',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    projectId: uuid('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
    userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    roleId: uuid('role_id').notNull().references(() => roles.id, { onDelete: 'restrict' }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('idx_project_members_project_user').on(table.projectId, table.userId),
    index('idx_project_members_user').on(table.userId),
  ]
);

// 14. EMAIL NOTIFICATION LOGS (Audit & Cooldown Tracking)
export const emailNotificationLogs = pgTable(
  'email_notification_logs',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    recipientEmail: varchar('recipient_email', { length: 255 }).notNull(),
    recipientName: varchar('recipient_name', { length: 150 }),
    subject: varchar('subject', { length: 255 }).notNull(),
    notificationType: varchar('notification_type', { length: 50 }).notNull(), // TASK_ASSIGNED, PROJECT_ASSIGNED, TASK_OVERDUE, PROJECT_OVERDUE, SPRINT_PROMOTED
    ticketId: uuid('ticket_id').references(() => tickets.id, { onDelete: 'set null' }),
    projectId: uuid('project_id').references(() => projects.id, { onDelete: 'set null' }),
    provider: varchar('provider', { length: 50 }).default('RESEND'), // RESEND, MAILJET, SMTP, LOCAL
    status: varchar('status', { length: 20 }).default('SENT').notNull(), // SENT, FAILED
    errorMessage: text('error_message'),
    sentAt: timestamp('sent_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index('idx_email_logs_type_recipient').on(table.notificationType, table.recipientEmail),
    index('idx_email_logs_ticket').on(table.ticketId),
    index('idx_email_logs_project').on(table.projectId),
  ]
);

// Relations
export const projectsRelations = relations(projects, ({ one, many }) => ({
  department: one(departments, { fields: [projects.departmentId], references: [departments.id] }),
  primaryTeam: one(teams, { fields: [projects.primaryTeamId], references: [teams.id] }),
  projectManager: one(users, { fields: [projects.projectManagerId], references: [users.id] }),
  reviewer: one(users, { fields: [projects.reviewerId], references: [users.id] }),
  milestones: many(projectMilestones),
  activityLogs: many(projectActivityLogs),
  tickets: many(tickets),
  automationRules: many(automationRules),
  dailyStandups: many(dailyStandups),
  roles: many(roles),
  members: many(projectMembers),
}));

export const teamsRelations = relations(teams, ({ one, many }) => ({
  department: one(departments, { fields: [teams.departmentId], references: [departments.id] }),
  lead: one(users, { fields: [teams.leadId], references: [users.id] }),
  members: many(teamMembers),
  projects: many(projects),
}));

export const teamMembersRelations = relations(teamMembers, ({ one }) => ({
  team: one(teams, { fields: [teamMembers.teamId], references: [teams.id] }),
  user: one(users, { fields: [teamMembers.userId], references: [users.id] }),
}));

export const projectMilestonesRelations = relations(projectMilestones, ({ one }) => ({
  project: one(projects, { fields: [projectMilestones.projectId], references: [projects.id] }),
}));

export const projectActivityLogsRelations = relations(projectActivityLogs, ({ one }) => ({
  project: one(projects, { fields: [projectActivityLogs.projectId], references: [projects.id] }),
  user: one(users, { fields: [projectActivityLogs.userId], references: [users.id] }),
}));

export const rolesRelations = relations(roles, ({ one, many }) => ({
  project: one(projects, { fields: [roles.projectId], references: [projects.id] }),
  members: many(projectMembers),
}));

export const projectMembersRelations = relations(projectMembers, ({ one }) => ({
  project: one(projects, { fields: [projectMembers.projectId], references: [projects.id] }),
  user: one(users, { fields: [projectMembers.userId], references: [users.id] }),
  role: one(roles, { fields: [projectMembers.roleId], references: [roles.id] }),
}));

export const usersRelations = relations(users, ({ many }) => ({
  projectMemberships: many(projectMembers),
  dailyStandups: many(dailyStandups),
}));

export const automationRulesRelations = relations(automationRules, ({ one }) => ({
  project: one(projects, { fields: [automationRules.projectId], references: [projects.id] }),
}));

export const dailyStandupsRelations = relations(dailyStandups, ({ one }) => ({
  user: one(users, { fields: [dailyStandups.userId], references: [users.id] }),
  project: one(projects, { fields: [dailyStandups.projectId], references: [projects.id] }),
}));
export const ticketsRelations = relations(tickets, ({ one, many }) => ({
  project: one(projects, { fields: [tickets.projectId], references: [projects.id] }),
  reporter: one(users, { fields: [tickets.reporterId], references: [users.id] }),
  assignee: one(users, { fields: [tickets.assigneeId], references: [users.id] }),
  assignedByUser: one(users, { fields: [tickets.assignedByUserId], references: [users.id] }),
  sprint: one(sprints, { fields: [tickets.sprintId], references: [sprints.id] }),
  comments: many(ticketComments),
  outwardDependencies: many(ticketDependencies, { relationName: 'source_ticket' }),
  inwardDependencies: many(ticketDependencies, { relationName: 'target_ticket' }),
  attachments: many(ticketAttachments),
  approvals: many(ticketApprovals),
  vcsLinks: many(ticketVcsLinks),
}));

export const ticketDependenciesRelations = relations(ticketDependencies, ({ one }) => ({
  sourceTicket: one(tickets, { fields: [ticketDependencies.sourceTicketId], references: [tickets.id], relationName: 'source_ticket' }),
  targetTicket: one(tickets, { fields: [ticketDependencies.targetTicketId], references: [tickets.id], relationName: 'target_ticket' }),
}));

export const ticketAttachmentsRelations = relations(ticketAttachments, ({ one }) => ({
  ticket: one(tickets, { fields: [ticketAttachments.ticketId], references: [tickets.id] }),
  uploader: one(users, { fields: [ticketAttachments.uploaderId], references: [users.id] }),
}));

export const ticketApprovalsRelations = relations(ticketApprovals, ({ one }) => ({
  ticket: one(tickets, { fields: [ticketApprovals.ticketId], references: [tickets.id] }),
  approver: one(users, { fields: [ticketApprovals.approverId], references: [users.id] }),
}));

export const ticketVcsLinksRelations = relations(ticketVcsLinks, ({ one }) => ({
  ticket: one(tickets, { fields: [ticketVcsLinks.ticketId], references: [tickets.id] }),
}));
