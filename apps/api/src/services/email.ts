import nodemailer, { type Transporter } from 'nodemailer';
import { db, emailNotificationLogs, eq } from '@coretrack/db';

export function getAppUrl(): string {
  const configured = process.env.APP_URL?.trim().replace(/\/$/, '');
  if (configured) return configured;
  return process.env.NODE_ENV === 'production'
    ? 'https://core-track-inky.vercel.app'
    : 'http://localhost:3000';
}

function getEnvConfig() {
  return {
    RESEND_API_KEY: process.env.RESEND_API_KEY || '',
    RESEND_FROM: process.env.RESEND_FROM || '',
    MAILJET_API_KEY: process.env.MAILJET_API_KEY || '',
    MAILJET_SECRET_KEY: process.env.MAILJET_SECRET_KEY || '',
    MAILJET_FROM: process.env.MAILJET_FROM || '',
    BREVO_API_KEY: process.env.BREVO_API_KEY || '',
    BREVO_FROM: process.env.BREVO_FROM || '',
    SMTP_HOST: process.env.SMTP_HOST || '',
    SMTP_PORT: parseInt(process.env.SMTP_PORT || '587', 10),
    SMTP_SECURE: process.env.SMTP_SECURE === 'true',
    SMTP_USER: process.env.SMTP_USER || '',
    SMTP_PASS: process.env.SMTP_PASS || '',
    SMTP_FROM: process.env.SMTP_FROM || 'CoreTrack Notifications <notifications@coretrack.internal>',
    APP_URL: getAppUrl(),
  };
}

const APP_URL = getAppUrl();

export interface EmailProviderConfig {
  name: 'RESEND' | 'MAILJET' | 'BREVO';
  priority: number;
  from: string;
  transporter: Transporter;
}

let mockProviderChainOverride: EmailProviderConfig[] | null = null;
let preferredPrimaryProvider: EmailProviderConfig['name'] | null = null;

export function setMockProviderChain(chain: EmailProviderConfig[] | null) {
  mockProviderChainOverride = chain;
}

export function getPreferredPrimaryProvider(): EmailProviderConfig['name'] | null {
  return preferredPrimaryProvider;
}

export function setPreferredPrimaryProvider(provider: EmailProviderConfig['name'] | null) {
  preferredPrimaryProvider = provider;
}

/**
 * Builds the prioritized chain of email providers for automatic failover.
 * Priority 1: Resend (if configured)
 * Priority 2: Mailjet (if configured)
 * Priority 3: Brevo (if configured)
 */
