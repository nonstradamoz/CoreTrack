import { FastifyPluginAsync } from 'fastify';
import { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { db, tickets, projects, users, eq, desc } from '@coretrack/db';
import { calculateSLADueDates } from '@coretrack/shared';
import { broadcastToProject } from '../ws.js';

function mapTicketType(val?: string): 'TASK' | 'BUG' | 'STORY' | 'INCIDENT' | 'SERVICE_REQUEST' {
  const norm = (val || '').toUpperCase().trim();
  if (norm.includes('BUG') || norm.includes('DEFECT')) return 'BUG';
  if (norm.includes('STORY')) return 'STORY';
  if (norm.includes('INCIDENT')) return 'INCIDENT';
  if (norm.includes('REQUEST')) return 'SERVICE_REQUEST';
  return 'TASK';
}

function mapPriority(val?: string): 'URGENT' | 'HIGH' | 'MEDIUM' | 'LOW' {
  const norm = (val || '').toUpperCase().trim();
  if (norm.includes('URGENT') || norm.includes('BLOCKER') || norm === 'P1') return 'URGENT';
  if (norm.includes('HIGH') || norm.includes('CRITICAL') || norm === 'P2') return 'HIGH';
  if (norm.includes('LOW') || norm.includes('TRIVIAL') || norm === 'P4') return 'LOW';
  return 'MEDIUM';
}

function mapStatus(val?: string): 'TODO' | 'IN_PROGRESS' | 'IN_REVIEW' | 'DONE' {
  const norm = (val || '').toUpperCase().trim();
  if (norm.includes('DONE') || norm.includes('CLOSED') || norm.includes('RESOLVED')) return 'DONE';
  if (norm.includes('REVIEW')) return 'IN_REVIEW';
  if (norm.includes('PROGRESS') || norm.includes('DOING')) return 'IN_PROGRESS';
  return 'TODO';
}

function escapeCsvField(val: unknown): string {
  if (val === null || val === undefined) return '';
  const str = String(val);
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export const importExportRoutes: FastifyPluginAsync = async (fastify) => {
  const app = fastify.withTypeProvider<ZodTypeProvider>();

  // 1. Batch Import Tasks (from CSV or Jira JSON structure)
  app.post(
    '/:projectKey/import/batch',
    {
      schema: {
        description: 'Batch import tasks into a project from CSV or Jira structure',
        tags: ['Import/Export'],
        params: z.object({
          projectKey: z.string(),
        }),
        body: z.object({
          tasks: z.array(
            z.object({
              title: z.string().min(1, 'Title is required'),
              description: z.string().optional(),
              ticketType: z.string().optional(),
              priority: z.string().optional(),
              status: z.string().optional(),
              storyPoints: z.number().optional(),
              dueDate: z.string().optional(),
              assigneeEmail: z.string().optional(),
            })
          ).min(1, 'At least one task must be provided for import'),
        }),
      },
    },
    async (request, reply) => {
      const { projectKey } = request.params;
      const { tasks: importList } = request.body;

      const proj = await db.query.projects.findFirst({
        where: eq(projects.key, projectKey),
      });

      if (!proj) {
        return reply.status(404).send({ error: 'Project not found' });
      }

      const defaultUser = await db.query.users.findFirst();
      const reporterId = defaultUser?.id || '00000000-0000-0000-0000-000000000001';

      const importedKeys: string[] = [];
      let currentNum = proj.nextTicketNumber;

      for (const item of importList) {
        const ticketKey = `${projectKey}-${currentNum}`;
        const finalType = mapTicketType(item.ticketType);
        const finalPriority = mapPriority(item.priority);
        const finalStatus = mapStatus(item.status);

        // Find assignee by email if provided
        let assigneeId: string | undefined = undefined;
        if (item.assigneeEmail) {
          const u = await db.query.users.findFirst({
            where: eq(users.email, item.assigneeEmail.trim()),
          });
          assigneeId = u?.id;
        }

        // Apply SLA countdowns
        const { responseDueAt, resolutionDueAt } = calculateSLADueDates(finalPriority);

        // Apply Smart Deadline (default 7 days if assigned and none provided)
        let dueDate: Date | undefined = item.dueDate ? new Date(item.dueDate) : undefined;
        if (!dueDate && assigneeId) {
          dueDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
        }

        const [created] = await db
          .insert(tickets)
          .values({
            projectId: proj.id,
            ticketKey,
            ticketNumber: currentNum,
            ticketType: finalType,
            title: item.title.trim(),
            description: item.description?.trim() || '',
            priority: finalPriority,
            status: finalStatus,
            storyPoints: item.storyPoints,
            assigneeId,
            dueDate,
            slaResponseDueAt: responseDueAt,
            slaResolutionDueAt: resolutionDueAt,
            isSlaPaused: ['DONE', 'RESOLVED'].includes(finalStatus),
            reporterId,
          })
          .returning();

        importedKeys.push(created.ticketKey);
        currentNum++;

        broadcastToProject(projectKey, {
          type: 'TICKET_CREATED',
          payload: created,
        });
      }

      // Update project sequence number
      await db
        .update(projects)
        .set({ nextTicketNumber: currentNum })
        .where(eq(projects.id, proj.id));

      return reply.status(201).send({
        success: true,
        importedCount: importedKeys.length,
        ticketKeys: importedKeys,
      });
    }
  );

  // 2. Export Project Tasks as CSV (RFC 4180 standard)
  app.get(
    '/:projectKey/export/csv',
    {
      schema: {
        description: 'Export all project tasks as a standard RFC 4180 CSV document',
        tags: ['Import/Export'],
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

      const allTickets = await db.query.tickets.findMany({
        where: eq(tickets.projectId, proj.id),
        orderBy: desc(tickets.createdAt),
        with: {
          assignee: true,
          reporter: true,
        },
      });

      const header = ['Key', 'Type', 'Title', 'Status', 'Priority', 'Points', 'Assignee', 'Deadline', 'Created At'];
      const rows = allTickets.map((t) => [
        escapeCsvField(t.ticketKey),
        escapeCsvField(t.ticketType),
        escapeCsvField(t.title),
        escapeCsvField(t.status),
        escapeCsvField(t.priority),
        escapeCsvField(t.storyPoints ?? ''),
        escapeCsvField(t.assignee?.fullName ?? 'Unassigned'),
        escapeCsvField(t.dueDate ? new Date(t.dueDate).toISOString().split('T')[0] : ''),
        escapeCsvField(new Date(t.createdAt).toISOString()),
      ]);

      const csvContent = [header.join(','), ...rows.map((r) => r.join(','))].join('\r\n');

      reply.header('Content-Type', 'text/csv; charset=utf-8');
      reply.header('Content-Disposition', `attachment; filename="${projectKey}-tasks-export.csv"`);
      return reply.send(csvContent);
    }
  );
};
