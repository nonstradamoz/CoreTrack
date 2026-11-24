import { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { pool } from '@coretrack/db';

export const healthRoutes: FastifyPluginAsync = async (app) => {
  app.get(
    '/',
    {
      schema: {
        description: 'Service healthcheck endpoint',
        tags: ['System'],
        response: {
          200: z.object({
            status: z.string(),
            timestamp: z.string(),
            database: z.string(),
            version: z.string(),
          }),
        },
      },
    },
    async (_request, reply) => {
      let dbStatus = 'disconnected';
      try {
        await pool.query('SELECT 1');
        dbStatus = 'connected';
      } catch {
        dbStatus = 'unavailable';
      }

      return reply.send({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        database: dbStatus,
        version: '0.1.0',
      });
    }
  );
};
