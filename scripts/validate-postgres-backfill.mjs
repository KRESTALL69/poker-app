// Four-level parity check between Supabase (source of truth) and the
// poker_app PostgreSQL database, after scripts/backfill-supabase-to-postgres.mjs
// has run. Read-only against both sides — never writes anything.
//
// Usage: node scripts/validate-postgres-backfill.mjs
//
// Requires DATABASE_URL, NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY.
// Exits non-zero if any table fails any level. Never prints row content —
// only counts, ids, and checksums.
import { createClient } from "@supabase/supabase-js";
import postgres from "postgres";
import { createHash } from "node:crypto";
import { IMPORT_ORDER, getTable } from "./lib/backfill-tables.mjs";

const BATCH_SIZE = 500;

function requireEnv(name) {
  const value = process.env[name];
  if (!value) {
    console.error(`Missing required environment variable: ${name}`);
    process.exit(1);
  }
  return value;
}

// Canonical per-row representation for checksumming: fixed column order
// (from the shared registry, not object key order), timestamps normalized
// to ISO strings, null made explicit, jsonb columns canonicalized via
// JSON.stringify of the parsed value (not the raw driver-specific string
// form Supabase vs. Drizzle/postgres.js might hand back).
function canonicalizeRow(row, table) {
  const parts = table.columns.map((col) => {
    let value = row[col];
    if (value === null || value === undefined) return "null";
    if (table.jsonbColumns.includes(col)) {
      const parsed = typeof value === "string" ? JSON.parse(value) : value;
      return JSON.stringify(parsed);
    }
    if (value instanceof Date) return value.toISOString();
    return String(value);
  });
  return parts.join("");
}

function hashRow(canonical) {
  return createHash("sha256").update(canonical).digest("hex");
}

async function* paginateSupabase(supabase, table) {
  let lastPk = null;
  for (;;) {
    let query = supabase
      .from(table.name)
      .select(table.columns.join(","))
      .order(table.pk, { ascending: true })
      .limit(BATCH_SIZE);
    if (lastPk !== null) query = query.gt(table.pk, lastPk);
    const { data, error } = await query;
    if (error) throw new Error(`Failed to read ${table.name}: ${error.message}`);
    if (!data || data.length === 0) return;
    yield data;
    lastPk = data[data.length - 1][table.pk];
    if (data.length < BATCH_SIZE) return;
  }
}

async function* paginatePostgres(sql, table) {
  let lastPk = null;
  for (;;) {
    const rows = lastPk === null
      ? await sql`SELECT ${sql(table.columns)} FROM ${sql(table.name)} ORDER BY ${sql(table.pk)} ASC LIMIT ${BATCH_SIZE}`
      : await sql`SELECT ${sql(table.columns)} FROM ${sql(table.name)} WHERE ${sql(table.pk)} > ${lastPk} ORDER BY ${sql(table.pk)} ASC LIMIT ${BATCH_SIZE}`;
    if (rows.length === 0) return;
    yield rows;
    lastPk = rows[rows.length - 1][table.pk];
    if (rows.length < BATCH_SIZE) return;
  }
}

async function level1RowCounts(supabase, sql, tableName) {
  const table = getTable(tableName);
  const { count: supabaseCount, error } = await supabase.from(tableName).select("*", { count: "exact", head: true });
  if (error) throw new Error(`Count failed for ${tableName}: ${error.message}`);
  const [{ count: pgCountRaw }] = await sql`SELECT count(*)::int AS count FROM ${sql(table.name)}`;
  const pgCount = pgCountRaw;
  return { table: tableName, supabase_count: supabaseCount ?? 0, postgres_count: pgCount, match: (supabaseCount ?? 0) === pgCount };
}

async function level2PkSets(supabase, sql, tableName) {
  const table = getTable(tableName);
  const supabasePks = new Set();
  for await (const batch of paginateSupabase(supabase, table)) {
    for (const row of batch) supabasePks.add(String(row[table.pk]));
  }
  const pgRows = await sql`SELECT ${sql(table.pk)} FROM ${sql(table.name)}`;
  const pgPks = new Set(pgRows.map((r) => String(r[table.pk])));

  const missingInPostgres = [...supabasePks].filter((pk) => !pgPks.has(pk));
  const extraInPostgres = [...pgPks].filter((pk) => !supabasePks.has(pk));

  return {
    table: tableName,
    supabase_pk_count: supabasePks.size,
    postgres_pk_count: pgPks.size,
    missing_in_postgres: missingInPostgres.length,
    extra_in_postgres: extraInPostgres.length,
    // Only the first few ids, never row content — enough to act on without
    // dumping potentially-large diffs.
    missing_sample: missingInPostgres.slice(0, 5),
    extra_sample: extraInPostgres.slice(0, 5),
    match: missingInPostgres.length === 0 && extraInPostgres.length === 0,
  };
}

