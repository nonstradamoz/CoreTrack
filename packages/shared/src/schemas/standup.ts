import { z } from 'zod';

export const StandupTaskItemSchema = z.object({
  key: z.string(),
  title: z.string(),
  status: z.string().optional(),
  priority: z.string().optional(),
  storyPoints: z.number().nullable().optional(),
});

export const SaveDailyStandupSchema = z.object({
  projectId: z.string().uuid(),
  standupDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD'),
  completedTaskIds: z.array(StandupTaskItemSchema).default([]),
  inProgressTaskIds: z.array(StandupTaskItemSchema).default([]),
  blockers: z.string().optional().default(''),
  customNotes: z.string().optional().default(''),
  summaryMarkdown: z.string().min(1, 'Summary markdown cannot be empty'),
});

export type StandupTaskItem = z.infer<typeof StandupTaskItemSchema>;
export type SaveDailyStandupInput = z.infer<typeof SaveDailyStandupSchema>;