export function getMailProviders(): EmailProviderConfig[] {
  if (mockProviderChainOverride) {
    return mockProviderChainOverride;
  }

  const {
    RESEND_API_KEY,
    RESEND_FROM,
    MAILJET_API_KEY,
    MAILJET_SECRET_KEY,
    MAILJET_FROM,
    BREVO_API_KEY,
    BREVO_FROM,
    SMTP_HOST,
    SMTP_USER,
    SMTP_PASS,
    SMTP_FROM,
  } = getEnvConfig();

  const providers: EmailProviderConfig[] = [];

  // Provider 1: Resend (HTTPS REST API — works on Render & cloud hosts where SMTP ports are blocked)
  if (
    (RESEND_API_KEY && !RESEND_API_KEY.includes('your_resend_api_key')) ||
    (SMTP_HOST && SMTP_HOST.includes('resend'))
  ) {
    const resendKey = RESEND_API_KEY || SMTP_PASS;
    const resendFrom = RESEND_FROM || SMTP_FROM || 'CoreTrack <onboarding@resend.dev>';
    const resendHttpTransporter = {
      sendMail: async (mailOpts: any) => {
        const toList = Array.isArray(mailOpts.to) ? mailOpts.to : [mailOpts.to];
        const response = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${resendKey}`,
          },
          body: JSON.stringify({
            from: mailOpts.from || resendFrom,
            to: toList,
            subject: mailOpts.subject,
            html: mailOpts.html,
            text: mailOpts.text,
          }),
          signal: AbortSignal.timeout(10000),
        });
        const data = (await response.json().catch(() => ({}))) as any;
        if (!response.ok) {
          throw new Error(data.message || data.error || `Resend API HTTP ${response.status}`);
        }
        return { messageId: data.id };
      },
    } as unknown as Transporter;

    providers.push({
      name: 'RESEND',
      priority: 1,
      from: resendFrom,
      transporter: resendHttpTransporter,
    });
  }

  // Provider 2: Mailjet (HTTPS REST API v3.1 — works on Render & cloud hosts)
  if (
    (MAILJET_API_KEY &&
      MAILJET_SECRET_KEY &&
      !MAILJET_API_KEY.includes('your_mailjet_api_key')) ||
    (SMTP_HOST && SMTP_HOST.includes('mailjet'))
  ) {
    const mjKey = MAILJET_API_KEY || SMTP_USER;
    const mjSecret = MAILJET_SECRET_KEY || SMTP_PASS;
    const mjFrom = MAILJET_FROM || SMTP_FROM;

    const parseEmailAddress = (raw: string): { Email: string; Name?: string } => {
      const match = raw.match(/^(?:"?([^"]*)"?\s*)?<([^>]+)>$/);
      if (match) {
        return { Email: match[2].trim(), Name: match[1]?.trim() || undefined };
      }
      return { Email: raw.trim() };
    };

    const mailjetHttpTransporter = {
      sendMail: async (mailOpts: any) => {
        const toRaw = Array.isArray(mailOpts.to) ? mailOpts.to : [mailOpts.to];
        const authToken = Buffer.from(`${mjKey}:${mjSecret}`).toString('base64');
        const response = await fetch('https://api.mailjet.com/v3.1/send', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Basic ${authToken}`,
          },
          body: JSON.stringify({
            Messages: [
              {
                From: parseEmailAddress(mailOpts.from || mjFrom),
                To: toRaw.map((t: string) => parseEmailAddress(t)),
                Subject: mailOpts.subject,
                HTMLPart: mailOpts.html,
                TextPart: mailOpts.text,
              },
            ],
          }),
          signal: AbortSignal.timeout(10000),
        });
        const data = (await response.json().catch(() => ({}))) as any;
        if (!response.ok) {
          throw new Error(data.ErrorMessage || data.message || `Mailjet API HTTP ${response.status}`);
        }
        return { messageId: data.Messages?.[0]?.To?.[0]?.MessageID };
      },
    } as unknown as Transporter;

    providers.push({
      name: 'MAILJET',
      priority: providers.length + 1,
      from: mjFrom,
      transporter: mailjetHttpTransporter,
    });
  }

  // Provider 3: Brevo (Sendinblue HTTP API v3 / SMTP Relay)
  if (
    (BREVO_API_KEY && !BREVO_API_KEY.includes('your_brevo_api_key')) ||
    (SMTP_HOST && SMTP_HOST.includes('brevo'))
  ) {
    // Custom transporter that dispatches via Brevo REST API v3
    const brevoHttpTransporter = {
      sendMail: async (mailOpts: any) => {
        const toRecipients = Array.isArray(mailOpts.to)
          ? mailOpts.to.map((t: string) => ({ email: t }))
          : [{ email: mailOpts.to }];

        const payload = {
          sender: {
            name: 'CoreTrack',
            email: BREVO_FROM || 'akshaidpillai@gmail.com',
          },
          to: toRecipients,
          subject: mailOpts.subject,
          htmlContent: mailOpts.html,
          textContent: mailOpts.text,
        };

        const response = await fetch('https://api.brevo.com/v3/smtp/email', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'api-key': BREVO_API_KEY,
          },
          body: JSON.stringify(payload),
        });

        const data = (await response.json()) as any;
        if (!response.ok) {
          throw new Error(data.message || `Brevo API HTTP ${response.status}`);
        }
        return { messageId: data.messageId };
      },
    } as unknown as Transporter;

    providers.push({
      name: 'BREVO',
      priority: providers.length + 1,
      from: BREVO_FROM || SMTP_FROM || 'CoreTrack <akshaidpillai@gmail.com>',
      transporter: brevoHttpTransporter,
    });
  }

  // Reorder if a preferred primary provider is selected
  if (preferredPrimaryProvider) {
    const idx = providers.findIndex((p) => p.name === preferredPrimaryProvider);
    if (idx > 0) {
      const [chosen] = providers.splice(idx, 1);
      providers.unshift(chosen);
    }
  }

  // Re-number priorities sequentially
  return providers.map((p, i) => ({
    ...p,
    priority: i + 1,
  }));
}

