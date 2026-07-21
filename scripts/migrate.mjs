// Applies Drizzle migrations directly via drizzle-orm, bypassing the
// `drizzle-kit migrate` CLI.
//
// Why: drizzle-kit's `migrate` command has a known bug (documented in
// docs/POSTGRES_MIGRATION_ARCHITECTURE.md Risks, carried over from ReRaise's
// own migration) — on a real failure it silently stops with no error output.
// This script calls the same underlying function the CLI calls internally
// (drizzle-orm/postgres-js/migrator's `migrate`) — identical on success,
// but real errors are printed in full instead of swallowed.
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";

const MIGRATIONS_FOLDER = "./lib/db/migrations";

async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("Missing DATABASE_URL environment variable");
  }

  const migrationClient = postgres(connectionString, { max: 1 });
  try {
    const db = drizzle(migrationClient);
    console.log(`Applying migrations from ${MIGRATIONS_FOLDER} ...`);
    await migrate(db, { migrationsFolder: MIGRATIONS_FOLDER });
    console.log("Migrations applied successfully.");
  } finally {
    await migrationClient.end();
  }
}

main().catch((err) => {
  console.error("Migration failed:");
  console.error(err);
  process.exit(1);
});
