'use client';

import { useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';

const WS_URL = process.env.NEXT_PUBLIC_WS_URL || 'ws://localhost:4000';

export function useProjectWebSocket(projectKey: string) {
  const [isConnected, setIsConnected] = useState(false);
  const queryClient = useQueryClient();
  const socketRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    let isMounted = true;
    let reconnectTimeout: NodeJS.Timeout;

    function connect() {
      try {
        const socket = new WebSocket(`${WS_URL}/ws`);
        socketRef.current = socket;

        socket.onopen = () => {
          if (!isMounted) return;
          setIsConnected(true);
          // Subscribe to project channel
          socket.send(
            JSON.stringify({
              type: 'subscribe',
              projectKey,
            })
          );
        };

        socket.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);
            if (data.type === 'TICKET_UPDATED' || data.type === 'TICKET_CREATED' || data.type === 'TICKET_DELETED') {
              // Refresh tickets cache
              queryClient.invalidateQueries({ queryKey: ['tickets'] });
              queryClient.invalidateQueries({ queryKey: ['tickets', projectKey] });
              queryClient.invalidateQueries({ queryKey: ['projectMetrics'] });
              if (data.payload?.ticketKey) {
                queryClient.invalidateQueries({ queryKey: ['ticket', data.payload.ticketKey] });
              }
            } else if (data.type === 'COMMENT_ADDED') {
              if (data.payload?.ticketKey) {
                queryClient.invalidateQueries({ queryKey: ['comments', data.payload.ticketKey] });
              }
            }
          } catch {
            // Ignore parse errors
          }
        };

        socket.onclose = () => {
          if (!isMounted) return;
          setIsConnected(false);
          // Auto-reconnect after 3 seconds
          reconnectTimeout = setTimeout(connect, 3000);
        };

        socket.onerror = () => {
          socket.close();
        };
      } catch {
        if (isMounted) {
          reconnectTimeout = setTimeout(connect, 3000);
        }
      }
    }

    connect();

    return () => {
      isMounted = false;
      clearTimeout(reconnectTimeout);
      if (socketRef.current) {
        socketRef.current.close();
      }
    };
  }, [projectKey, queryClient]);

  return { isConnected };
}
