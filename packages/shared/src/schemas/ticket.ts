import { z } from 'zod';

export const TicketTypeEnum = z.enum([
  'INITIATIVE',
  'EPIC',
  'STORY',
  'TASK',
  'BUG',
  'SERVICE_REQUEST',
  'INCIDENT',
]);

export const TicketPriorityEnum = z.enum(['URGENT', 'HIGH', 'MEDIUM', 'LOW']);

export const TicketStatusEnum = z.enum([
  'BACKLOG',
  'TODO',
  'IN_PROGRESS',
  'PENDING_APPROVAL',
  'IN_REVIEW',
  'RESOLVED',
  'DONE',
  'CANCELED',
]);

export const TicketDependencyTypeEnum = z.enum([
  'BLOCKS',
  'BLOCKED_BY',
  'RELATES_TO',
  'DUPLICATES',
]);

export const CommentVisibilityEnum = z.enum([
  'PUBLIC',
  'INTERNAL_ONLY',
  'RESTRICTED_GROUPS',
]);

// Validation Schema for Creating a Ticket
export const CreateTicketSchema = z.object({
  projectId: z.string().uuid(),
  teamId: z.string().uuid().optional().nullable(),
  ticketType: TicketTypeEnum,
  title: z.string().min(1, 'Title is required').max(255),
  description: z.string().optional().default(''),
  priority: TicketPriorityEnum.default('MEDIUM'),
  status: TicketStatusEnum.default('TODO'),
  parentId: z.string().uuid().optional(),
  sprintId: z.string().uuid().optional(),
  milestoneId: z.string().uuid().optional().nullable(),
  assigneeId: z.string().uuid().optional(),
  storyPoints: z.number().int().min(0).max(100).optional(),
  estimatedHours: z.number().min(0).max(1000).optional(),
  startDate: z.string().datetime().optional(),
  dueDate: z.string().datetime().optional(),
  adminOnly: z.boolean().optional(),
  customFields: z.record(z.unknown()).default({}),
});

// Validation Schema for Updating a Ticket (Enforces Optimistic Concurrency via lockVersion)
export const UpdateTicketSchema = z.object({
  lockVersion: z.number().int().positive('lockVersion is required for optimistic concurrency'),
  title: z.string().min(1).max(255).optional(),
  description: z.string().optional(),
  status: TicketStatusEnum.optional(),
  priority: TicketPriorityEnum.optional(),
  assigneeId: z.string().uuid().nullable().optional(),
  teamId: z.string().uuid().nullable().optional(),
  sprintId: z.string().uuid().nullable().optional(),
  milestoneId: z.string().uuid().nullable().optional(),
  storyPoints: z.number().int().min(0).max(100).nullable().optional(),
  spentHours: z.number().min(0).optional(),
  startDate: z.string().datetime().nullable().optional(),
  dueDate: z.string().datetime().nullable().optional(),
  isSlaPaused: z.boolean().optional(),
  adminOnly: z.boolean().optional(),
  slaResponseDueAt: z.string().datetime().nullable().optional(),
  slaResolutionDueAt: z.string().datetime().nullable().optional(),
  customFields: z.record(z.unknown()).optional(),
});

// Validation Schema for Creating Comments
export const CreateCommentSchema = z.object({
  body: z.string().min(1, 'Comment body cannot be empty'),
  visibilityScope: CommentVisibilityEnum.default('PUBLIC'),
  restrictedGroupIds: z.array(z.string().uuid()).optional().default([]),
});

// Validation Schema for Dependencies
export const CreateDependencySchema = z.object({
  targetTicketKey: z.string().optional(),
  externalText: z.string().optional(),
  dependencyType: TicketDependencyTypeEnum.default('BLOCKS'),
});

// Validation Schema for Bulk Operations
export const BulkUpdateTicketsSchema = z.object({
  ticketKeys: z.array(z.string().min(1)).min(1).max(100),
  status: TicketStatusEnum.optional(),
  priority: TicketPriorityEnum.optional(),
  assigneeId: z.string().uuid().nullable().optional(),
  teamId: z.string().uuid().nullable().optional(),
  sprintId: z.string().uuid().nullable().optional(),
});

// Validation Schema for Presigned Attachment Upload
export const PresignAttachmentSchema = z.object({
  fileName: z.string().min(1).max(255),
  fileSize: z.number().int().positive().max(50 * 1024 * 1024), // 50MB
  mimeType: z.string().min(1).max(100),
});

// Validation Schema for Staged Approvals
export const ApprovalDecisionSchema = z.object({
  decision: z.enum(['APPROVED', 'REJECTED']),
  comment: z.string().optional(),
});

// Validation Schema for VCS / Git links
export const VcsLinkSchema = z.object({
  provider: z.enum(['GITHUB', 'GITLAB']).default('GITHUB'),
  linkType: z.enum(['PULL_REQUEST', 'COMMIT', 'BRANCH']),
  externalId: z.string().min(1),
  title: z.string().min(1),
  url: z.string().url(),
  branchName: z.string().optional(),
  status: z.enum(['OPEN', 'MERGED', 'CLOSED']).default('OPEN'),
  author: z.string().optional(),
});

export type TicketType = z.infer<typeof TicketTypeEnum>;
export type TicketPriority = z.infer<typeof TicketPriorityEnum>;
export type TicketStatus = z.infer<typeof TicketStatusEnum>;
export type TicketDependencyType = z.infer<typeof TicketDependencyTypeEnum>;
export type CreateTicketInput = z.infer<typeof CreateTicketSchema>;
export type UpdateTicketInput = z.infer<typeof UpdateTicketSchema>;
export type CreateCommentInput = z.infer<typeof CreateCommentSchema>;
export type CreateDependencyInput = z.infer<typeof CreateDependencySchema>;
export type BulkUpdateTicketsInput = z.infer<typeof BulkUpdateTicketsSchema>;
export type PresignAttachmentInput = z.infer<typeof PresignAttachmentSchema>;
export type ApprovalDecisionInput = z.infer<typeof ApprovalDecisionSchema>;
export type VcsLinkInput = z.infer<typeof VcsLinkSchema>;
