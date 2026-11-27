import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
// Load root repository .env first, then package .env
dotenv.config({ path: path.resolve(__dirname, '../../../.env') });
dotenv.config();

import { pool } from '@coretrack/db';
import { buildApp } from './app.js';
import { startDeadlineScheduler } from './services/deadlineScanner.js';

const PORT = Number(process.env.PORT) || 4000;
const HOST = process.env.HOST || '0.0.0.0';

/** Ensure recently added columns exist even if db:push was skipped on deploy. */
async function ensureSchemaColumns() {
  await pool.query(`
    ALTER TABLE projects
      ADD COLUMN IF NOT EXISTS admin_visible_to jsonb NOT NULL DEFAULT '[]'::jsonb;
    ALTER TABLE tickets
      ADD COLUMN IF NOT EXISTS milestone_id uuid REFERENCES project_milestones(id) ON DELETE SET NULL,
      ADD COLUMN IF NOT EXISTS admin_only boolean NOT NULL DEFAULT false;
  `);
}

async function start() {
  const app = await buildApp();

  try {
    await ensureSchemaColumns();
    app.log.info('Verified database schema columns');

    await app.listen({ port: PORT, host: HOST });
    app.log.info(`CoreTrack API listening on http://${HOST}:${PORT}`);
    app.log.info(`Interactive API Documentation available at http://${HOST}:${PORT}/docs`);

    // Start background recurring deadline and escalation scanner (runs every 60m)
    startDeadlineScheduler(60 * 60 * 1000);
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
}

start();
