import { FastifyPluginAsync, FastifyReply, FastifyRequest } from 'fastify';
import { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { db, automationRules, emailNotificationLogs, projects, eq, desc } from '@coretrack/db';
import { CreateAutomationRuleSchema, UpdateAutomationRuleSchema, Permissions, hasPermission } from '@coretrack/shared';
import {
  runDeadlineAndEscalationScan,
  getSchedulerStatus,
  updateSchedulerConfig,
} from '../services/deadlineScanner.js';
import { getProviderStatus } from '../services/email.js';
import { getCurrentUser, getUserRoleTier, getEffectiveUserPermissions } from '../auth/auth.js';

export const automationRoutes: FastifyPluginAsync = async (fastify) => {
  const app = fastify.withTypeProvider<ZodTypeProvider>();

  async function requireAdminOrSuperAdmin(request: FastifyRequest, reply: FastifyReply): Promise<boolean> {
    const user = await getCurrentUser(request);
    if (!user) {
      reply.status(401).send({ error: 'Unauthorized' });
      return false;
    }

    const callerTierInfo = await getUserRoleTier(user.id);
    const { permissions } = await getEffectiveUserPermissions(user.id);
    const isAllowed =
      callerTierInfo.tier >= 4 ||
      hasPermission(permissions, Permissions.ORG_ADMIN);

    if (!isAllowed) {
      reply.status(403).send({
        type: 'https://errors.coretrack.internal/forbidden',
        title: 'Access Denied',
        status: 403,
        error: 'FORBIDDEN',
        message: 'Only Admins and Super Admins can access Automation & SLA Engine.',
      });
      return false;
    }

    return true;
  }

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
      if (!(await requireAdminOrSuperAdmin(request, reply))) return;
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
      if (!(await requireAdminOrSuperAdmin(request, reply))) return;
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
      if (!(await requireAdminOrSuperAdmin(request, reply))) return;
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
      if (!(await requireAdminOrSuperAdmin(request, reply))) return;
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
    async (request, reply) => {
      if (!(await requireAdminOrSuperAdmin(request, reply))) return;
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
          mine: z.enum(['true', 'false']).optional(),
        }),
      },
    },
    async (request, reply) => {
      const { limit, mine } = request.query;
      let recipientFilter: string | undefined;
      if (mine === 'true') {
        const caller = await getCurrentUser(request);
        if (!caller) return reply.send({ data: [], total: 0 });
        recipientFilter = caller.email;
      } else {
        if (!(await requireAdminOrSuperAdmin(request, reply))) return;
      }

      try {
        const logs = await db.query.emailNotificationLogs.findMany({
          where: recipientFilter ? eq(emailNotificationLogs.recipientEmail, recipientFilter) : undefined,
          orderBy: desc(emailNotificationLogs.sentAt),
          limit,
        });
        return reply.send({
          data: logs,
          total: logs.length,
        });
      } catch (err) {
        request.log.warn({ err }, 'Failed to query emailNotificationLogs in /automation/email-logs');
        return reply.send({
          data: [],
          total: 0,
        });
      }
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
    async (request, reply) => {
      if (!(await requireAdminOrSuperAdmin(request, reply))) return;
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
    async (request, reply) => {
      if (!(await requireAdminOrSuperAdmin(request, reply))) return;
      const status = getProviderStatus();
      return reply.send({
        success: true,
        data: status,
      });
    }
  );

  // 9. Get Background Deadline Scheduler Status
  app.get(
    '/automation/scheduler',
    {
      schema: {
        description: 'Get active state, interval, last run, and next run of the recurring background deadline scanner',
        tags: ['Automation'],
      },
    },
    async (request, reply) => {
      if (!(await requireAdminOrSuperAdmin(request, reply))) return;
      const status = getSchedulerStatus();
      return reply.send({
        success: true,
        data: status,
      });
    }
  );

  // 10. Configure Background Deadline Scheduler (Admin & Super Admin only)
  app.post(
    '/automation/scheduler',
    {
      schema: {
        description: 'Toggle active status or adjust recurring scan interval for the deadline scanner',
        tags: ['Automation'],
        body: z.object({
          isActive: z.boolean().optional(),
          intervalMinutes: z.number().min(1).max(1440).optional(),
          runImmediately: z.boolean().optional(),
        }),
      },
    },
    async (request, reply) => {
      if (!(await requireAdminOrSuperAdmin(request, reply))) return;

      const updated = await updateSchedulerConfig(request.body);
      return reply.send({
        success: true,
        message: 'Deadline scheduler configuration updated successfully.',
        data: updated,
      });
    }
  );
};
