import Fastify from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import websocket from '@fastify/websocket';
import {
  serializerCompiler,
  validatorCompiler,
  jsonSchemaTransform,
} from 'fastify-type-provider-zod';
import { healthRoutes } from './routes/health.js';
import { ticketRoutes } from './routes/tickets.js';
import { projectRoutes } from './routes/projects.js';
import { sprintRoutes } from './routes/sprints.js';
import { authRoutes } from './routes/auth.js';
import { webhookRoutes } from './routes/webhooks.js';
import { reportRoutes } from './routes/reports.js';
import { dashboardRoutes } from './routes/dashboard.js';
import { automationRoutes } from './routes/automation.js';
import { importExportRoutes } from './routes/importExport.js';
import { standupRoutes } from './routes/standups.js';
import { roleRoutes } from './routes/roles.js';
import { teamRoutes } from './routes/teams.js';
import { mailRoutes } from './routes/mail.js';
import { chatRoutes } from './routes/chat.js';
import { helpdeskRoutes } from './routes/helpdesk.js';
import { getCurrentUser } from './auth/auth.js';
import { db, departments } from '@coretrack/db';
import { registerClient } from './ws.js';
import { WebSocket } from 'ws';

// Global BigInt JSON serialization support for Fastify & Node
if (!(BigInt.prototype as unknown as { toJSON?: () => string }).toJSON) {
  (BigInt.prototype as unknown as { toJSON: () => string }).toJSON = function () {
    return this.toString();
  };
}

export async function buildApp() {
  const isTest = process.env.NODE_ENV === 'test';

  const app = Fastify({
    logger: isTest ? false : { level: 'info' },
  });

  // Type provider for Zod
  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);

  // Security & Plugins
  await app.register(cors, {
    origin: process.env.CORS_ORIGIN || true,
    credentials: true,
  });

  await app.register(helmet, {
    contentSecurityPolicy: process.env.NODE_ENV === 'production',
  });

  await app.register(websocket);

  // WebSocket Live Sync Route (Fastify 5 / @fastify/websocket v11 passes socket directly)
  app.get('/ws', { websocket: true }, (connection: unknown) => {
    const ws = (connection as { socket?: WebSocket })?.socket || (connection as WebSocket);
    registerClient(ws);
  });

  // OpenAPI Swagger Documentation
  await app.register(swagger, {
    openapi: {
      info: {
        title: 'CoreTrack API',
        description: 'Enterprise Ticketing and Task Management Platform Backend',
        version: '0.1.0',
      },
      servers: [
        {
          url: `http://localhost:${process.env.PORT || 4000}`,
          description: 'Development Server',
        },
      ],
    },
    transform: jsonSchemaTransform,
  });

  await app.register(swaggerUi, {
    routePrefix: '/docs',
  });

  // Global Authentication Guard for all protected /api/v1/* routes
  const PUBLIC_API_ROUTES = new Set([
    '/api/v1/auth/login',
    '/api/v1/auth/setup-password',
    '/api/v1/auth/logout',
  ]);
  const PUBLIC_API_PREFIXES = ['/api/v1/health', '/api/v1/webhooks/'];

  app.addHook('preHandler', async (request, reply) => {
    if (request.method === 'OPTIONS') return;
    const urlPath = request.url.split('?')[0];
    if (!urlPath.startsWith('/api/v1/')) return;
    if (PUBLIC_API_ROUTES.has(urlPath)) return;
    if (PUBLIC_API_PREFIXES.some((prefix) => urlPath.startsWith(prefix))) return;

    const caller = await getCurrentUser(request);
    if (!caller) {
      return reply.status(401).send({ error: 'Authentication required' });
    }
  });

  // Register Routes
  await app.register(healthRoutes, { prefix: '/api/v1/health' });
  await app.register(projectRoutes, { prefix: '/api/v1/projects' });
  await app.register(ticketRoutes, { prefix: '/api/v1/tickets' });
  await app.register(sprintRoutes, { prefix: '/api/v1' });
  await app.register(authRoutes, { prefix: '/api/v1/auth' });
  await app.register(webhookRoutes, { prefix: '/api/v1/webhooks' });
  await app.register(reportRoutes, { prefix: '/api/v1/reports' });
  await app.register(dashboardRoutes, { prefix: '/api/v1/dashboard' });
  await app.register(automationRoutes, { prefix: '/api/v1' });
  await app.register(importExportRoutes, { prefix: '/api/v1/projects' });
  await app.register(standupRoutes, { prefix: '/api/v1/standups' });
  await app.register(roleRoutes, { prefix: '/api/v1' });
  await app.register(teamRoutes, { prefix: '/api/v1/teams' });
  await app.register(mailRoutes, { prefix: '/api/v1/mail' });
  await app.register(chatRoutes, { prefix: '/api/v1/chat' });
  await app.register(helpdeskRoutes, { prefix: '/api/v1/helpdesk' });

  app.get('/api/v1/departments', async (_request, reply) => {
    const all = await db.query.departments.findMany();
    return reply.send({ data: all });
  });

  return app;
}