export function getProviderStatus() {
  const active = getMailProviders();
  const { SMTP_FROM } = getEnvConfig();
  const catalogNames: EmailProviderConfig['name'][] = ['RESEND', 'MAILJET', 'BREVO'];

  const activeMap = new Map(active.map((p) => [p.name, p]));
  const allGateways = catalogNames.map((name, idx) => {
    const found = activeMap.get(name);
    return {
      name,
      priority: found ? found.priority : idx + 10,
      from: found ? found.from : SMTP_FROM,
      configured: Boolean(found),
      isPrimary: active[0]?.name === name,
    };
  });

  return {
    providers: active.map((p) => ({
      name: p.name,
      priority: p.priority,
      from: p.from,
      configured: true,
      isPrimary: active[0]?.name === p.name,
    })),
    allGateways,
    failoverEnabled: active.length > 1,
    primaryProvider: active[0]?.name || 'NONE',
    fallbackProvider: active[1]?.name || null,
  };
}

export interface EmailDispatchOptions {
  to: string;
  toName?: string;
  subject: string;
  html: string;
  text?: string;
  notificationType:
    | 'TASK_ASSIGNED'
    | 'PROJECT_ASSIGNED'
    | 'TASK_OVERDUE'
    | 'PROJECT_OVERDUE'
    | 'SPRINT_PROMOTED'
    | 'DIRECT_MAIL'
    | 'INTERNAL_ANNOUNCEMENT'
    | 'PROJECT_UPDATE'
    | 'URGENT_NOTICE'
    | 'INTERNAL_MEMO'
    | 'TASK_DIRECTIVE'
    | string;
  ticketId?: string;
  projectId?: string;
}

/**
 * Dispatches an email notification with automatic multi-provider failover.
 * If Provider 1 (e.g. Resend) exhausts quota or errors out, automatically kicks in Provider 2 (e.g. Mailjet).
 */
export async function sendEmailNotification(options: EmailDispatchOptions): Promise<{
  success: boolean;
  provider?: string;
  failoverOccurred?: boolean;
  logId?: string;
  error?: string;
}> {
  const { to, toName, subject, html, text, notificationType, ticketId, projectId } = options;

  let logId: string | undefined;
  try {
    const [inserted] = await db
      .insert(emailNotificationLogs)
      .values({
        recipientEmail: to,
        recipientName: toName,
        subject,
        notificationType,
        ticketId,
        projectId,
        provider: 'PENDING',
        status: 'SENT',
      })
      .returning({ id: emailNotificationLogs.id });
    logId = inserted?.id;
  } catch (dbErr) {
    console.error('Failed to pre-log email dispatch:', dbErr);
  }

  const providers = getMailProviders();
  const errors: string[] = [];
  let successfulProvider: string | null = null;
  let failoverOccurred = false;

  for (let i = 0; i < providers.length; i++) {
    const provider = providers[i];
    try {
      const info = await provider.transporter.sendMail({
        from: provider.from,
        to: toName ? `"${toName}" <${to}>` : to,
        subject,
        html,
        text: text || subject,
      });

      successfulProvider = provider.name;
      if (i > 0) {
        failoverOccurred = true;
        console.warn(
          `[Email Failover] Successfully sent email to ${to} via ${provider.name} after failure from: ${errors.join(', ')}`
        );
      }
      break;
    } catch (err: any) {
      const errMsg = err?.message || 'Transmission failed';
      errors.push(`${provider.name} (${errMsg})`);
      console.warn(`[Email Provider Notice] ${provider.name} failed for ${to}: ${errMsg}`);
    }
  }

  if (successfulProvider) {
    if (logId) {
      try {
        await db
          .update(emailNotificationLogs)
          .set({
            provider: successfulProvider,
            status: 'SENT',
            errorMessage: failoverOccurred ? `Failover: ${errors.join('; ')}` : null,
          })
          .where(eq(emailNotificationLogs.id, logId));
      } catch {
        // preserve
      }
    }

    return {
      success: true,
      provider: successfulProvider,
      failoverOccurred,
      logId,
    };
  }

  // All providers failed
  const finalError = errors.length > 0 ? errors.join('; ') : 'No mail gateway configured';
  if (logId) {
    try {
      await db
        .update(emailNotificationLogs)
        .set({
          provider: providers[0]?.name || 'NONE',
          status: 'FAILED',
          errorMessage: finalError,
        })
        .where(eq(emailNotificationLogs.id, logId));
    } catch {
      // preserve
    }
  }

  return {
    success: false,
    provider: providers[0]?.name || 'NONE',
    logId,
    error: finalError,
  };
}

