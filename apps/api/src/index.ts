import { buildApp } from './app.js';
import type { FastifyInstance } from 'fastify';

let cachedApp: FastifyInstance | null = null;

async function getApp(): Promise<FastifyInstance> {
  if (!cachedApp) {
    cachedApp = await buildApp();
    await cachedApp.ready();
  }
  return cachedApp;
}

/**
 * Serverless request handler for Vercel Functions / Vercel Services.
 */
export default async function handler(req: any, res: any) {
  const app = await getApp();
  app.server.emit('request', req, res);
}

export { buildApp };
