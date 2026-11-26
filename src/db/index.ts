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
      await sql`
        CREATE TABLE IF NOT EXISTS "notifications" (
          "id" text PRIMARY KEY NOT NULL,
          "family_id" text NOT NULL REFERENCES "families"("id") ON DELETE cascade,
          "recipient_id" text NOT NULL REFERENCES "members"("id") ON DELETE cascade,
          "actor_id" text NOT NULL,
          "category" text NOT NULL,
          "title" text NOT NULL,
          "body" text DEFAULT '' NOT NULL,
          "target_tab" text DEFAULT 'wall' NOT NULL,
          "target_entity_id" text,
          "read" boolean DEFAULT false NOT NULL,
          "created_at" timestamp DEFAULT now() NOT NULL
        )
      `;
      await sql`
        CREATE INDEX IF NOT EXISTS "notifications_family_recipient_created_idx"
        ON "notifications" ("family_id", "recipient_id", "created_at" DESC)
      `;
      await sql`
        CREATE TABLE IF NOT EXISTS "games" (
          "id" text PRIMARY KEY NOT NULL,
          "family_id" text NOT NULL REFERENCES "families"("id") ON DELETE cascade,
          "game_type" text NOT NULL,
          "mode" text DEFAULT 'remote' NOT NULL,
          "status" text DEFAULT 'pending' NOT NULL,
          "challenger_id" text NOT NULL REFERENCES "members"("id") ON DELETE cascade,
          "opponent_id" text NOT NULL REFERENCES "members"("id") ON DELETE cascade,
          "players" jsonb NOT NULL,
          "current_turn_id" text,
          "winner_id" text,
          "outcome" text,
          "state" jsonb DEFAULT '{}'::jsonb NOT NULL,
          "moves" jsonb DEFAULT '[]'::jsonb NOT NULL,
          "rematch_of_id" text,
          "created_at" timestamp DEFAULT now() NOT NULL,
          "updated_at" timestamp DEFAULT now() NOT NULL,
          "completed_at" timestamp
        )
      `;
      await sql`
        CREATE INDEX IF NOT EXISTS "games_family_updated_idx"
        ON "games" ("family_id", "updated_at" DESC)
      `;
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
