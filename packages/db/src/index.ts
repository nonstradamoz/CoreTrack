import { drizzle } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import * as schema from './schema/index.js';

const { Pool } = pg;

const connectionString =
  process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/coretrack';

export const pool = new Pool({
  connectionString,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

export const db = drizzle(pool, { schema });

export * from './schema/index.js';
export * from 'drizzle-orm';
export { clearSampleData } from './clean.js';
export { seed } from './seed.js';
export { getSeedConfig, type SeedConfig, type UserKey } from './seedConfig.js';
