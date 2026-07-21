import { defineConfig } from "drizzle-kit";

// Schema/migrations paths below don't exist yet — they're created in a later,
// separate step (Drizzle Schema). This config is not invoked by anything yet.
export default defineConfig({
  dialect: "postgresql",
  schema: "./lib/db/schema.ts",
  out: "./lib/db/migrations",
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
});
