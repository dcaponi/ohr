import "dotenv/config";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { sslFor } from "./ssl";

/**
 * Applies generated Drizzle migrations. Ensures the pgvector extension exists
 * first (harmless if the init script already created it), then runs migrations.
 * Run with: npm run db:migrate
 */
async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set.");

  const client = postgres(url, {
    max: 1,
    ssl: sslFor(url),
  });

  await client`CREATE EXTENSION IF NOT EXISTS vector`;

  const dbc = drizzle(client);
  await migrate(dbc, { migrationsFolder: "./drizzle" });

  await client.end();
  console.log("✓ migrations applied");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
