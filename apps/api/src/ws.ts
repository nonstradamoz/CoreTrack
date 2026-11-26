import { WebSocket } from 'ws';

// Map of projectKey -> Set of connected WebSocket clients
const projectRooms = new Map<string, Set<WebSocket>>();
// Map of chat channelId -> Set of connected WebSocket clients
const chatChannelRooms = new Map<string, Set<WebSocket>>();
// All clients listening for global chat notifications
const chatGlobalClients = new Set<WebSocket>();

export function registerClient(socket: WebSocket) {
  let subscribedProject: string | null = null;
  let subscribedChatChannel: string | null = null;

  socket.on('message', (data: Buffer | string) => {
    try {
      const message = JSON.parse(data.toString());

      if (message.type === 'subscribe' && typeof message.projectKey === 'string') {
        const nextProject: string = message.projectKey;

        // Leave previous room if any
        if (subscribedProject && projectRooms.has(subscribedProject)) {
          projectRooms.get(subscribedProject)?.delete(socket);
        }

        if (!projectRooms.has(nextProject)) {
          projectRooms.set(nextProject, new Set());
        }
        projectRooms.get(nextProject)?.add(socket);
        subscribedProject = nextProject;

        socket.send(
          JSON.stringify({
            type: 'SUBSCRIBED',
            projectKey: nextProject,
            timestamp: new Date().toISOString(),
          })
        );
      }

      if (message.type === 'subscribe_chat_global') {
        chatGlobalClients.add(socket);
      }

      if (message.type === 'subscribe_chat' && typeof message.channelId === 'string') {
        const nextChannel: string = message.channelId;
        if (subscribedChatChannel && chatChannelRooms.has(subscribedChatChannel)) {
          chatChannelRooms.get(subscribedChatChannel)?.delete(socket);
        }
        if (!chatChannelRooms.has(nextChannel)) {
          chatChannelRooms.set(nextChannel, new Set());
        }
        chatChannelRooms.get(nextChannel)?.add(socket);
        subscribedChatChannel = nextChannel;
        chatGlobalClients.add(socket);
      }
    } catch {
      // Ignore malformed client frames
    }
  });

  socket.on('close', () => {
    if (subscribedProject && projectRooms.has(subscribedProject)) {
      projectRooms.get(subscribedProject)?.delete(socket);
      if (projectRooms.get(subscribedProject)?.size === 0) {
        projectRooms.delete(subscribedProject);
      }
    }
    if (subscribedChatChannel && chatChannelRooms.has(subscribedChatChannel)) {
      chatChannelRooms.get(subscribedChatChannel)?.delete(socket);
      if (chatChannelRooms.get(subscribedChatChannel)?.size === 0) {
        chatChannelRooms.delete(subscribedChatChannel);
      }
    }
    chatGlobalClients.delete(socket);
  });
}

export function broadcastToChatChannel(channelId: string, event: { type: string; payload: unknown }) {
  const data = JSON.stringify({
    ...event,
    channelId,
    timestamp: new Date().toISOString(),
  });

  const room = chatChannelRooms.get(channelId);
  if (room) {
    for (const client of room) {
      if (client.readyState === WebSocket.OPEN) {
        client.send(data);
      }
    }
  }

  // Also notify global chat listeners for unread badges
  for (const client of chatGlobalClients) {
    if ((!room || !room.has(client)) && client.readyState === WebSocket.OPEN) {
      client.send(data);
    }
  }
}

export function broadcastToProject(projectKey: string, event: { type: string; payload: unknown }) {
  const room = projectRooms.get(projectKey);
  if (!room || room.size === 0) return;

  const data = JSON.stringify({
    ...event,
    timestamp: new Date().toISOString(),
  });

  for (const client of room) {
    if (client.readyState === WebSocket.OPEN) {
      client.send(data);
    }
  }
}
