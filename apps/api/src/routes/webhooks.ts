import { FastifyPluginAsync } from 'fastify';
import { db, tickets, ticketVcsLinks, ticketComments, users, eq } from '@coretrack/db';
import { broadcastToProject } from '../ws.js';

export const webhookRoutes: FastifyPluginAsync = async (fastify) => {
  // Ingest GitHub Webhooks
  fastify.post('/github', async (request, reply) => {
    const event = request.headers['x-github-event'] as string;
    const payload = request.body as Record<string, any>;

    if (!payload) {
      return reply.status(400).send({ error: 'Missing webhook payload' });
    }

    const defaultUser = await db.query.users.findFirst();
    const systemUserId = defaultUser?.id || '00000000-0000-0000-0000-000000000001';

    // 1. Handle PULL_REQUEST Events
    if (event === 'pull_request') {
      const pr = payload.pull_request;
      const action = payload.action; // 'opened', 'closed', 'reopened'
      if (!pr) return reply.send({ message: 'Ignored: No pull request object' });

      const prTitle = pr.title || '';
      const branchName = pr.head?.ref || '';
      const prUrl = pr.html_url || '';
      const prNumber = pr.number;
      const author = pr.user?.login || 'developer';
      const isMerged = pr.merged === true;

      // Scan for ticket keys (e.g. CORE-1, HD-5) in title or branch name
      const keyRegex = /([A-Z]{2,10}-\d+)/gi;
      const matches = new Set([
        ...(prTitle.match(keyRegex) || []),
        ...(branchName.match(keyRegex) || []),
      ]);

      for (const rawKey of matches) {
        const ticketKey = rawKey.toUpperCase();
        const ticket = await db.query.tickets.findFirst({
          where: eq(tickets.ticketKey, ticketKey),
        });

        if (ticket) {
          // Record or update VCS link
          await db
            .insert(ticketVcsLinks)
            .values({
              ticketId: ticket.id,
              provider: 'GITHUB',
              linkType: 'PULL_REQUEST',
              externalId: String(prNumber),
              title: prTitle,
              url: prUrl,
              branchName,
              status: isMerged ? 'MERGED' : action === 'closed' ? 'CLOSED' : 'OPEN',
              author,
            })
            .onConflictDoNothing();

          const projectKey = ticketKey.split('-')[0];

          if (isMerged) {
            // Auto-transition to DONE on merge
            await db
              .update(tickets)
              .set({
                status: 'DONE',
                updatedAt: new Date(),
              })
              .where(eq(tickets.id, ticket.id));

            await db.insert(ticketComments).values({
              ticketId: ticket.id,
              authorId: systemUserId,
              body: `🤖 **GitHub Webhook:** Pull Request [#${prNumber} (${prTitle})](${prUrl}) merged by @${author}. Ticket automatically transitioned to **DONE**.`,
              visibilityScope: 'PUBLIC',
            });

            broadcastToProject(projectKey, {
              type: 'TICKET_UPDATED',
              payload: { ...ticket, status: 'DONE' },
            });
          } else if (action === 'opened') {
            // Auto-transition to IN_REVIEW on PR open
            await db
              .update(tickets)
              .set({
                status: 'IN_REVIEW',
                updatedAt: new Date(),
              })
              .where(eq(tickets.id, ticket.id));

            await db.insert(ticketComments).values({
              ticketId: ticket.id,
              authorId: systemUserId,
              body: `🤖 **GitHub Webhook:** Pull Request [#${prNumber} (${prTitle})](${prUrl}) opened from branch \`${branchName}\` by @${author}. Ticket transitioned to **IN_REVIEW**.`,
              visibilityScope: 'PUBLIC',
            });

            broadcastToProject(projectKey, {
              type: 'TICKET_UPDATED',
              payload: { ...ticket, status: 'IN_REVIEW' },
            });
          }
        }
      }

      return reply.send({ success: true, processedMatches: matches.size, matchedTickets: Array.from(matches) });
    }

    // 2. Handle PUSH Events (Commits)
    if (event === 'push') {
      const commits = payload.commits || [];
      let linkedCommits = 0;

      for (const commit of commits) {
        const message = commit.message || '';
        const commitUrl = commit.url || '';
        const commitId = commit.id?.substring(0, 7) || 'HEAD';
        const author = commit.author?.name || 'developer';

        const keyRegex = /([A-Z]{2,10}-\d+)/gi;
        const matchedArray = message.match(keyRegex) || [];
        const matches = Array.from(new Set<string>(matchedArray));
        const isFix = /(?:fixes|closes|resolves)\s+[A-Z]{2,10}-\d+/i.test(message);

        for (const rawKey of matches) {
          const ticketKey = rawKey.toUpperCase();
          const ticket = await db.query.tickets.findFirst({
            where: eq(tickets.ticketKey, ticketKey),
          });

          if (ticket) {
            await db
              .insert(ticketVcsLinks)
              .values({
                ticketId: ticket.id,
                provider: 'GITHUB',
                linkType: 'COMMIT',
                externalId: commitId,
                title: message.split('\n')[0].substring(0, 255),
                url: commitUrl,
                status: 'MERGED',
                author,
              })
              .onConflictDoNothing();

            linkedCommits++;

            if (isFix) {
              await db
                .update(tickets)
                .set({ status: 'DONE', updatedAt: new Date() })
                .where(eq(tickets.id, ticket.id));
            }

            const projectKey = ticketKey.split('-')[0];
            broadcastToProject(projectKey, {
              type: 'TICKET_UPDATED',
              payload: { ...ticket, status: isFix ? 'DONE' : ticket.status },
            });
          }
        }
      }

      return reply.send({ success: true, linkedCommits });
    }

    return reply.send({ message: `Ignored event: ${event}` });
  });
};
