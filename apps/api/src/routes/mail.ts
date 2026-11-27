import { FastifyPluginAsync } from 'fastify';
import { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import {
  db,
  users,
  teams,
  teamMembers,
  projects,
  projectMembers,
  departments,
  emailNotificationLogs,
  tickets,
  eq,
  desc,
  and,
  or,
  inArray,
  ilike,
  sql,
} from '@coretrack/db';
import { getCurrentUser, getUserRoleTier } from '../auth/auth.js';
import { Permissions } from '@coretrack/shared';
import {
  getAppUrl,
  getProviderStatus,
  getMailProviders,
  getPreferredPrimaryProvider,
  setPreferredPrimaryProvider,
  sendDirectOrBroadcastEmail,
  sendEmailNotification,
} from '../services/email.js';

export const mailRoutes: FastifyPluginAsync = async (fastify) => {
  const app = fastify.withTypeProvider<ZodTypeProvider>();

  /**
   * Helper: enforce that caller is Super Admin (tier 5), Admin (tier 4), or Project Manager (tier 3)
   */
  async function requireExecutiveCaller(request: any, reply: any) {
    const user = await getCurrentUser(request);
    if (!user) {
      reply.status(401).send({ error: 'Authentication required' });
      return null;
    }

    const isOrgAdmin = (user.globalPermissions & Permissions.ORG_ADMIN) === Permissions.ORG_ADMIN;
    const tierInfo = await getUserRoleTier(user.id);

    // Super Admin (5), Admin (4), Project Manager (3)
    if (!isOrgAdmin && tierInfo.tier < 3) {
      reply.status(403).send({
        error: 'Access restricted: Mailing Center is only available to Super Admins, Admins, and Project Managers.',
        tier: tierInfo.tier,
        roleName: tierInfo.roleName,
      });
      return null;
    }

    return { user, tierInfo, isOrgAdmin };
  }

  // 1. Get Mail Provider Gateway & Aggregated Telemetry Status
  app.get(
    '/status',
    {
      schema: {
        description: 'Get mail provider failover status and transmission audit telemetry',
        tags: ['Mailing & Communications'],
      },
    },
    async (request, reply) => {
      const auth = await requireExecutiveCaller(request, reply);
      if (!auth) return;

      const providerStatus = getProviderStatus();

      // Aggregate log stats safely
      let allLogs: Array<{ status: string; provider: string | null }> = [];
      let recentLogs: any[] = [];
      try {
        allLogs = await db
          .select({
            status: emailNotificationLogs.status,
            provider: emailNotificationLogs.provider,
          })
          .from(emailNotificationLogs);

        recentLogs = await db
          .select()
          .from(emailNotificationLogs)
          .orderBy(desc(emailNotificationLogs.sentAt))
          .limit(5);
      } catch (err) {
        request.log.warn({ err }, 'Failed to query emailNotificationLogs in /status; returning empty telemetry');
      }

      const totalSent = allLogs.filter((l) => l.status === 'SENT').length;
      const totalFailed = allLogs.filter((l) => l.status === 'FAILED').length;
      const totalDispatched = allLogs.length;

      return reply.send({
        data: {
          ...providerStatus,
          telemetry: {
            totalDispatched,
            totalSent,
            totalFailed,
            successRate: totalDispatched > 0 ? Math.round((totalSent / totalDispatched) * 100) : 100,
            recentLogs,
          },
          caller: {
            id: auth.user.id,
            email: auth.user.email,
            fullName: auth.user.fullName,
            roleName: auth.tierInfo.roleName,
            tier: auth.tierInfo.tier,
          },
        },
      });
    }
  );

  // 1b. Select Primary Mail Gateway Server
  app.put(
    '/provider',
    {
      schema: {
        description: 'Select the active primary mail gateway server',
        tags: ['Mailing & Communications'],
        body: z.object({
          provider: z.enum(['RESEND', 'MAILJET', 'BREVO']),
        }),
      },
    },
    async (request, reply) => {
      const auth = await requireExecutiveCaller(request, reply);
      if (!auth) return;

      const { provider } = request.body;
      const previous = getPreferredPrimaryProvider();
      setPreferredPrimaryProvider(null);
      const configured = getMailProviders().some((p) => p.name === provider);
      if (!configured) {
        setPreferredPrimaryProvider(previous);
        return reply.status(400).send({
          error: `Gateway ${provider} is not configured in environment variables.`,
        });
      }

      setPreferredPrimaryProvider(provider);
      return reply.send({ data: getProviderStatus() });
    }
  );

  // 2. Get Potential Recipients Directory (Users, Projects, Departments)
  app.get(
    '/recipients',
    {
      schema: {
        description: 'Get available recipient targets for direct and inside communications',
        tags: ['Mailing & Communications'],
      },
    },
    async (request, reply) => {
      const auth = await requireExecutiveCaller(request, reply);
      if (!auth) return;

      const [allUsers, allProjects, allDepts] = await Promise.all([
        db
          .select({
            id: users.id,
            fullName: users.fullName,
            email: users.email,
            userType: users.userType,
            status: users.status,
          })
          .from(users)
          .where(eq(users.status, 'ACTIVE')),

        db
          .select({
            id: projects.id,
            key: projects.key,
            name: projects.name,
            projectType: projects.projectType,
            projectManagerId: projects.projectManagerId,
          })
          .from(projects)
          .where(eq(projects.archived, false)),

        db.select().from(departments),
      ]);

      return reply.send({
        data: {
          users: allUsers,
          projects: allProjects,
          departments: allDepts,
        },
      });
    }
  );

  // 3. Dispatch Direct or Internal Inside Mail
  app.post(
    '/send',
    {
      schema: {
        description: 'Send direct email to specific users or broadcast inside mail to project teams/staff',
        tags: ['Mailing & Communications'],
        body: z.object({
          recipientType: z.enum(['INDIVIDUAL', 'INTERNAL_ALL', 'PROJECT_TEAM', 'CUSTOM_EMAIL']),
          recipientUserIds: z.array(z.string().uuid()).optional(),
          customEmails: z.string().optional(), // Comma-separated or single email string
          projectId: z.string().uuid().optional(),
          ticketId: z.string().uuid().optional(),
          subject: z.string().min(3).max(255),
          category: z.string().default('DIRECT_MAIL'), // 'DIRECT_MAIL' | 'INTERNAL_ANNOUNCEMENT' | 'PROJECT_UPDATE' | 'URGENT_NOTICE' | 'TASK_DIRECTIVE' | 'INTERNAL_MEMO'
          categoryColor: z.string().optional(),
          priority: z.enum(['LOW', 'NORMAL', 'HIGH', 'URGENT']).default('NORMAL'),
          content: z.string().min(5),
          ctaText: z.string().optional(),
          ctaUrl: z.string().optional(),
          preferredProvider: z.enum(['RESEND', 'MAILJET', 'BREVO']).optional(),
        }),
      },
    },
    async (request, reply) => {
      const auth = await requireExecutiveCaller(request, reply);
      if (!auth) return;

      const {
        recipientType,
        recipientUserIds = [],
        customEmails,
        projectId,
        ticketId,
        subject,
        category,
        categoryColor,
        priority,
        content,
        ctaText,
        ctaUrl,
        preferredProvider,
      } = request.body;

      // Resolve targets: array of { email: string, fullName?: string }
      const targets: { email: string; fullName?: string }[] = [];
      let resolvedProjectName: string | undefined;

      if (projectId) {
        const proj = await db.query.projects.findFirst({
          where: eq(projects.id, projectId),
        });
        if (proj) resolvedProjectName = `${proj.name} (${proj.key})`;
      }

      if (recipientType === 'INDIVIDUAL') {
        if (!recipientUserIds.length) {
          return reply.status(400).send({ error: 'At least one recipient user must be selected.' });
        }
        const selectedUsers = await db
          .select({ email: users.email, fullName: users.fullName })
          .from(users)
          .where(inArray(users.id, recipientUserIds));

        for (const u of selectedUsers) {
          targets.push({ email: u.email, fullName: u.fullName });
        }
      } else if (recipientType === 'INTERNAL_ALL') {
        // Broadcast to all internal employees
        const internalUsers = await db
          .select({ email: users.email, fullName: users.fullName })
          .from(users)
          .where(and(eq(users.status, 'ACTIVE'), eq(users.userType, 'INTERNAL_EMPLOYEE')));

        for (const u of internalUsers) {
          targets.push({ email: u.email, fullName: u.fullName });
        }
      } else if (recipientType === 'PROJECT_TEAM') {
        if (!projectId) {
          return reply.status(400).send({ error: 'projectId is required for project team mail.' });
        }
        // Fetch all project members + project manager
        const members = await db
          .select({
            email: users.email,
            fullName: users.fullName,
          })
          .from(projectMembers)
          .innerJoin(users, eq(projectMembers.userId, users.id))
          .where(eq(projectMembers.projectId, projectId));

        const pmUser = await db
          .select({
            email: users.email,
            fullName: users.fullName,
          })
          .from(projects)
          .innerJoin(users, eq(projects.projectManagerId, users.id))
          .where(eq(projects.id, projectId));

        // Also check primary team members if assigned
        const teamAssigned = await db
          .select({
            email: users.email,
            fullName: users.fullName,
          })
          .from(projects)
          .innerJoin(teams, eq(projects.primaryTeamId, teams.id))
          .innerJoin(teamMembers, eq(teams.id, teamMembers.teamId))
          .innerJoin(users, eq(teamMembers.userId, users.id))
          .where(eq(projects.id, projectId));

        const emailSet = new Set<string>();
        for (const m of [...members, ...pmUser, ...teamAssigned]) {
          if (!emailSet.has(m.email.toLowerCase())) {
            emailSet.add(m.email.toLowerCase());
            targets.push({ email: m.email, fullName: m.fullName });
          }
        }

        // If project currently has no assigned members or PM, notify caller
        if (!targets.length) {
          targets.push({ email: auth.user.email, fullName: auth.user.fullName });
        }
      } else if (recipientType === 'CUSTOM_EMAIL') {
        if (!customEmails || !customEmails.trim()) {
          return reply.status(400).send({ error: 'customEmails string is required.' });
        }
        const parsedEmails = customEmails
          .split(/[,;\s]+/)
          .map((e) => e.trim())
          .filter((e) => e && e.includes('@'));

        if (!parsedEmails.length) {
          return reply.status(400).send({ error: 'No valid email addresses found.' });
        }

        for (const email of parsedEmails) {
          targets.push({ email });
        }
      }

      if (!targets.length) {
        return reply.status(400).send({ error: 'No recipients resolved for dispatch.' });
      }

      // Determine category badge color if not provided
      let badgeColor = categoryColor || '#2563eb';
      if (priority === 'URGENT') badgeColor = '#dc2626';
      else if (category === 'URGENT_NOTICE') badgeColor = '#dc2626';
      else if (category === 'PROJECT_UPDATE') badgeColor = '#059669';
      else if (category === 'INTERNAL_ANNOUNCEMENT') badgeColor = '#7c3aed';
      else if (category === 'TASK_DIRECTIVE') badgeColor = '#d97706';

      // Dispatched by current user
      const senderInfo = {
        fullName: auth.user.fullName,
        email: auth.user.email,
        roleName: auth.tierInfo.roleName,
      };

      const results = [];
      for (const target of targets) {
        try {
          const res = await sendDirectOrBroadcastEmail({
            recipient: target,
            subject: priority === 'URGENT' ? `[URGENT] ${subject}` : subject,
            category: category.replace(/_/g, ' '),
            categoryColor: badgeColor,
            content,
            sender: senderInfo,
            ctaText: ctaText || (resolvedProjectName ? 'Open Project' : 'Open CoreTrack'),
            ctaUrl: ctaUrl || (projectId ? `${getAppUrl()}/projects/${projectId}` : undefined),
            notificationType: category,
            projectId,
            ticketId,
            projectName: resolvedProjectName,
            preferredProvider,
          });
          results.push({ email: target.email, success: res.success, provider: res.provider, error: res.error });
        } catch (dispatchErr: any) {
          results.push({ email: target.email, success: false, error: dispatchErr.message });
        }
      }

      const successCount = results.filter((r) => r.success).length;

      return reply.send({
        data: {
          success: true,
          message: `Dispatched mail to ${successCount} of ${targets.length} recipients.`,
          totalTargets: targets.length,
          successCount,
          results,
        },
      });
    }
  );

  // 4. Get Mail Audit & Delivery Logs
  app.get(
    '/logs',
    {
      schema: {
        description: 'Get paginated email dispatch audit logs with filter and search capabilities',
        tags: ['Mailing & Communications'],
        querystring: z.object({
          status: z.enum(['ALL', 'SENT', 'FAILED']).optional().default('ALL'),
          search: z.string().optional(),
          page: z.coerce.number().min(1).default(1),
          limit: z.coerce.number().min(1).max(100).default(25),
        }),
      },
    },
    async (request, reply) => {
      const auth = await requireExecutiveCaller(request, reply);
      if (!auth) return;

      const { status, search, page, limit } = request.query;
      const offset = (page - 1) * limit;

      // Build WHERE conditions
      const conditions = [];

      if (status && status !== 'ALL') {
        conditions.push(eq(emailNotificationLogs.status, status));
      }

      if (search && search.trim()) {
        const term = `%${search.trim()}%`;
        conditions.push(
          or(
            ilike(emailNotificationLogs.recipientEmail, term),
            ilike(emailNotificationLogs.recipientName, term),
            ilike(emailNotificationLogs.subject, term)
          )
        );
      }

      const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

      let logs: any[] = [];
      let total = 0;
      try {
        const [logsRes, countResult] = await Promise.all([
          db
            .select()
            .from(emailNotificationLogs)
            .where(whereClause)
            .orderBy(desc(emailNotificationLogs.sentAt))
            .limit(limit)
            .offset(offset),

          db
            .select({ count: sql<number>`count(*)` })
            .from(emailNotificationLogs)
            .where(whereClause),
        ]);
        logs = logsRes;
        total = Number(countResult[0]?.count || 0);
      } catch (err) {
        request.log.warn({ err }, 'Failed to query emailNotificationLogs in /logs');
      }

      return reply.send({
        data: {
          logs,
          pagination: {
            total,
            page,
            limit,
            totalPages: Math.ceil(total / limit) || 1,
          },
        },
      });
    }
  );

  // 5. Re-dispatch / Resend Email from Log
  app.post(
    '/resend/:id',
    {
      schema: {
        description: 'Re-attempt dispatch of an existing email notification log record',
        tags: ['Mailing & Communications'],
        params: z.object({
          id: z.string().uuid(),
        }),
      },
    },
    async (request, reply) => {
      const auth = await requireExecutiveCaller(request, reply);
      if (!auth) return;

      const log = await db.query.emailNotificationLogs.findFirst({
        where: eq(emailNotificationLogs.id, request.params.id),
      });

      if (!log) {
        return reply.status(404).send({ error: 'Mail log not found' });
      }

      const res = log.htmlBody
        ? await sendEmailNotification({
            to: log.recipientEmail,
            toName: log.recipientName || undefined,
            subject: log.subject,
            html: log.htmlBody,
            text: log.textBody || log.subject,
            notificationType: log.notificationType,
            projectId: log.projectId || undefined,
            ticketId: log.ticketId || undefined,
          })
        : await sendDirectOrBroadcastEmail({
            recipient: {
              email: log.recipientEmail,
              fullName: log.recipientName || log.recipientEmail,
            },
            subject: log.subject,
            category: log.notificationType.replace(/_/g, ' '),
            categoryColor: '#2563eb',
            headline: log.subject,
            greeting: `Hello ${log.recipientName || 'there'},`,
            content: `This is a re-sent notification from CoreTrack regarding: <strong>${log.subject}</strong>.<br/><br/>Please sign in to your CoreTrack workspace to view the full details.`,
            sender: {
              fullName: auth.user.fullName,
              email: auth.user.email,
              roleName: auth.tierInfo.roleName,
            },
            ctaText: 'Open CoreTrack Workspace',
            ctaUrl: `${getAppUrl()}/login`,
            notificationType: log.notificationType,
            projectId: log.projectId || undefined,
            ticketId: log.ticketId || undefined,
          });

      return reply.send({
        data: {
          success: res.success,
          provider: res.provider,
          error: res.error,
        },
      });
    }
  );
};
