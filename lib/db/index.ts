import "server-only";

import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

type DrizzleDb = ReturnType<typeof drizzle>;

let instance: DrizzleDb | undefined;

// Lazy — construction (and the DATABASE_URL check) happens on first real
// use, not at module import time. Every domain's index.ts imports
// Postgres*Repository unconditionally (see lib/repositories/*/index.ts), so
// eager construction here would throw whenever DATABASE_PROVIDER=supabase
// (today's default and current prod state, where DATABASE_URL isn't set)
// just from loading the module graph, never mind actually using Postgres.
function getDb(): DrizzleDb {
  if (!instance) {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) {
      throw new Error("DATABASE_URL is not set");
    }
    instance = drizzle(postgres(connectionString));
  }
  return instance;
}

export const db: DrizzleDb = new Proxy({} as DrizzleDb, {
  get(_target, prop, receiver) {
    return Reflect.get(getDb() as object, prop, receiver);
  },
});
