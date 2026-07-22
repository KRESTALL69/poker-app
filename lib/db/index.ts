import "server-only";

import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

type DrizzleDb = ReturnType<typeof drizzle>;

let instance: DrizzleDb | undefined;

// Lazy — construction (and the DATABASE_URL check) happens on first real
// use, not at module import time, so builds/tests that never touch the DB
// (e.g. `next build` with no DATABASE_URL set) don't crash just from
// loading the module graph.
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
