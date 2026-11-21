import { spawnSync } from "node:child_process";
import { neon } from "@neondatabase/serverless";

try {
  await import("dotenv/config");
} catch {
  // dotenv is optional when env vars are injected by Vercel
}

const url =
  process.env.DATABASE_URL_UNPOOLED ||
  process.env.POSTGRES_URL_NON_POOLING ||
  process.env.DATABASE_URL ||
  process.env.POSTGRES_URL;
const isConfigured = Boolean(
  url &&
    url.startsWith("postgres") &&
    !url.includes("ep-example-123456") &&
    !url.includes("localhost:5432/family_planner")
);

if (!isConfigured) {
  console.log(
    "[db:sync] DATABASE_URL is not configured; skipping Neon schema push."
  );
  process.exit(0);
}

console.log("[db:sync] Applying idempotent schema updates and cleaning legacy data...");
const sql = neon(url);

await sql`
  DO $$
  BEGIN
    IF EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = 'families'
    ) THEN
      DELETE FROM families WHERE id = 'default-family';
    END IF;
  END $$;
`;

await sql`ALTER TABLE IF EXISTS "members" ADD COLUMN IF NOT EXISTS "avatar_url" text`;

console.log("[db:sync] Pushing Drizzle schema to Neon Postgres...");
const result = spawnSync("npx", ["drizzle-kit", "push", "--force"], {
  stdio: "inherit",
  env: { ...process.env, DATABASE_URL: url },
});

if (result.status !== 0) {
  console.error("[db:sync] drizzle-kit push failed.");
  process.exit(result.status ?? 1);
}

console.log("[db:sync] Database schema is up to date.");
