import { neon, type NeonQueryFunction } from "@neondatabase/serverless";
import { drizzle, type NeonHttpDatabase } from "drizzle-orm/neon-http";
import * as schema from "./schema";

let cachedSql: NeonQueryFunction<false, false> | null = null;
let cachedDb: NeonHttpDatabase<typeof schema> | null = null;
let schemaReadyPromise: Promise<void> | null = null;

function resolveDatabaseUrl(): string | undefined {
  return process.env.DATABASE_URL || process.env.POSTGRES_URL;
}

export function isDatabaseConfigured(): boolean {
  const url = resolveDatabaseUrl();
  return Boolean(
    url &&
      url.startsWith("postgres") &&
      !url.includes("ep-example-123456") &&
      !url.includes("localhost:5432/family_planner")
  );
}

function getSqlClient(): NeonQueryFunction<false, false> | null {
  if (!isDatabaseConfigured()) return null;
  if (!cachedSql) {
    cachedSql = neon(resolveDatabaseUrl()!);
  }
  return cachedSql;
}

export function getDb(): NeonHttpDatabase<typeof schema> | null {
  const sql = getSqlClient();
  if (!sql) return null;
  if (!cachedDb) {
    cachedDb = drizzle(sql, { schema });
  }
  return cachedDb;
}

/**
 * Ensures additive columns introduced after initial table creation exist on
 * Neon Postgres before Drizzle selects them. Runs once per serverless cold
 * start and resets on transient errors so the next request can retry.
 */
async function ensureDbSchema(): Promise<void> {
  const sql = getSqlClient();
  if (!sql) return;
  if (!schemaReadyPromise) {
    schemaReadyPromise = (async () => {
      await sql`ALTER TABLE IF EXISTS "members" ADD COLUMN IF NOT EXISTS "avatar_url" text`;
    })().catch((err) => {
      schemaReadyPromise = null;
      throw err;
    });
  }
  await schemaReadyPromise;
}

export async function getReadyDb(): Promise<NeonHttpDatabase<typeof schema> | null> {
  const db = getDb();
  if (!db) return null;
  await ensureDbSchema();
  return db;
}
