// Backfills the 9 domain tables from production Supabase into the poker_app
// PostgreSQL database, preserving original ids/timestamps. Read-only against
// Supabase, upsert-only against Postgres — never TRUNCATE/DROP/DELETE.
//
// Usage:
//   node scripts/backfill-supabase-to-postgres.mjs --dry-run
//   node scripts/backfill-supabase-to-postgres.mjs
//
// Requires DATABASE_URL, NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
// in the environment. Refuses to run against anything but a database named
// exactly "poker_app". Safe to re-run: every write is
// `INSERT ... ON CONFLICT (pk) DO UPDATE`, keyed on the original primary key
// — never generates new ids, never deletes rows.
import { createClient } from "@supabase/supabase-js";
import postgres from "postgres";
import { IMPORT_ORDER, getTable } from "./lib/backfill-tables.mjs";

const BATCH_SIZE = 500;
const DRY_RUN = process.argv.includes("--dry-run");

function requireEnv(name) {
  const value = process.env[name];
  if (!value) {
    console.error(`Missing required environment variable: ${name}`);
    process.exit(1);
  }
  return value;
}

function normalizeRow(row, table) {
  const out = {};
  for (const col of table.columns) {
    let value = row[col];
    if (table.deferredSelfFk === col) {
      // Handled in a dedicated second pass after the table's main upsert —
      // never written here, regardless of what Supabase returned.
      value = null;
    } else if (table.jsonbColumns.includes(col) && value !== null && value !== undefined) {
      value = JSON.stringify(value);
    }
    out[col] = value === undefined ? null : value;
  }
  return out;
}

// A composite "col = excluded.col, col2 = excluded.col2, ..." fragment isn't
// expressible via the sql(identifier) helper (that only quotes a single
// identifier), so this builds it as a raw fragment via sql.unsafe. Safe here
// specifically because setCols comes only from the static, hardcoded
// TABLES registry (scripts/lib/backfill-tables.mjs) — never from Supabase
// row data or any other runtime/user input.
function buildUpdateSetClause(sql, table) {
  const setCols = table.columns.filter((c) => c !== table.pk);
  return sql.unsafe(setCols.map((c) => `"${c}" = excluded."${c}"`).join(", "));
}

async function fetchSupabaseCount(supabase, tableName) {
  const { count, error } = await supabase.from(tableName).select("*", { count: "exact", head: true });
  if (error) throw new Error(`Failed to count ${tableName}: ${error.message}`);
  return count ?? 0;
}

// Keyset pagination (WHERE pk > lastSeenPk ORDER BY pk LIMIT n), not
// offset/range — stable under concurrent writes to the source table (an
// offset-based page can silently skip or repeat rows if Supabase rows are
// inserted/deleted between page fetches; keyset pagination cannot, since
// each page is anchored to the last value actually seen, not a row count).
async function* paginateSupabase(supabase, table) {
  let lastPk = null;
  for (;;) {
    let query = supabase
      .from(table.name)
      .select(table.columns.join(","))
      .order(table.pk, { ascending: true })
      .limit(BATCH_SIZE);
    if (lastPk !== null) {
      query = query.gt(table.pk, lastPk);
    }
    const { data, error } = await query;
    if (error) throw new Error(`Failed to read ${table.name}: ${error.message}`);
    if (!data || data.length === 0) return;
    yield data;
    lastPk = data[data.length - 1][table.pk];
    if (data.length < BATCH_SIZE) return;
  }
}

async function backfillTable(supabase, sql, tableName) {
  const table = getTable(tableName);
  const started = Date.now();
  const sourceCount = await fetchSupabaseCount(supabase, tableName);

  let processed = 0;
  let inserted = 0;
  let updated = 0;
  const seenPks = new Set();
  const deferredSelfFkPairs = [];

  for await (const batch of paginateSupabase(supabase, table)) {
    for (const row of batch) {
      const pkValue = row[table.pk];
      if (seenPks.has(pkValue)) {
        throw new Error(
          `Duplicate ${table.pk} "${pkValue}" seen twice while paginating ${tableName} — pagination is not stable, aborting.`
        );
      }
      seenPks.add(pkValue);
      if (table.deferredSelfFk && row[table.deferredSelfFk] !== null && row[table.deferredSelfFk] !== undefined) {
        deferredSelfFkPairs.push({ pk: pkValue, value: row[table.deferredSelfFk] });
      }
    }
    processed += batch.length;

    if (!DRY_RUN) {
      const rows = batch.map((row) => normalizeRow(row, table));
      const result = await sql`
        INSERT INTO ${sql(table.name)} ${sql(rows, ...table.columns)}
        ON CONFLICT (${sql(table.pk)}) DO UPDATE SET ${buildUpdateSetClause(sql, table)}
        RETURNING (xmax = 0) AS inserted
      `;
      for (const r of result) {
        if (r.inserted) inserted += 1;
        else updated += 1;
      }
    }
  }

  if (processed !== sourceCount) {
    throw new Error(
      `${tableName}: fetched ${processed} rows but Supabase reported count=${sourceCount} at start — ` +
        `likely concurrent writes during export. Aborting rather than silently proceeding on a partial read.`
    );
  }

  // Second pass: self-referential FK (players.blocked_by), applied only
  // after every row in the table exists — safe regardless of insert order.
  if (!DRY_RUN && table.deferredSelfFk && deferredSelfFkPairs.length > 0) {
    for (const { pk, value } of deferredSelfFkPairs) {
      await sql`
        UPDATE ${sql(table.name)}
        SET ${sql(table.deferredSelfFk)} = ${value}
        WHERE ${sql(table.pk)} = ${pk}
      `;
    }
  }

  const durationMs = Date.now() - started;
  console.log(
    JSON.stringify({
      table: tableName,
      source_rows: sourceCount,
      processed_rows: processed,
      inserted_rows: DRY_RUN ? null : inserted,
      updated_rows: DRY_RUN ? null : updated,
      skipped_rows: 0,
      deferred_self_fk_pairs: table.deferredSelfFk ? deferredSelfFkPairs.length : undefined,
      duration_ms: durationMs,
      dry_run: DRY_RUN,
    })
  );
}

async function main() {
  const databaseUrl = requireEnv("DATABASE_URL");
  const supabaseUrl = requireEnv("NEXT_PUBLIC_SUPABASE_URL");
  const supabaseServiceRoleKey = requireEnv("SUPABASE_SERVICE_ROLE_KEY");

  const sql = postgres(databaseUrl, { max: 5 });
  const supabase = createClient(supabaseUrl, supabaseServiceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  try {
    const [{ current_database: currentDatabase }] = await sql`SELECT current_database()`;
    if (currentDatabase !== "poker_app") {
      console.error(
        `Refusing to run: DATABASE_URL points at database "${currentDatabase}", expected exactly "poker_app". Aborting.`
      );
      process.exit(1);
    }

    const snapshotStartedAt = new Date().toISOString();
    console.log(`Backfill snapshot started at ${snapshotStartedAt}${DRY_RUN ? " (DRY RUN — no writes)" : ""}`);
    console.log(`Target database confirmed: ${currentDatabase}`);
    console.log(`Import order: ${IMPORT_ORDER.join(" -> ")}`);

    for (const tableName of IMPORT_ORDER) {
      await backfillTable(supabase, sql, tableName);
    }

    console.log(`Backfill ${DRY_RUN ? "dry-run " : ""}completed successfully.`);
  } finally {
    await sql.end();
  }
}

main().catch((err) => {
  console.error("Backfill failed:");
  console.error(err instanceof Error ? err.stack ?? err.message : err);
  process.exit(1);
});
