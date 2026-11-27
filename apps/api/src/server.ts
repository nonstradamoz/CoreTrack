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
      ADD COLUMN IF NOT EXISTS admin_access_mode varchar(20) NOT NULL DEFAULT 'ALL',
      ADD COLUMN IF NOT EXISTS admin_visible_to jsonb NOT NULL DEFAULT '[]'::jsonb;
    ALTER TABLE tickets
      ADD COLUMN IF NOT EXISTS milestone_id uuid REFERENCES project_milestones(id) ON DELETE SET NULL,
      ADD COLUMN IF NOT EXISTS admin_only boolean NOT NULL DEFAULT false;
    CREATE TABLE IF NOT EXISTS email_notification_logs (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      recipient_email varchar(255) NOT NULL,
      recipient_name varchar(150),
      subject varchar(255) NOT NULL,
      html_body text,
      text_body text,
      notification_type varchar(50) NOT NULL,
      ticket_id uuid REFERENCES tickets(id) ON DELETE SET NULL,
      project_id uuid REFERENCES projects(id) ON DELETE SET NULL,
      provider varchar(50) DEFAULT 'RESEND',
      status varchar(20) NOT NULL DEFAULT 'SENT',
      error_message text,
      sent_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS idx_email_logs_type_recipient ON email_notification_logs (notification_type, recipient_email);
    CREATE INDEX IF NOT EXISTS idx_email_logs_ticket ON email_notification_logs (ticket_id);
    CREATE INDEX IF NOT EXISTS idx_email_logs_project ON email_notification_logs (project_id);
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
