import {
  db,
  tickets,
  ticketComments,
  automationRules,
  users,
  eq,
  and,
  sql,
} from '@coretrack/db';
import { RuleCondition, RuleAction, TriggerType } from '@coretrack/shared';
import { broadcastToProject } from '../ws.js';

const MAX_RECURSION_DEPTH = 3;

export function evaluateCondition(ticket: Record<string, unknown>, condition: RuleCondition): boolean {
  const actualVal = ticket[condition.field];
  const targetVal = condition.value;

  switch (condition.operator) {
    case 'EQUALS':
      return String(actualVal ?? '').toUpperCase() === String(targetVal ?? '').toUpperCase();
    case 'NOT_EQUALS':
      return String(actualVal ?? '').toUpperCase() !== String(targetVal ?? '').toUpperCase();
    case 'IN':
      if (Array.isArray(targetVal)) {
        return targetVal.map((v) => String(v).toUpperCase()).includes(String(actualVal ?? '').toUpperCase());
      }
      return false;
    case 'CONTAINS':
      return String(actualVal ?? '').toLowerCase().includes(String(targetVal ?? '').toLowerCase());
    case 'IS_EMPTY':
      return actualVal === null || actualVal === undefined || actualVal === '';
    case 'IS_NOT_EMPTY':
      return actualVal !== null && actualVal !== undefined && actualVal !== '';
    default:
      return false;
  }
}

export async function evaluateAndExecuteRules(params: {
  projectId: string;
  projectKey: string;
  triggerType: TriggerType;
  ticket: Record<string, any>;
  depth?: number;
}): Promise<Array<{ ruleId: string; ruleName: string; actionsExecuted: number }>> {
  const { projectId, projectKey, triggerType, ticket } = params;
  const depth = params.depth || 0;

  if (depth >= MAX_RECURSION_DEPTH) {
    console.warn(
      `[Automation] Loop suppression active: Aborted recursive cascade at depth ${depth} for ticket ${ticket.ticketKey} on trigger ${triggerType}`
    );
    return [];
  }

  // 1. Fetch active rules for this project and trigger
  const rules = await db.query.automationRules.findMany({
    where: and(
      eq(automationRules.projectId, projectId),
      eq(automationRules.isActive, true),
      eq(automationRules.triggerType, triggerType)
    ),
  });

  if (rules.length === 0) return [];

  const results: Array<{ ruleId: string; ruleName: string; actionsExecuted: number }> = [];

  for (const rule of rules) {
    const conditions = (rule.conditions as RuleCondition[]) || [];
    const actions = (rule.actions as RuleAction[]) || [];

    // Check if all conditions match (AND logic)
    const allMatch = conditions.length === 0 || conditions.every((cond) => evaluateCondition(ticket, cond));
    if (!allMatch) continue;

    const updatesToApply: Record<string, unknown> = {};
    let cascadedTrigger: TriggerType | null = null;
    let commentsToAdd: Array<{ body: string; visibilityScope: 'PUBLIC' | 'INTERNAL_ONLY' }> = [];

    for (const action of actions) {
      switch (action.type) {
        case 'SET_ASSIGNEE':
          updatesToApply.assigneeId = action.value;
          cascadedTrigger = 'ASSIGNEE_CHANGED';
          // Auto-default deadline if ticket has no deadline
          if (!ticket.dueDate && !updatesToApply.dueDate) {
            updatesToApply.dueDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
          }
          break;

        case 'SET_PRIORITY':
          updatesToApply.priority = action.value;
          cascadedTrigger = 'PRIORITY_CHANGED';
          break;

        case 'SET_STATUS':
          updatesToApply.status = action.value;
          cascadedTrigger = 'STATUS_CHANGED';
          break;

        case 'ADD_DEADLINE_DAYS': {
          const days = Number(action.value) || 3;
          updatesToApply.dueDate = new Date(Date.now() + days * 24 * 60 * 60 * 1000);
          break;
        }

        case 'ADD_COMMENT': {
          const extra = (action.extra as Record<string, unknown>) || {};
          commentsToAdd.push({
            body: String(action.value),
            visibilityScope: (extra.visibilityScope as 'PUBLIC' | 'INTERNAL_ONLY') || 'INTERNAL_ONLY',
          });
          break;
        }
      }
    }

    // Apply database ticket updates if any action changed ticket attributes
    let updatedTicket = ticket;
    if (Object.keys(updatesToApply).length > 0) {
      updatesToApply.updatedAt = new Date();
      updatesToApply.lockVersion = (ticket.lockVersion || 1) + 1;

      const [res] = await db
        .update(tickets)
        .set(updatesToApply)
        .where(eq(tickets.id, ticket.id))
        .returning();

      const hydrated = await db.query.tickets.findFirst({
        where: eq(tickets.id, ticket.id),
        with: { reporter: true, assignee: true },
      });
      updatedTicket = hydrated || res;

      broadcastToProject(projectKey, {
        type: 'TICKET_UPDATED',
        payload: updatedTicket,
      });
    }

    // Insert automated comments if configured
    if (commentsToAdd.length > 0) {
      const defaultUser = await db.query.users.findFirst();
      const authorId = defaultUser?.id || '00000000-0000-0000-0000-000000000001';

      for (const comment of commentsToAdd) {
        const [newComment] = await db
          .insert(ticketComments)
          .values({
            ticketId: ticket.id,
            authorId,
            body: `[Automated Rule: ${rule.name}] ${comment.body}`,
            visibilityScope: comment.visibilityScope,
          })
          .returning();

        broadcastToProject(projectKey, {
          type: 'COMMENT_CREATED',
          payload: {
            ...newComment,
            authorName: 'CoreTrack Automation Bot',
            authorEmail: 'bot@coretrack.internal',
          },
        });
      }
    }

    // Record rule execution metrics
    await db
      .update(automationRules)
      .set({
        executionCount: rule.executionCount + 1,
        lastExecutedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(automationRules.id, rule.id));

    broadcastToProject(projectKey, {
      type: 'AUTOMATION_EXECUTED',
      payload: {
        ruleId: rule.id,
        ruleName: rule.name,
        ticketKey: ticket.ticketKey,
        depth,
      },
    });

    results.push({
      ruleId: rule.id,
      ruleName: rule.name,
      actionsExecuted: actions.length,
    });

    // Cascaded evaluation with loop-suppressed recursion
    if (cascadedTrigger && depth + 1 < MAX_RECURSION_DEPTH) {
      await evaluateAndExecuteRules({
        projectId,
        projectKey,
        triggerType: cascadedTrigger,
        ticket: updatedTicket,
        depth: depth + 1,
      });
    }
  }

  return results;
}
