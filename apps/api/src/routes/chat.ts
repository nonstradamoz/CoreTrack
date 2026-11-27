import { FastifyPluginAsync } from 'fastify';
import { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import {
  db,
  chatChannels,
  chatChannelMembers,
  chatMessages,
  teams,
  projects,
  projectMembers,
  projectTeams,
  users,
  eq,
  and,
  or,
  inArray,
  asc,
  desc,
  isNull,
  gt,
  ilike,
} from '@coretrack/db';
import { getCurrentUser, getUserRoleTier, getUserTeamIds } from '../auth/auth.js';
import { broadcastToChatChannel } from '../ws.js';

export const chatRoutes: FastifyPluginAsync = async (fastify) => {
  const app = fastify.withTypeProvider<ZodTypeProvider>();

  /**
   * Helper: verify whether a user has access to a given channel
   */
  async function canAccessChannel(userId: string, channelId: string): Promise<boolean> {
    const channel = await db.query.chatChannels.findFirst({
      where: eq(chatChannels.id, channelId),
    });
    if (!channel) return false;

    const tierInfo = await getUserRoleTier(userId);
    if (tierInfo.tier >= 4) return true; // Admins/Super Admins can access all Team & Project channels

    if (channel.channelType === 'DIRECT') {
      const membership = await db.query.chatChannelMembers.findFirst({
        where: and(eq(chatChannelMembers.channelId, channelId), eq(chatChannelMembers.userId, userId)),
      });
      return Boolean(membership);
    }

    if (tierInfo.tier >= 3) return true; // Managers can access all Team & Project channels

    const userTeamIds = await getUserTeamIds(userId);

    if (channel.channelType === 'TEAM' && channel.teamId) {
      return userTeamIds.includes(channel.teamId);
    }

    if (channel.channelType === 'PROJECT' && channel.projectId) {
      const proj = await db.query.projects.findFirst({
        where: eq(projects.id, channel.projectId),
      });
      if (!proj) return false;
      if (proj.projectManagerId === userId || proj.reviewerId === userId) return true;
      if (proj.primaryTeamId && userTeamIds.includes(proj.primaryTeamId)) return true;

      const projMember = await db.query.projectMembers.findFirst({
        where: and(eq(projectMembers.projectId, proj.id), eq(projectMembers.userId, userId)),
      });
      if (projMember) return true;

      if (userTeamIds.length > 0) {
        const pt = await db.query.projectTeams.findFirst({
          where: and(eq(projectTeams.projectId, proj.id), inArray(projectTeams.teamId, userTeamIds)),
        });
        if (pt) return true;
      }
      return false;
    }

    return false;
  }

  // 1. List all accessible channels (Team, Project, Direct Messages) with unread counts & last message
  app.get(
    '/channels',
    {
      schema: {
        description: 'List accessible workspace chat channels (DM, Team, Project) with unread counts',
        tags: ['Chat'],
      },
    },
    async (request, reply) => {
      const user = await getCurrentUser(request);
      if (!user) return reply.status(401).send({ error: 'Unauthorized' });

      const tierInfo = await getUserRoleTier(user.id);
      const isAuthority = tierInfo.tier >= 3;
      const userTeamIds = await getUserTeamIds(user.id);

      // A. Sync & collect accessible TEAM channels
      const allTeams = await db.query.teams.findMany();
      const accessibleTeams = isAuthority
        ? allTeams
        : allTeams.filter((t) => userTeamIds.includes(t.id));

      for (const team of accessibleTeams) {
        const existing = await db.query.chatChannels.findFirst({
          where: eq(chatChannels.teamId, team.id),
        });
        if (!existing) {
          await db
            .insert(chatChannels)
            .values({
              channelType: 'TEAM',
              name: team.name,
              teamId: team.id,
            })
            .onConflictDoNothing();
        }
      }

      // B. Sync & collect accessible PROJECT channels
      const allProjects = await db.query.projects.findMany({
        with: {
          members: true,
          assignedTeams: true,
        },
      });
      const accessibleProjects = isAuthority
        ? allProjects
        : allProjects.filter(
            (p) =>
              p.projectManagerId === user.id ||
              p.reviewerId === user.id ||
              (p.primaryTeamId && userTeamIds.includes(p.primaryTeamId)) ||
              p.members.some((m) => m.userId === user.id) ||
              p.assignedTeams.some((at) => userTeamIds.includes(at.teamId))
          );

      for (const proj of accessibleProjects) {
        const existing = await db.query.chatChannels.findFirst({
          where: eq(chatChannels.projectId, proj.id),
        });
        if (!existing) {
          await db
            .insert(chatChannels)
            .values({
              channelType: 'PROJECT',
              name: proj.name,
              projectId: proj.id,
            })
            .onConflictDoNothing();
        }
      }

      // C. Collect user's DM channels
      const dmMemberships = await db.query.chatChannelMembers.findMany({
        where: eq(chatChannelMembers.userId, user.id),
        with: {
          channel: true,
        },
      });
      const dmChannelIds = dmMemberships
        .filter((m) => m.channel.channelType === 'DIRECT')
        .map((m) => m.channelId);

      // D. Fetch hydrated channels
      const teamIds = accessibleTeams.map((t) => t.id);
      const projectIds = accessibleProjects.map((p) => p.id);

      const conditions = [];
      if (teamIds.length > 0) conditions.push(inArray(chatChannels.teamId, teamIds));
      if (projectIds.length > 0) conditions.push(inArray(chatChannels.projectId, projectIds));
      if (dmChannelIds.length > 0) conditions.push(inArray(chatChannels.id, dmChannelIds));

      if (conditions.length === 0) {
        return reply.send({ data: [] });
      }

      const channels = await db.query.chatChannels.findMany({
        where: or(...conditions),
        with: {
          team: {
            columns: { id: true, name: true, keyPrefix: true },
            with: {
              lead: { columns: { id: true, fullName: true, email: true } },
              members: {
                with: {
                  user: { columns: { id: true, fullName: true, email: true } },
                },
              },
            },
          },
          project: {
            columns: { id: true, key: true, name: true },
            with: {
              projectManager: { columns: { id: true, fullName: true, email: true } },
              reviewer: { columns: { id: true, fullName: true, email: true } },
              members: {
                with: {
                  user: { columns: { id: true, fullName: true, email: true } },
                },
              },
              primaryTeam: {
                with: {
                  lead: { columns: { id: true, fullName: true, email: true } },
                  members: {
                    with: {
                      user: { columns: { id: true, fullName: true, email: true } },
                    },
                  },
                },
              },
              assignedTeams: {
                with: {
                  team: {
                    with: {
                      lead: { columns: { id: true, fullName: true, email: true } },
                      members: {
                        with: {
                          user: { columns: { id: true, fullName: true, email: true } },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
          members: {
            with: {
              user: { columns: { id: true, fullName: true, email: true } },
            },
          },
        },
        orderBy: desc(chatChannels.updatedAt),
      });

      // Compute unreadCount & lastMessage per channel
      const enriched = await Promise.all(
        channels.map(async (ch) => {
          const myMembership = ch.members.find((m) => m.userId === user.id);
          const lastReadAt = myMembership?.lastReadAt || new Date(0);

          const unreadRows = await db
            .select({ id: chatMessages.id, senderId: chatMessages.senderId })
            .from(chatMessages)
            .where(
              and(
                eq(chatMessages.channelId, ch.id),
                isNull(chatMessages.deletedAt),
                isNull(chatMessages.parentMessageId),
                gt(chatMessages.createdAt, lastReadAt)
              )
            );
          const unreadCount = unreadRows.filter((r) => r.senderId !== user.id).length;

          const latest = await db.query.chatMessages.findFirst({
            where: and(
              eq(chatMessages.channelId, ch.id),
              isNull(chatMessages.deletedAt),
              isNull(chatMessages.parentMessageId)
            ),
            orderBy: desc(chatMessages.createdAt),
            with: {
              sender: { columns: { id: true, fullName: true } },
            },
          });

          const peerUser =
            ch.channelType === 'DIRECT'
              ? ch.members.find((m) => m.userId !== user.id)?.user || ch.members[0]?.user || null
              : null;

          // Compute respective channel members for mentions
          const channelMembersMap = new Map<string, { id: string; fullName: string; email: string }>();

          if (ch.channelType === 'DIRECT') {
            for (const m of ch.members) {
              if (m.user) channelMembersMap.set(m.user.id, m.user);
            }
          } else if (ch.channelType === 'TEAM' && ch.team) {
            if (ch.team.lead) channelMembersMap.set(ch.team.lead.id, ch.team.lead);
            for (const tm of ch.team.members || []) {
              if (tm.user) channelMembersMap.set(tm.user.id, tm.user);
            }
          } else if (ch.channelType === 'PROJECT' && ch.project) {
            if (ch.project.projectManager) channelMembersMap.set(ch.project.projectManager.id, ch.project.projectManager);
            if (ch.project.reviewer) channelMembersMap.set(ch.project.reviewer.id, ch.project.reviewer);
            for (const pm of ch.project.members || []) {
              if (pm.user) channelMembersMap.set(pm.user.id, pm.user);
            }
            if (ch.project.primaryTeam) {
              if (ch.project.primaryTeam.lead) channelMembersMap.set(ch.project.primaryTeam.lead.id, ch.project.primaryTeam.lead);
              for (const tm of ch.project.primaryTeam.members || []) {
                if (tm.user) channelMembersMap.set(tm.user.id, tm.user);
              }
            }
            for (const at of ch.project.assignedTeams || []) {
              if (at.team) {
                if (at.team.lead) channelMembersMap.set(at.team.lead.id, at.team.lead);
                for (const tm of at.team.members || []) {
                  if (tm.user) channelMembersMap.set(tm.user.id, tm.user);
                }
              }
            }
          }

          const channelMembers = Array.from(channelMembersMap.values());

          return {
            id: ch.id,
            channelType: ch.channelType as 'DIRECT' | 'TEAM' | 'PROJECT',
            name:
              ch.channelType === 'DIRECT'
                ? peerUser?.fullName || 'Direct Message'
                : ch.project?.name || ch.team?.name || ch.name || 'Channel',
            team: ch.team ? { id: ch.team.id, name: ch.team.name, keyPrefix: ch.team.keyPrefix } : null,
            project: ch.project ? { id: ch.project.id, key: ch.project.key, name: ch.project.name } : null,
            peerUser,
            unreadCount,
            channelMembers,
            lastMessage: latest
              ? {
                  id: latest.id,
                  body: latest.body,
                  senderName: latest.sender?.fullName || 'User',
                  createdAt: latest.createdAt,
                }
              : null,
            updatedAt: ch.updatedAt,
          };
        })
      );

      return reply.send({ data: enriched });
    }
  );

  // 2. Create or open a 1-on-1 Direct Message channel
  app.post(
    '/dm',
    {
      schema: {
        description: 'Open or create a 1-on-1 Direct Message channel with another user',
        tags: ['Chat'],
        body: z.object({
          targetUserId: z.string().uuid(),
        }),
      },
    },
    async (request, reply) => {
      const user = await getCurrentUser(request);
      if (!user) return reply.status(401).send({ error: 'Unauthorized' });

      const { targetUserId } = request.body;
      const targetUser = await db.query.users.findFirst({
        where: eq(users.id, targetUserId),
        columns: { id: true, fullName: true, email: true },
      });
      if (!targetUser) {
        return reply.status(404).send({ error: 'Target user not found' });
      }

      const dmKey = [user.id, targetUserId].sort().join(':');
      let channel = await db.query.chatChannels.findFirst({
        where: eq(chatChannels.dmKey, dmKey),
      });

      if (!channel) {
        const [created] = await db
          .insert(chatChannels)
          .values({
            channelType: 'DIRECT',
            dmKey,
          })
          .returning();
        channel = created;

        await db
          .insert(chatChannelMembers)
          .values([
            { channelId: channel.id, userId: user.id },
            ...(targetUserId !== user.id ? [{ channelId: channel.id, userId: targetUserId }] : []),
          ])
          .onConflictDoNothing();
      }

      return reply.status(201).send({
        data: {
          id: channel.id,
          channelType: 'DIRECT',
          name: targetUser.fullName,
          peerUser: targetUser,
        },
      });
    }
  );

  // 3. Fetch messages in a channel (or replies in a thread)
  app.get(
    '/channels/:channelId/messages',
    {
      schema: {
        description: 'Fetch messages in a chat channel or thread',
        tags: ['Chat'],
        params: z.object({ channelId: z.string().uuid() }),
        querystring: z.object({
          parentMessageId: z.string().uuid().optional(),
          limit: z.coerce.number().min(1).max(200).default(100),
        }),
      },
    },
    async (request, reply) => {
      const user = await getCurrentUser(request);
      if (!user) return reply.status(401).send({ error: 'Unauthorized' });

      const { channelId } = request.params;
      const { parentMessageId, limit } = request.query;

      const allowed = await canAccessChannel(user.id, channelId);
      if (!allowed) return reply.status(403).send({ error: 'Access denied to this channel' });

      const rows = await db.query.chatMessages.findMany({
        where: and(
          eq(chatMessages.channelId, channelId),
          parentMessageId
            ? eq(chatMessages.parentMessageId, parentMessageId)
            : isNull(chatMessages.parentMessageId)
        ),
        with: {
          sender: { columns: { id: true, fullName: true, email: true } },
        },
        orderBy: asc(chatMessages.createdAt),
        limit,
      });

      // Compute reply counts for top-level messages
      let replyCountMap = new Map<string, number>();
      if (!parentMessageId && rows.length > 0) {
        const parentIds = rows.map((r) => r.id);
        const allReplies = await db
          .select({ parentMessageId: chatMessages.parentMessageId })
          .from(chatMessages)
          .where(
            and(
              inArray(chatMessages.parentMessageId, parentIds),
              isNull(chatMessages.deletedAt)
            )
          );
        for (const r of allReplies) {
          if (r.parentMessageId) {
            replyCountMap.set(r.parentMessageId, (replyCountMap.get(r.parentMessageId) || 0) + 1);
          }
        }
      }

      const data = rows.map((m) => ({
        ...m,
        body: m.deletedAt ? 'This message was deleted.' : m.body,
        replyCount: replyCountMap.get(m.id) || 0,
      }));

      return reply.send({ data });
    }
  );

  // 4. Send a message (or threaded reply)
  app.post(
    '/channels/:channelId/messages',
    {
      schema: {
        description: 'Send a message or threaded reply to a chat channel',
        tags: ['Chat'],
        params: z.object({ channelId: z.string().uuid() }),
        body: z.object({
          body: z.string().min(1).max(4000),
          parentMessageId: z.string().uuid().optional().nullable(),
          attachments: z
            .array(
              z.object({
                name: z.string(),
                url: z.string(),
                contentType: z.string().optional(),
                size: z.number().optional(),
              })
            )
            .optional()
            .default([]),
        }),
      },
    },
    async (request, reply) => {
      const user = await getCurrentUser(request);
      if (!user) return reply.status(401).send({ error: 'Unauthorized' });

      const { channelId } = request.params;
      const allowed = await canAccessChannel(user.id, channelId);
      if (!allowed) return reply.status(403).send({ error: 'Access denied to this channel' });

      const { body, parentMessageId, attachments } = request.body;

      const [created] = await db
        .insert(chatMessages)
        .values({
          channelId,
          senderId: user.id,
          parentMessageId: parentMessageId || null,
          body,
          attachments,
        })
        .returning();

      await db
        .update(chatChannels)
        .set({ updatedAt: new Date() })
        .where(eq(chatChannels.id, channelId));

      // Upsert sender's lastReadAt
      await db
        .insert(chatChannelMembers)
        .values({ channelId, userId: user.id, lastReadAt: new Date() })
        .onConflictDoUpdate({
          target: [chatChannelMembers.channelId, chatChannelMembers.userId],
          set: { lastReadAt: new Date() },
        });

      const hydrated = {
        ...created,
        sender: { id: user.id, fullName: user.fullName, email: user.email },
        replyCount: 0,
      };

      broadcastToChatChannel(channelId, {
        type: 'CHAT_MESSAGE_CREATED',
        payload: hydrated,
      });

      return reply.status(201).send({ data: hydrated });
    }
  );

  // 5. Edit own message
  app.patch(
    '/messages/:messageId',
    {
      schema: {
        description: 'Edit your own chat message',
        tags: ['Chat'],
        params: z.object({ messageId: z.string().uuid() }),
        body: z.object({
          body: z.string().min(1).max(4000),
        }),
      },
    },
    async (request, reply) => {
      const user = await getCurrentUser(request);
      if (!user) return reply.status(401).send({ error: 'Unauthorized' });

      const { messageId } = request.params;
      const existing = await db.query.chatMessages.findFirst({
        where: eq(chatMessages.id, messageId),
      });
      if (!existing) return reply.status(404).send({ error: 'Message not found' });
      if (existing.senderId !== user.id) {
        return reply.status(403).send({ error: 'You can only edit your own messages' });
      }

      const [updated] = await db
        .update(chatMessages)
        .set({ body: request.body.body, editedAt: new Date() })
        .where(eq(chatMessages.id, messageId))
        .returning();

      const hydrated = {
        ...updated,
        sender: { id: user.id, fullName: user.fullName, email: user.email },
      };

      broadcastToChatChannel(existing.channelId, {
        type: 'CHAT_MESSAGE_UPDATED',
        payload: hydrated,
      });

      return reply.send({ data: hydrated });
    }
  );

  // 6. Delete own message (or Admin)
  app.delete(
    '/messages/:messageId',
    {
      schema: {
        description: 'Delete a chat message',
        tags: ['Chat'],
        params: z.object({ messageId: z.string().uuid() }),
      },
    },
    async (request, reply) => {
      const user = await getCurrentUser(request);
      if (!user) return reply.status(401).send({ error: 'Unauthorized' });

      const { messageId } = request.params;
      const existing = await db.query.chatMessages.findFirst({
        where: eq(chatMessages.id, messageId),
      });
      if (!existing) return reply.status(404).send({ error: 'Message not found' });

      const tierInfo = await getUserRoleTier(user.id);
      if (existing.senderId !== user.id && tierInfo.tier < 4) {
        return reply.status(403).send({ error: 'You can only delete your own messages' });
      }

      const [deleted] = await db
        .update(chatMessages)
        .set({ deletedAt: new Date() })
        .where(eq(chatMessages.id, messageId))
        .returning();

      broadcastToChatChannel(existing.channelId, {
        type: 'CHAT_MESSAGE_DELETED',
        payload: { id: deleted.id, channelId: existing.channelId },
      });

      return reply.send({ data: { id: deleted.id } });
    }
  );

  // 7. Toggle emoji reaction on a message
  app.post(
    '/messages/:messageId/reactions',
    {
      schema: {
        description: 'Toggle an emoji reaction on a chat message',
        tags: ['Chat'],
        params: z.object({ messageId: z.string().uuid() }),
        body: z.object({ emoji: z.string().min(1).max(16) }),
      },
    },
    async (request, reply) => {
      const user = await getCurrentUser(request);
      if (!user) return reply.status(401).send({ error: 'Unauthorized' });

      const { messageId } = request.params;
      const { emoji } = request.body;

      const existing = await db.query.chatMessages.findFirst({
        where: eq(chatMessages.id, messageId),
      });
      if (!existing) return reply.status(404).send({ error: 'Message not found' });

      const allowed = await canAccessChannel(user.id, existing.channelId);
      if (!allowed) return reply.status(403).send({ error: 'Access denied' });

      const currentReactions = { ...((existing.reactions as Record<string, string[]>) || {}) };
      const usersForEmoji = new Set(currentReactions[emoji] || []);
      if (usersForEmoji.has(user.id)) {
        usersForEmoji.delete(user.id);
      } else {
        usersForEmoji.add(user.id);
      }

      if (usersForEmoji.size === 0) {
        delete currentReactions[emoji];
      } else {
        currentReactions[emoji] = Array.from(usersForEmoji);
      }

      const [updated] = await db
        .update(chatMessages)
        .set({ reactions: currentReactions })
        .where(eq(chatMessages.id, messageId))
        .returning();

      broadcastToChatChannel(existing.channelId, {
        type: 'CHAT_MESSAGE_REACTED',
        payload: { id: updated.id, channelId: existing.channelId, reactions: currentReactions },
      });

      return reply.send({ data: { id: updated.id, reactions: currentReactions } });
    }
  );

  // 8. Mark channel as read
  app.post(
    '/channels/:channelId/read',
    {
      schema: {
        description: 'Mark all messages in a channel as read',
        tags: ['Chat'],
        params: z.object({ channelId: z.string().uuid() }),
      },
    },
    async (request, reply) => {
      const user = await getCurrentUser(request);
      if (!user) return reply.status(401).send({ error: 'Unauthorized' });

      const { channelId } = request.params;
      await db
        .insert(chatChannelMembers)
        .values({ channelId, userId: user.id, lastReadAt: new Date() })
        .onConflictDoUpdate({
          target: [chatChannelMembers.channelId, chatChannelMembers.userId],
          set: { lastReadAt: new Date() },
        });

      return reply.send({ ok: true });
    }
  );

  // 9. Search messages across accessible channels (or within a specific channel)
  app.get(
    '/search',
    {
      schema: {
        description: 'Search chat messages across accessible channels with optional channel and sender filters',
        tags: ['Chat'],
        querystring: z.object({
          q: z.string().min(1).max(200),
          channelId: z.string().uuid().optional(),
          senderId: z.string().uuid().optional(),
          limit: z.coerce.number().min(1).max(100).default(40),
        }),
      },
    },
    async (request, reply) => {
      const user = await getCurrentUser(request);
      if (!user) return reply.status(401).send({ error: 'Unauthorized' });

      const { q, channelId, senderId, limit } = request.query;

      let targetChannelIds: string[] = [];
      if (channelId) {
        const allowed = await canAccessChannel(user.id, channelId);
        if (!allowed) return reply.status(403).send({ error: 'Access denied to this channel' });
        targetChannelIds = [channelId];
      } else {
        const tierInfo = await getUserRoleTier(user.id);
        const isAuthority = tierInfo.tier >= 3;
        const userTeamIds = await getUserTeamIds(user.id);

        const allTeams = await db.query.teams.findMany();
        const accessibleTeamIds = (isAuthority ? allTeams : allTeams.filter((t) => userTeamIds.includes(t.id))).map((t) => t.id);

        const allProjects = await db.query.projects.findMany({
          with: { members: true, assignedTeams: true },
        });
        const accessibleProjectIds = (
          isAuthority
            ? allProjects
            : allProjects.filter(
                (p) =>
                  p.projectManagerId === user.id ||
                  p.reviewerId === user.id ||
                  (p.primaryTeamId && userTeamIds.includes(p.primaryTeamId)) ||
                  p.members.some((m) => m.userId === user.id) ||
                  p.assignedTeams.some((at) => userTeamIds.includes(at.teamId))
              )
        ).map((p) => p.id);

        const dmMemberships = await db.query.chatChannelMembers.findMany({
          where: eq(chatChannelMembers.userId, user.id),
          with: { channel: true },
        });
        const dmChannelIds = dmMemberships
          .filter((m) => m.channel.channelType === 'DIRECT')
          .map((m) => m.channelId);

        const conditions = [];
        if (accessibleTeamIds.length > 0) conditions.push(inArray(chatChannels.teamId, accessibleTeamIds));
        if (accessibleProjectIds.length > 0) conditions.push(inArray(chatChannels.projectId, accessibleProjectIds));
        if (dmChannelIds.length > 0) conditions.push(inArray(chatChannels.id, dmChannelIds));

        if (conditions.length === 0) {
          return reply.send({ data: [] });
        }

        const accessibleChannels = await db
          .select({ id: chatChannels.id })
          .from(chatChannels)
          .where(or(...conditions));
        targetChannelIds = accessibleChannels.map((c) => c.id);
      }

      if (targetChannelIds.length === 0) {
        return reply.send({ data: [] });
      }

      const msgConditions = [
        inArray(chatMessages.channelId, targetChannelIds),
        isNull(chatMessages.deletedAt),
        ilike(chatMessages.body, `%${q.trim()}%`),
      ];
      if (senderId) {
        msgConditions.push(eq(chatMessages.senderId, senderId));
      }

      const matches = await db.query.chatMessages.findMany({
        where: and(...msgConditions),
        with: {
          sender: { columns: { id: true, fullName: true, email: true } },
          channel: {
            with: {
              team: { columns: { id: true, name: true, keyPrefix: true } },
              project: { columns: { id: true, key: true, name: true } },
            },
          },
        },
        orderBy: desc(chatMessages.createdAt),
        limit,
      });

      const data = matches.map((m) => ({
        ...m,
        channelName:
          m.channel.channelType === 'DIRECT'
            ? 'Direct Message'
            : m.channel.project?.name || m.channel.team?.name || m.channel.name || 'Channel',
        channelType: m.channel.channelType,
      }));

      return reply.send({ data });
    }
  );
};