/**
 * Shared Branded HTML Layout
 */
function renderEmailTemplate(params: {
  category: string;
  categoryColor: string;
  headline: string;
  greeting: string;
  contentHtml: string;
  ctaText: string;
  ctaUrl: string;
  footerNote?: string;
}): string {
  const { category, categoryColor, headline, greeting, contentHtml, ctaText, ctaUrl, footerNote } = params;

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${headline}</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f8fafc; margin: 0; padding: 24px; color: #1e293b; }
    .card { max-width: 600px; margin: 0 auto; background: #ffffff; border: 1px solid #e2e8f0; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05); }
    .header { padding: 24px 32px; background: #0f172a; color: #ffffff; display: flex; align-items: center; justify-content: space-between; }
    .logo-badge { font-weight: 800; font-size: 16px; letter-spacing: -0.5px; color: #3b82f6; }
    .category-badge { font-size: 11px; font-weight: 700; text-transform: uppercase; padding: 4px 10px; border-radius: 9999px; background: ${categoryColor}; color: #ffffff; }
    .body { padding: 32px; }
    .headline { font-size: 20px; font-weight: 800; color: #0f172a; margin-top: 0; margin-bottom: 8px; }
    .greeting { font-size: 14px; color: #64748b; margin-bottom: 20px; }
    .content-box { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; padding: 20px; margin-bottom: 24px; font-size: 13px; line-height: 1.6; }
    .cta-button { display: inline-block; padding: 12px 24px; background: #2563eb; color: #ffffff !important; font-size: 13px; font-weight: 700; text-decoration: none; border-radius: 10px; }
    .footer { padding: 20px 32px; background: #f1f5f9; border-top: 1px solid #e2e8f0; font-size: 11px; color: #94a3b8; text-align: center; }
  </style>
</head>
<body>
  <div class="card">
    <div class="header">
      <div class="logo-badge">CoreTrack</div>
      <div class="category-badge">${category}</div>
    </div>
    <div class="body">
      <h1 class="headline">${headline}</h1>
      <div class="greeting">${greeting}</div>
      <div class="content-box">
        ${contentHtml}
      </div>
      <div>
        <a href="${ctaUrl}" class="cta-button" target="_blank">${ctaText} &rarr;</a>
      </div>
    </div>
    <div class="footer">
      ${footerNote || 'This is an automated system notification from CoreTrack Task & Project Management.'}
      <br>Amrita Vishwa Vidyapeetham Enterprise Solutions
    </div>
  </div>
</body>
</html>
  `.trim();
}

/**
 * 1. Notification: Task Assigned to Employee
 */
export async function sendTaskAssignedNotification(params: {
  recipient: { email: string; fullName?: string };
  ticket: { id: string; ticketKey: string; title: string; priority: string; dueDate?: Date | string | null };
  project: { id: string; key: string; name: string };
  assignedByName?: string;
}) {
  const { recipient, ticket, project, assignedByName } = params;
  const deadlineStr = ticket.dueDate ? new Date(ticket.dueDate).toLocaleDateString() : 'No deadline specified';
  const taskUrl = `${APP_URL}/?projectKey=${project.key}&ticket=${ticket.ticketKey}`;

  const html = renderEmailTemplate({
    category: 'Task Assigned',
    categoryColor: '#2563eb',
    headline: `New Task Assignment: ${ticket.ticketKey}`,
    greeting: `Hello ${recipient.fullName || 'Team Member'},`,
    contentHtml: `
      <p style="margin: 0 0 10px 0;">You have been assigned to work on the following task in <strong>${project.name}</strong>:</p>
      <div style="font-size: 15px; font-weight: 700; color: #0f172a; margin-bottom: 8px;">
        [${ticket.ticketKey}] ${ticket.title}
      </div>
      <table style="width: 100%; border-collapse: collapse; margin-top: 12px; font-size: 12px;">
        <tr>
          <td style="color: #64748b; padding: 4px 0;">Project:</td>
          <td style="font-weight: 600; padding: 4px 0;">${project.name} (${project.key})</td>
        </tr>
        <tr>
          <td style="color: #64748b; padding: 4px 0;">Priority:</td>
          <td style="font-weight: 600; padding: 4px 0; color: ${ticket.priority === 'URGENT' ? '#e11d48' : '#2563eb'};">${ticket.priority}</td>
        </tr>
        <tr>
          <td style="color: #64748b; padding: 4px 0;">Deadline:</td>
          <td style="font-weight: 600; padding: 4px 0;">${deadlineStr}</td>
        </tr>
        ${assignedByName ? `<tr><td style="color: #64748b; padding: 4px 0;">Assigned by:</td><td style="font-weight: 600; padding: 4px 0;">${assignedByName}</td></tr>` : ''}
      </table>
    `,
    ctaText: 'Open Task in Kanban Board',
    ctaUrl: taskUrl,
  });

  return sendEmailNotification({
    to: recipient.email,
    toName: recipient.fullName,
    subject: `[Assigned] ${ticket.ticketKey}: ${ticket.title} (${project.key})`,
    html,
    notificationType: 'TASK_ASSIGNED',
    ticketId: ticket.id,
    projectId: project.id,
  });
}

/**
 * 2. Notification: Project Allocated to Member / PM / Lead
 */
export async function sendProjectAssignedNotification(params: {
  recipient: { email: string; fullName?: string };
  project: { id: string; key: string; name: string; description?: string | null; deadline?: Date | string | null };
  roleName: string;
  assignedByName?: string;
}) {
  const { recipient, project, roleName, assignedByName } = params;
  const deadlineStr = project.deadline ? new Date(project.deadline).toLocaleDateString() : 'Continuous';
  const projectUrl = `${APP_URL}/projects/${project.key}`;

  const html = renderEmailTemplate({
    category: 'Project Allocation',
    categoryColor: '#059669',
    headline: `Project Allocation: ${project.name}`,
    greeting: `Hello ${recipient.fullName || 'Team Member'},`,
    contentHtml: `
      <p style="margin: 0 0 10px 0;">You have been assigned to project <strong>${project.name} (${project.key})</strong>.</p>
      <table style="width: 100%; border-collapse: collapse; margin-top: 12px; font-size: 12px;">
        <tr>
          <td style="color: #64748b; padding: 4px 0;">Your Assigned Role:</td>
          <td style="font-weight: 700; color: #059669; padding: 4px 0;">${roleName}</td>
        </tr>
        <tr>
          <td style="color: #64748b; padding: 4px 0;">Project Key:</td>
          <td style="font-weight: 600; font-family: monospace; padding: 4px 0;">${project.key}</td>
        </tr>
        <tr>
          <td style="color: #64748b; padding: 4px 0;">Project Deadline:</td>
          <td style="font-weight: 600; padding: 4px 0;">${deadlineStr}</td>
        </tr>
        ${assignedByName ? `<tr><td style="color: #64748b; padding: 4px 0;">Allocated by:</td><td style="font-weight: 600; padding: 4px 0;">${assignedByName}</td></tr>` : ''}
      </table>
      ${project.description ? `<p style="margin: 14px 0 0 0; color: #475569; font-style: italic;">"${project.description}"</p>` : ''}
    `,
    ctaText: 'View Project Details',
    ctaUrl: projectUrl,
  });

  return sendEmailNotification({
    to: recipient.email,
    toName: recipient.fullName,
    subject: `[Project Assigned] ${project.name} (${project.key}) - Role: ${roleName}`,
    html,
    notificationType: 'PROJECT_ASSIGNED',
    projectId: project.id,
  });
}

/**
 * 3. Escalation Notification: Overdue Task Sent to Higher Authorities
 */
export async function sendTaskOverdueEscalationNotification(params: {
  recipient: { email: string; fullName?: string };
  ticket: { id: string; ticketKey: string; title: string; status: string; priority: string; dueDate: Date | string };
  project: { id: string; key: string; name: string };
  assigneeName?: string;
}) {
  const { recipient, ticket, project, assigneeName } = params;
  const deadlineStr = new Date(ticket.dueDate).toLocaleString();
  const taskUrl = `${APP_URL}/?projectKey=${project.key}&ticket=${ticket.ticketKey}`;

  const html = renderEmailTemplate({
    category: 'Overdue Escalation',
    categoryColor: '#dc2626',
    headline: `URGENT: Task Overdue Deadline - ${ticket.ticketKey}`,
    greeting: `Attention ${recipient.fullName || 'Authority'},`,
    contentHtml: `
      <p style="margin: 0 0 10px 0; color: #b91c1c; font-weight: 600;">
        Task <strong>${ticket.ticketKey}</strong> has exceeded its assigned deadline and remains incomplete.
      </p>
      <div style="font-size: 15px; font-weight: 700; color: #0f172a; margin-bottom: 8px;">
        [${ticket.ticketKey}] ${ticket.title}
      </div>
      <table style="width: 100%; border-collapse: collapse; margin-top: 12px; font-size: 12px;">
        <tr>
          <td style="color: #64748b; padding: 4px 0;">Project:</td>
          <td style="font-weight: 600; padding: 4px 0;">${project.name} (${project.key})</td>
        </tr>
        <tr>
          <td style="color: #64748b; padding: 4px 0;">Current Status:</td>
          <td style="font-weight: 600; padding: 4px 0; color: #d97706;">${ticket.status}</td>
        </tr>
        <tr>
          <td style="color: #64748b; padding: 4px 0;">Assignee:</td>
          <td style="font-weight: 600; padding: 4px 0;">${assigneeName || 'Unassigned'}</td>
        </tr>
        <tr>
          <td style="color: #64748b; padding: 4px 0;">Target Deadline:</td>
          <td style="font-weight: 700; color: #dc2626; padding: 4px 0;">${deadlineStr} (OVERDUE)</td>
        </tr>
      </table>
    `,
    ctaText: 'Review Overdue Task',
    ctaUrl: taskUrl,
    footerNote: 'Escalated automatically to Project Management and Team Leads under the CoreTrack SLA policy.',
  });

  return sendEmailNotification({
    to: recipient.email,
    toName: recipient.fullName,
    subject: `[ESCALATION - OVERDUE] Task ${ticket.ticketKey} in ${project.name}`,
    html,
    notificationType: 'TASK_OVERDUE',
    ticketId: ticket.id,
    projectId: project.id,
  });
}

/**
 * 4. Escalation Notification: Overdue Project Sent to Higher Authorities
 */
export async function sendProjectOverdueEscalationNotification(params: {
  recipient: { email: string; fullName?: string };
  project: { id: string; key: string; name: string; deadline: Date | string; progressPercentage?: number };
  pmName?: string;
  unfinishedTicketsCount: number;
}) {
  const { recipient, project, pmName, unfinishedTicketsCount } = params;
  const deadlineStr = new Date(project.deadline).toLocaleDateString();
  const projectUrl = `${APP_URL}/projects/${project.key}`;

  const html = renderEmailTemplate({
    category: 'Project Overdue Alert',
    categoryColor: '#b91c1c',
    headline: `CRITICAL: Project Passed Deadline - ${project.name}`,
    greeting: `Attention ${recipient.fullName || 'Executive Authority'},`,
    contentHtml: `
      <p style="margin: 0 0 10px 0; color: #b91c1c; font-weight: 600;">
        Project <strong>${project.name} (${project.key})</strong> has passed its target delivery deadline with unfinished deliverables.
      </p>
      <table style="width: 100%; border-collapse: collapse; margin-top: 12px; font-size: 12px;">
        <tr>
          <td style="color: #64748b; padding: 4px 0;">Project Manager:</td>
          <td style="font-weight: 600; padding: 4px 0;">${pmName || 'None assigned'}</td>
        </tr>
        <tr>
          <td style="color: #64748b; padding: 4px 0;">Target Deadline:</td>
          <td style="font-weight: 700; color: #b91c1c; padding: 4px 0;">${deadlineStr}</td>
        </tr>
        <tr>
          <td style="color: #64748b; padding: 4px 0;">Unfinished Tasks:</td>
          <td style="font-weight: 700; padding: 4px 0;">${unfinishedTicketsCount} items pending</td>
        </tr>
      </table>
    `,
    ctaText: 'Open Project Governance',
    ctaUrl: projectUrl,
    footerNote: 'Dispatched to Project Managers, Reviewers, and Organization Administrators.',
  });

  return sendEmailNotification({
    to: recipient.email,
    toName: recipient.fullName,
    subject: `[CRITICAL ESCALATION] Project ${project.name} (${project.key}) Overdue`,
    html,
    notificationType: 'PROJECT_OVERDUE',
    projectId: project.id,
  });
}

/**
 * 5. Notification: Backlog Task Auto-Promoted to Sprint (Deadline Approaching <= 3 days)
 */
export async function sendSprintPromotedNotification(params: {
  recipient: { email: string; fullName?: string };
  ticket: { id: string; ticketKey: string; title: string; dueDate: Date | string };
  project: { id: string; key: string; name: string };
  sprintName: string;
  daysRemaining: number;
}) {
  const { recipient, ticket, project, sprintName, daysRemaining } = params;
  const deadlineStr = new Date(ticket.dueDate).toLocaleDateString();
  const taskUrl = `${APP_URL}/?projectKey=${project.key}&ticket=${ticket.ticketKey}`;

  const html = renderEmailTemplate({
    category: 'Auto-Sprint Activation',
    categoryColor: '#7c3aed',
    headline: `Backlog Task Promoted to Sprint: ${ticket.ticketKey}`,
    greeting: `Hello ${recipient.fullName || 'Team Member'},`,
    contentHtml: `
      <p style="margin: 0 0 10px 0;">
        The following task has an approaching deadline (${daysRemaining} day${daysRemaining === 1 ? '' : 's'} remaining) and has been <strong>automatically promoted from the Backlog into active iteration</strong>:
      </p>
      <div style="font-size: 15px; font-weight: 700; color: #0f172a; margin-bottom: 8px;">
        [${ticket.ticketKey}] ${ticket.title}
      </div>
      <table style="width: 100%; border-collapse: collapse; margin-top: 12px; font-size: 12px;">
        <tr>
          <td style="color: #64748b; padding: 4px 0;">Project:</td>
          <td style="font-weight: 600; padding: 4px 0;">${project.name} (${project.key})</td>
        </tr>
        <tr>
          <td style="color: #64748b; padding: 4px 0;">Sprint Assigned:</td>
          <td style="font-weight: 700; color: #7c3aed; padding: 4px 0;">${sprintName}</td>
        </tr>
        <tr>
          <td style="color: #64748b; padding: 4px 0;">Target Deadline:</td>
          <td style="font-weight: 700; color: #e11d48; padding: 4px 0;">${deadlineStr} (${daysRemaining} days remaining)</td>
        </tr>
      </table>
    `,
    ctaText: 'View Task in Active Sprint',
    ctaUrl: taskUrl,
    footerNote: 'Automated sprint allocation triggered to prevent backlog deadline breaches.',
  });

  return sendEmailNotification({
    to: recipient.email,
    toName: recipient.fullName,
    subject: `[Auto-Sprint Promotion] ${ticket.ticketKey} moved to ${sprintName} (Due in ${daysRemaining}d)`,
    html,
    notificationType: 'SPRINT_PROMOTED',
    ticketId: ticket.id,
    projectId: project.id,
  });
}

/**
 * 6. Direct or Internal Broadcast Email (Super Admins, Admins, Project Managers)
 */
export async function sendDirectOrBroadcastEmail(params: {
  recipient: { email: string; fullName?: string };
  subject: string;
  category?: string;
  categoryColor?: string;
  headline?: string;
  greeting?: string;
  content: string;
  sender: { fullName: string; email: string; roleName?: string };
  ctaText?: string;
  ctaUrl?: string;
  notificationType?: string;
  projectId?: string;
  ticketId?: string;
  projectName?: string;
}) {
  const {
    recipient,
    subject,
    category = 'Direct Mail',
    categoryColor = '#2563eb',
    headline,
    greeting,
    content,
    sender,
    ctaText = 'Open CoreTrack',
    ctaUrl = APP_URL,
    notificationType = 'DIRECT_MAIL',
    projectId,
    ticketId,
    projectName,
  } = params;

  // Format content paragraphs and linebreaks nicely if not already HTML
  const formattedContent = content.includes('<p>')
    ? content
    : content
        .split('\n\n')
        .map((p) => `<p style="margin: 0 0 12px 0; line-height: 1.6;">${p.replace(/\n/g, '<br/>')}</p>`)
        .join('');

  const html = renderEmailTemplate({
    category,
    categoryColor,
    headline: headline || subject,
    greeting: greeting || `Hello ${recipient.fullName || 'Team Member'},`,
    contentHtml: `
      <div style="font-size: 14px; color: #1e293b; line-height: 1.6;">
        ${formattedContent}
      </div>
      <table style="width: 100%; border-collapse: collapse; margin-top: 20px; padding-top: 12px; border-top: 1px solid #e2e8f0; font-size: 12px;">
        <tr>
          <td style="color: #64748b; padding: 4px 0; width: 120px;">Sent by:</td>
          <td style="font-weight: 600; padding: 4px 0; color: #0f172a;">
            ${sender.fullName} &lt;${sender.email}&gt;
            ${sender.roleName ? `<span style="display:inline-block; margin-left: 6px; padding: 1px 6px; background: #e2e8f0; border-radius: 4px; font-size: 10px; font-weight: 700;">${sender.roleName}</span>` : ''}
          </td>
        </tr>
        ${
          projectName
            ? `<tr><td style="color: #64748b; padding: 4px 0;">Project Context:</td><td style="font-weight: 600; padding: 4px 0;">${projectName}</td></tr>`
            : ''
        }
      </table>
    `,
    ctaText,
    ctaUrl,
    footerNote: `Direct communication sent via CoreTrack Mail Center by authorized executive (${sender.roleName || 'Management'}).`,
  });

  return sendEmailNotification({
    to: recipient.email,
    toName: recipient.fullName,
    subject,
    html,
    text: `${subject}\n\n${content}\n\nSent by ${sender.fullName} (${sender.email})`,
    notificationType,
    projectId,
    ticketId,
  });
}
