import { neon } from "@neondatabase/serverless";
import { drizzle, type NeonHttpDatabase } from "drizzle-orm/neon-http";
import * as schema from "./schema";

let cachedDb: NeonHttpDatabase<typeof schema> | null = null;

export function isDatabaseConfigured(): boolean {
  const url = process.env.DATABASE_URL;
  return Boolean(
    url &&
      url.startsWith("postgres") &&
      !url.includes("ep-example-123456") &&
      !url.includes("localhost:5432/family_planner")
  );
}

export function getDb(): NeonHttpDatabase<typeof schema> | null {
  if (!isDatabaseConfigured()) return null;
  if (!cachedDb) {
    const sql = neon(process.env.DATABASE_URL!);
    cachedDb = drizzle(sql, { schema });
  }
  return cachedDb;
}
