import { WebSocket } from 'ws';

// Map of projectKey -> Set of connected WebSocket clients
const projectRooms = new Map<string, Set<WebSocket>>();

export function registerClient(socket: WebSocket) {
  let subscribedProject: string | null = null;

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
  });
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
