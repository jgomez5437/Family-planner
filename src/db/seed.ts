import "dotenv/config";
import { ensureSeededInNeon } from "./repository";
import { isDatabaseConfigured } from "./index";

async function main() {
  if (!isDatabaseConfigured()) {
    console.log("DATABASE_URL is not configured yet. Set DATABASE_URL in .env to seed Neon Postgres.");
    process.exit(0);
  }
  console.log("Seeding Neon Postgres database...");
  const ok = await ensureSeededInNeon();
  if (ok) {
    console.log("Database seeded successfully!");
  } else {
    console.error("Database seeding failed. Ensure you have run `npm run db:push` first.");
    process.exit(1);
  }
}

main();
