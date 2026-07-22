// Shared table registry for scripts/backfill-supabase-to-postgres.mjs and
// scripts/validate-postgres-backfill.mjs — single source of truth for column
// lists, PK, conflict target, and FK-safe import order, so the two scripts
// can never silently drift apart on which columns/tables they know about.
//
// Column lists and constraints below are taken directly from
// lib/db/schema.ts / docs/POSTGRES_MIGRATION_AUDIT.md — not re-derived or
// guessed. jsonb columns (app_settings.value, activity_events.metadata) are
// flagged so the backfill script knows to wrap them with sql.json(...).
//
// timestampColumns lists every timestamptz/date column so
// validate-postgres-backfill.mjs can normalize them before hashing: the
// Supabase JS client (PostgREST) and postgres.js format the exact same
// timestamptz value differently (microsecond precision + "+00" offset vs.
// millisecond-precision Date objects + "Z" suffix) — comparing the raw
// string/Date forms directly makes every row look different even when the
// underlying value is identical. Found by actually running the validator.

export const TABLES = [
  {
    name: "players",
    pk: "id",
    orderBy: "id",
    columns: [
      "id", "telegram_id", "username", "display_name", "created_at", "role",
      "accepted_terms_at", "accepted_terms_version", "profile_completed_at",
      "nickname_status", "pending_display_name", "telegram_avatar_url",
      "custom_avatar_url", "avatar_updated_at", "requires_prepayment",
      "no_show_count", "last_no_show_at", "can_access_paid", "can_access_cash",
      "can_access_free", "admin_display_name", "email", "is_blocked",
      "blocked_at", "blocked_by", "block_reason",
    ],
    jsonbColumns: [],
    timestampColumns: [
      "created_at", "accepted_terms_at", "profile_completed_at",
      "avatar_updated_at", "last_no_show_at", "blocked_at",
    ],
    // players.blocked_by is a self-referential FK — a row can reference
    // another player inserted later in the same batch. Handled as a
    // separate second pass in the backfill script, never as part of the
    // main upsert, so import order within this table never matters.
    deferredSelfFk: "blocked_by",
  },
  {
    name: "seasons",
    pk: "id",
    orderBy: "id",
    columns: ["id", "title", "start_date", "end_date", "is_active", "created_at"],
    jsonbColumns: [],
    timestampColumns: ["start_date", "end_date", "created_at"],
  },
  {
    name: "tournaments",
    pk: "id",
    orderBy: "id",
    columns: [
      "id", "title", "start_at", "max_players", "status", "created_at",
      "season_id", "description", "location", "google_sheet_tab_name", "kind",
    ],
    jsonbColumns: [],
    timestampColumns: ["start_at", "created_at"],
  },
  {
    name: "registrations",
    pk: "id",
    orderBy: "id",
    columns: ["id", "player_id", "tournament_id", "status", "created_at"],
    jsonbColumns: [],
    timestampColumns: ["created_at"],
  },
  {
    name: "results",
    pk: "id",
    orderBy: "id",
    columns: [
      "id", "tournament_id", "player_id", "place", "rating_points",
      "created_at", "reentries", "knockouts", "season_id", "winnings",
      "addons", "spent",
    ],
    jsonbColumns: [],
    timestampColumns: ["created_at"],
  },
  {
    name: "player_achievements",
    pk: "id",
    orderBy: "id",
    columns: ["id", "player_id", "achievement_code", "current_value", "completed_at", "updated_at"],
    jsonbColumns: [],
    timestampColumns: ["completed_at", "updated_at"],
  },
  {
    name: "app_settings",
    pk: "key",
    orderBy: "key",
    columns: ["key", "value", "updated_at"],
    jsonbColumns: ["value"],
    timestampColumns: ["updated_at"],
  },
  {
    name: "activity_events",
    pk: "id",
    orderBy: "id",
    columns: [
      "id", "player_id", "event_type", "event_label", "metadata", "platform",
      "session_id", "created_at",
    ],
    jsonbColumns: ["metadata"],
    timestampColumns: ["created_at"],
  },
  {
    name: "tournament_live_entries",
    pk: "id",
    orderBy: "id",
    columns: [
      "id", "tournament_id", "player_id", "registration_id", "arrived",
      "rebuys", "addons", "knockouts", "place", "sheet_row_number",
      "created_at", "updated_at", "winnings",
    ],
    jsonbColumns: [],
    timestampColumns: ["created_at", "updated_at"],
  },
];

// FK-safe order (verified against lib/db/schema.ts foreign keys):
//   seasons        -> no deps
//   players        -> self-FK only (blocked_by, deferred, see above)
//   tournaments    -> seasons.id (nullable)
//   registrations  -> players.id, tournaments.id
//   results        -> tournaments.id, players.id (season_id has no FK)
//   player_achievements -> players.id
//   app_settings   -> no deps
//   activity_events -> players.id
//   tournament_live_entries -> tournaments.id, players.id, registrations.id
//
// players before seasons is safe because players has zero dependency on
// seasons — this is the same order the task requested, kept as-is rather
// than reordered, since re-checking against the real schema confirmed it is
// already FK-valid.
export const IMPORT_ORDER = [
  "players",
  "seasons",
  "tournaments",
  "registrations",
  "results",
  "player_achievements",
  "app_settings",
  "activity_events",
  "tournament_live_entries",
];

export function getTable(name) {
  const table = TABLES.find((t) => t.name === name);
  if (!table) throw new Error(`Unknown table in registry: ${name}`);
  return table;
}
