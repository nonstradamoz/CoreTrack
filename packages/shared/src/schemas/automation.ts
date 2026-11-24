import { z } from 'zod';

export const TriggerTypeEnum = z.enum([
  'TASK_CREATED',
  'STATUS_CHANGED',
  'PRIORITY_CHANGED',
  'ASSIGNEE_CHANGED',
]);

export const ConditionOperatorEnum = z.enum([
  'EQUALS',
  'NOT_EQUALS',
  'IN',
  'CONTAINS',
  'IS_EMPTY',
  'IS_NOT_EMPTY',
]);

export const RuleConditionSchema = z.object({
  field: z.string().min(1),
  operator: ConditionOperatorEnum,
  value: z.unknown().optional(),
});

export const ActionTypeEnum = z.enum([
  'SET_ASSIGNEE',
  'SET_PRIORITY',
  'SET_STATUS',
  'ADD_COMMENT',
  'ADD_DEADLINE_DAYS',
]);

export const RuleActionSchema = z.object({
  type: ActionTypeEnum,
  value: z.unknown(),
  extra: z.record(z.unknown()).optional(),
});

export const CreateAutomationRuleSchema = z.object({
  name: z.string().min(1, 'Rule name is required').max(150),
  description: z.string().optional(),
  triggerType: TriggerTypeEnum,
  conditions: z.array(RuleConditionSchema).default([]),
  actions: z.array(RuleActionSchema).min(1, 'At least one action is required'),
  isActive: z.boolean().default(true),
});

export const UpdateAutomationRuleSchema = CreateAutomationRuleSchema.partial();

export type TriggerType = z.infer<typeof TriggerTypeEnum>;
export type ConditionOperator = z.infer<typeof ConditionOperatorEnum>;
export type RuleCondition = z.infer<typeof RuleConditionSchema>;
export type ActionType = z.infer<typeof ActionTypeEnum>;
export type RuleAction = z.infer<typeof RuleActionSchema>;
export type CreateAutomationRuleInput = z.infer<typeof CreateAutomationRuleSchema>;
export type UpdateAutomationRuleInput = z.infer<typeof UpdateAutomationRuleSchema>;
