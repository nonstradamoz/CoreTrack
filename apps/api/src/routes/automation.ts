import { FastifyPluginAsync } from 'fastify';
import { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { db, automationRules, emailNotificationLogs, projects, eq, and, desc } from '@coretrack/db';
import { CreateAutomationRuleSchema, UpdateAutomationRuleSchema } from '@coretrack/shared';
import { runDeadlineAndEscalationScan } from '../services/deadlineScanner.js';
import { getProviderStatus } from '../services/email.js';

export const automationRoutes: FastifyPluginAsync = async (fastify) => {
  const app = fastify.withTypeProvider<ZodTypeProvider>();

  // 1. List Automation Rules for a Project
  app.get(
    '/projects/:projectKey/automation/rules',
    {
      schema: {
        description: 'List automation rules configured for a project',
        tags: ['Automation'],
        params: z.object({
          projectKey: z.string(),
        }),
      },
    },
    async (request, reply) => {
      const { projectKey } = request.params;
      const proj = await db.query.projects.findFirst({
        where: eq(projects.key, projectKey),
      });

      if (!proj) {
        return reply.status(404).send({ error: 'Project not found' });
      }

      const rules = await db.query.automationRules.findMany({
        where: eq(automationRules.projectId, proj.id),
        orderBy: desc(automationRules.createdAt),
      });

      return reply.send({ data: rules });
    }
  );

  // 2. Create Automation Rule
  app.post(
    '/projects/:projectKey/automation/rules',
    {
      schema: {
        description: 'Create an automation rule (Trigger -> Condition -> Action)',
        tags: ['Automation'],
        params: z.object({
          projectKey: z.string(),
        }),
        body: CreateAutomationRuleSchema,
      },
    },
    async (request, reply) => {
      const { projectKey } = request.params;
      const body = request.body;

      const proj = await db.query.projects.findFirst({
        where: eq(projects.key, projectKey),
      });

      if (!proj) {
        return reply.status(404).send({ error: 'Project not found' });
      }

      const [newRule] = await db
        .insert(automationRules)
        .values({
          projectId: proj.id,
          name: body.name,
          description: body.description,
          triggerType: body.triggerType,
          conditions: body.conditions,
          actions: body.actions,
          isActive: body.isActive ?? true,
        })
        .returning();

      return reply.status(201).send({ data: newRule });
    }
  );

  // 3. Update Automation Rule
  app.patch(
    '/projects/:projectKey/automation/rules/:ruleId',
    {
      schema: {
        description: 'Update an automation rule',
        tags: ['Automation'],
        params: z.object({
          projectKey: z.string(),
          ruleId: z.string().uuid(),
        }),
        body: UpdateAutomationRuleSchema,
      },
    },
    async (request, reply) => {
      const { ruleId } = request.params;
      const updates = request.body;

      const [updated] = await db
        .update(automationRules)
        .set({
          ...updates,
          updatedAt: new Date(),
        })
        .where(eq(automationRules.id, ruleId))
        .returning();

      if (!updated) {
        return reply.status(404).send({ error: 'Automation rule not found' });
      }

      return reply.send({ data: updated });
    }
  );

  // 4. Delete Automation Rule
  app.delete(
    '/projects/:projectKey/automation/rules/:ruleId',
    {
      schema: {
        description: 'Delete an automation rule',
        tags: ['Automation'],
        params: z.object({
          projectKey: z.string(),
          ruleId: z.string().uuid(),
        }),
      },
    },
    async (request, reply) => {
      const { ruleId } = request.params;

      const [deleted] = await db
        .delete(automationRules)
        .where(eq(automationRules.id, ruleId))
        .returning();

      if (!deleted) {
        return reply.status(404).send({ error: 'Automation rule not found' });
      }

      return reply.send({ success: true, message: 'Automation rule deleted successfully' });
    }
  );

  // 5. Manual Trigger: Run Deadline & SLA Escalation Scan
  app.post(
    '/automation/scan-deadlines',
    {
      schema: {
        description: 'Run automated deadline scan, auto-sprint backlog promotion, and overdue email escalations',
        tags: ['Automation'],
      },
    },
    async (_request, reply) => {
      const summary = await runDeadlineAndEscalationScan();
      return reply.send({
        success: true,
        message: 'Deadline and escalation scan executed successfully.',
        data: summary,
      });
    }
  );

  // 6. List Email Notification Logs (Audit Trail)
  app.get(
    '/automation/email-logs',
    {
      schema: {
        description: 'Get recent email notification dispatch logs',
        tags: ['Automation'],
        querystring: z.object({
          limit: z.coerce.number().min(1).max(100).default(50),
        }),
      },
    },
    async (request, reply) => {
      const { limit } = request.query;
      const logs = await db.query.emailNotificationLogs.findMany({
        orderBy: desc(emailNotificationLogs.sentAt),
        limit,
      });
      return reply.send({
        data: logs,
        total: logs.length,
      });
    }
  );

  // 7. Clear All Email Notification Logs
  app.delete(
    '/automation/email-logs',
    {
      schema: {
        description: 'Clear all email notification audit logs',
        tags: ['Automation'],
      },
    },
    async (_request, reply) => {
      await db.delete(emailNotificationLogs);
      return reply.send({
        success: true,
        message: 'All email notification audit logs cleared successfully.',
      });
    }
  );

  // 8. Get Email Failover Provider Status
  app.get(
    '/automation/email-providers',
    {
      schema: {
        description: 'Get configured email providers and failover status (Resend, Mailjet, SMTP)',
        tags: ['Automation'],
      },
    },
    async (_request, reply) => {
      const status = getProviderStatus();
      return reply.send({
        success: true,
        data: status,
      });
    }
  );
};