async function level3Checksum(supabase, sql, tableName) {
  const table = getTable(tableName);
  const rowHashes = [];
  for await (const batch of paginateSupabase(supabase, table)) {
    for (const row of batch) rowHashes.push({ pk: row[table.pk], hash: hashRow(canonicalizeRow(row, table)) });
  }
  const supabaseHashByPk = new Map(rowHashes.map((r) => [String(r.pk), r.hash]));

  let mismatches = 0;
  const mismatchSample = [];
  let pgRowCount = 0;
  for await (const batch of paginatePostgres(sql, table)) {
    for (const row of batch) {
      pgRowCount += 1;
      const pk = String(row[table.pk]);
      const pgHash = hashRow(canonicalizeRow(row, table));
      const supabaseHash = supabaseHashByPk.get(pk);
      if (supabaseHash !== pgHash) {
        mismatches += 1;
        if (mismatchSample.length < 5) mismatchSample.push(pk);
      }
    }
  }

  const combined = createHash("sha256");
  for (const { hash } of rowHashes.sort((a, b) => String(a.pk).localeCompare(String(b.pk)))) combined.update(hash);
  const supabaseTableChecksum = combined.digest("hex");

  return {
    table: tableName,
    supabase_rows_hashed: rowHashes.length,
    postgres_rows_hashed: pgRowCount,
    mismatches,
    mismatch_sample_pks: mismatchSample,
    supabase_table_checksum: supabaseTableChecksum,
    match: mismatches === 0 && rowHashes.length === pgRowCount,
  };
}

async function level4BusinessInvariants(sql) {
  const results = {};

  const [{ count: activeSeasons }] = await sql`SELECT count(*)::int AS count FROM seasons WHERE is_active = true`;
  results.active_seasons = { value: activeSeasons, ok: activeSeasons <= 1 };

  const orphanChecks = [
    ["registrations.player_id -> players", sql`SELECT count(*)::int AS c FROM registrations r LEFT JOIN players p ON r.player_id = p.id WHERE p.id IS NULL`],
    ["registrations.tournament_id -> tournaments", sql`SELECT count(*)::int AS c FROM registrations r LEFT JOIN tournaments t ON r.tournament_id = t.id WHERE t.id IS NULL`],
    ["results.player_id -> players", sql`SELECT count(*)::int AS c FROM results r LEFT JOIN players p ON r.player_id = p.id WHERE p.id IS NULL`],
    ["results.tournament_id -> tournaments", sql`SELECT count(*)::int AS c FROM results r LEFT JOIN tournaments t ON r.tournament_id = t.id WHERE t.id IS NULL`],
    ["player_achievements.player_id -> players", sql`SELECT count(*)::int AS c FROM player_achievements pa LEFT JOIN players p ON pa.player_id = p.id WHERE p.id IS NULL`],
    ["activity_events.player_id -> players", sql`SELECT count(*)::int AS c FROM activity_events a LEFT JOIN players p ON a.player_id = p.id WHERE p.id IS NULL`],
    ["tournament_live_entries.tournament_id -> tournaments", sql`SELECT count(*)::int AS c FROM tournament_live_entries e LEFT JOIN tournaments t ON e.tournament_id = t.id WHERE t.id IS NULL`],
    ["tournament_live_entries.player_id -> players", sql`SELECT count(*)::int AS c FROM tournament_live_entries e LEFT JOIN players p ON e.player_id = p.id WHERE p.id IS NULL`],
    ["tournament_live_entries.registration_id -> registrations", sql`SELECT count(*)::int AS c FROM tournament_live_entries e LEFT JOIN registrations r ON e.registration_id = r.id WHERE r.id IS NULL`],
    ["tournaments.season_id -> seasons (nullable)", sql`SELECT count(*)::int AS c FROM tournaments t LEFT JOIN seasons s ON t.season_id = s.id WHERE t.season_id IS NOT NULL AND s.id IS NULL`],
    ["players.blocked_by -> players (self)", sql`SELECT count(*)::int AS c FROM players b LEFT JOIN players p ON b.blocked_by = p.id WHERE b.blocked_by IS NOT NULL AND p.id IS NULL`],
  ];
  results.orphan_fks = {};
  for (const [label, query] of orphanChecks) {
    const [{ c }] = await query;
    results.orphan_fks[label] = { orphans: c, ok: c === 0 };
  }

  const [{ c: emailDupes }] = await sql`
    SELECT count(*)::int AS c FROM (
      SELECT lower(email) FROM players WHERE email IS NOT NULL GROUP BY lower(email) HAVING count(*) > 1
    ) dupes
  `;
  results.email_case_insensitive_duplicates = { value: emailDupes, ok: emailDupes === 0 };

  const [{ c: telegramDupes }] = await sql`
    SELECT count(*)::int AS c FROM (
      SELECT telegram_id FROM players WHERE telegram_id IS NOT NULL GROUP BY telegram_id HAVING count(*) > 1
    ) dupes
  `;
  results.telegram_id_duplicates = { value: telegramDupes, ok: telegramDupes === 0 };

  const [{ c: registrationDupes }] = await sql`
    SELECT count(*)::int AS c FROM (
      SELECT player_id, tournament_id FROM registrations GROUP BY player_id, tournament_id HAVING count(*) > 1
    ) dupes
  `;
  results.registration_duplicates = { value: registrationDupes, ok: registrationDupes === 0 };

  const [{ c: resultPlaceDupes }] = await sql`
    SELECT count(*)::int AS c FROM (
      SELECT tournament_id, place FROM results GROUP BY tournament_id, place HAVING count(*) > 1
    ) dupes
  `;
  results.result_place_duplicates = { value: resultPlaceDupes, ok: resultPlaceDupes === 0 };

  const [{ c: resultPlayerDupes }] = await sql`
    SELECT count(*)::int AS c FROM (
      SELECT tournament_id, player_id FROM results GROUP BY tournament_id, player_id HAVING count(*) > 1
    ) dupes
  `;
  results.result_player_duplicates = { value: resultPlayerDupes, ok: resultPlayerDupes === 0 };

  const [{ c: achievementDupes }] = await sql`
    SELECT count(*)::int AS c FROM (
      SELECT player_id, achievement_code FROM player_achievements GROUP BY player_id, achievement_code HAVING count(*) > 1
    ) dupes
  `;
  results.achievement_duplicates = { value: achievementDupes, ok: achievementDupes === 0 };

  const [{ c: liveEntryDupes }] = await sql`
    SELECT count(*)::int AS c FROM (
      SELECT tournament_id, player_id FROM tournament_live_entries GROUP BY tournament_id, player_id HAVING count(*) > 1
    ) dupes
  `;
  results.tournament_live_entries_duplicates = { value: liveEntryDupes, ok: liveEntryDupes === 0 };

  const [{ c: badStatuses }] = await sql`
    SELECT count(*)::int AS c FROM registrations WHERE status NOT IN ('registered','waitlist','cancelled','attended')
  `;
  results.invalid_registration_status = { value: badStatuses, ok: badStatuses === 0 };

  const [{ c: badRoles }] = await sql`SELECT count(*)::int AS c FROM players WHERE role NOT IN ('player','admin')`;
  results.invalid_player_role = { value: badRoles, ok: badRoles === 0 };

  const [{ c: badPlaces }] = await sql`SELECT count(*)::int AS c FROM results WHERE place <= 0`;
  results.invalid_result_place = { value: badPlaces, ok: badPlaces === 0 };

  const [{ c: badRating }] = await sql`SELECT count(*)::int AS c FROM results WHERE rating_points < 0`;
  results.invalid_rating_points = { value: badRating, ok: badRating === 0 };

  return results;
}

