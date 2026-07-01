import "dotenv/config";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";
import { sslFor } from "./ssl";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("DATABASE_URL is not set. Copy .env.example to .env.");
}

// Reuse a single postgres.js client across hot reloads in dev.
const globalForDb = globalThis as unknown as {
  __ohrClient?: ReturnType<typeof postgres>;
};

const client =
  globalForDb.__ohrClient ??
  postgres(connectionString, {
    max: 10,
    ssl: sslFor(connectionString),
  });

if (process.env.NODE_ENV !== "production") {
  globalForDb.__ohrClient = client;
}

export const db = drizzle(client, { schema });
export { schema };
export * from "./schema";