async function main() {
  const databaseUrl = requireEnv("DATABASE_URL");
  const supabaseUrl = requireEnv("NEXT_PUBLIC_SUPABASE_URL");
  const supabaseServiceRoleKey = requireEnv("SUPABASE_SERVICE_ROLE_KEY");

  const sql = postgres(databaseUrl, { max: 5 });
  const supabase = createClient(supabaseUrl, supabaseServiceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  let anyFailure = false;

  try {
    const [{ current_database: currentDatabase }] = await sql`SELECT current_database()`;
    if (currentDatabase !== "poker_app") {
      console.error(`Refusing to validate: target database is "${currentDatabase}", expected "poker_app".`);
      process.exit(1);
    }
    console.log(`Validating against database: ${currentDatabase}`);

    console.log("\n=== Level 1: row counts ===");
    for (const tableName of IMPORT_ORDER) {
      const result = await level1RowCounts(supabase, sql, tableName);
      console.log(JSON.stringify(result));
      if (!result.match) anyFailure = true;
    }

    console.log("\n=== Level 2: primary key sets ===");
    for (const tableName of IMPORT_ORDER) {
      const result = await level2PkSets(supabase, sql, tableName);
      console.log(JSON.stringify(result));
      if (!result.match) anyFailure = true;
    }

    console.log("\n=== Level 3: row checksums ===");
    for (const tableName of IMPORT_ORDER) {
      const result = await level3Checksum(supabase, sql, tableName);
      console.log(JSON.stringify(result));
      if (!result.match) anyFailure = true;
    }

    console.log("\n=== Level 4: business invariants ===");
    const invariants = await level4BusinessInvariants(sql);
    console.log(JSON.stringify(invariants, null, 2));
    const invariantFailures = [];
    for (const [key, val] of Object.entries(invariants)) {
      if (val.ok === false) invariantFailures.push(key);
      if (key === "orphan_fks") {
        for (const [label, sub] of Object.entries(val)) {
          if (!sub.ok) invariantFailures.push(`orphan_fks.${label}`);
        }
      }
    }
    if (invariantFailures.length > 0) {
      anyFailure = true;
      console.error(`Business invariant failures: ${invariantFailures.join(", ")}`);
    }

    console.log(`\nValidation ${anyFailure ? "FAILED" : "PASSED"}.`);
    if (anyFailure) process.exit(1);
  } finally {
    await sql.end();
  }
}

main().catch((err) => {
  console.error("Validation failed:");
  console.error(err instanceof Error ? err.stack ?? err.message : err);
  process.exit(1);
});
