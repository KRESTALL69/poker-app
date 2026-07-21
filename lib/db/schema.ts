// Drizzle Schema — точная копия текущей рабочей схемы Supabase.
//
// Источник истины: docs/POSTGRES_MIGRATION_AUDIT.md (реальный аудит через
// Supabase MCP). Цель этого файла — воспроизвести существующую схему как
// можно точнее, не улучшая и не исправляя её. Сознательно перенесены как
// есть (без изменений и без "починки"):
//   - мёртвые колонки players.requires_prepayment/no_show_count/last_no_show_at;
//   - отсутствие CHECK на players.nickname_status;
//   - отсутствие FK у results.season_id;
//   - отсутствие UNIQUE на tournament_live_entries.registration_id;
//   - избыточный индекс idx_players_telegram_id рядом с players_telegram_id_key.
// Ни triggers, ни functions, ни RLS, ни enum-типов в реальной схеме нет —
// поэтому их нет и здесь.
//
// ON DELETE у всех FK — подтверждено отдельным запросом к pg_constraint
// (не оставлено дефолтом Drizzle "no action" наугад): везде ON DELETE CASCADE,
// кроме tournaments.season_id (ON DELETE SET NULL) и players.blocked_by
// (без правила, т.е. фактический NO ACTION).
import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  check,
  date,
  foreignKey,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

// ---------------------------------------------------------------------------
// seasons
// ---------------------------------------------------------------------------
export const seasons = pgTable(
  "seasons",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    title: text("title").notNull(),
    startDate: date("start_date").notNull(),
    endDate: date("end_date"),
    isActive: boolean("is_active").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "string" }).notNull().defaultNow(),
  },
  (table) => ({
    // Партиционный unique — гарантирует ровно один активный сезон на уровне БД
    // (confirmed: docs/POSTGRES_MIGRATION_AUDIT.md, раздел "seasons").
    oneActiveSeason: uniqueIndex("one_active_season")
      .on(table.isActive)
      .where(sql`${table.isActive} = true`),
  })
);

// ---------------------------------------------------------------------------
// players
// ---------------------------------------------------------------------------
export const players = pgTable(
  "players",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    telegramId: bigint("telegram_id", { mode: "number" }).unique("players_telegram_id_key"),
    username: text("username"),
    displayName: text("display_name").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "string" }).notNull().defaultNow(),
    role: text("role").notNull().default("player"),
    acceptedTermsAt: timestamp("accepted_terms_at", { withTimezone: true, mode: "string" }),
    acceptedTermsVersion: text("accepted_terms_version"),
    profileCompletedAt: timestamp("profile_completed_at", { withTimezone: true, mode: "string" }),
    // Нет CHECK на уровне БД (confirmed) — сознательно не добавляется здесь.
    nicknameStatus: text("nickname_status").notNull().default("approved"),
    pendingDisplayName: text("pending_display_name"),
    telegramAvatarUrl: text("telegram_avatar_url"),
    customAvatarUrl: text("custom_avatar_url"),
    avatarUpdatedAt: timestamp("avatar_updated_at", { withTimezone: true, mode: "string" }),
    // Мёртвые колонки (confirmed: не используются ни одним Repository-методом,
    // отсутствуют в types/database.ts::PlayerRow) — перенесены как есть.
    requiresPrepayment: boolean("requires_prepayment").default(false),
    noShowCount: integer("no_show_count").default(0),
    lastNoShowAt: timestamp("last_no_show_at", { withTimezone: true, mode: "string" }),
    canAccessPaid: boolean("can_access_paid").notNull().default(false),
    canAccessCash: boolean("can_access_cash").notNull().default(false),
    canAccessFree: boolean("can_access_free").notNull().default(true),
    adminDisplayName: text("admin_display_name"),
    email: text("email"),
    isBlocked: boolean("is_blocked").notNull().default(false),
    blockedAt: timestamp("blocked_at", { withTimezone: true, mode: "string" }),
    blockedBy: uuid("blocked_by"),
    blockReason: text("block_reason"),
  },
  (table) => ({
    // Избыточен рядом с UNIQUE-констрейнтом на этой же колонке (confirmed) —
    // сохранён как есть, удаление такого рода "улучшений" не входит в этот шаг.
    telegramIdIdx: index("idx_players_telegram_id").on(table.telegramId),
    // Функциональный, case-insensitive, частичный unique — совпадает с
    // normalizeEmail() (trim + toLowerCase) в features/auth.ts.
    emailLowerUnique: uniqueIndex("players_email_lower_unique")
      .on(sql`lower(${table.email})`)
      .where(sql`${table.email} is not null`),
    isBlockedIdx: index("players_is_blocked")
      .on(table.isBlocked)
      .where(sql`${table.isBlocked} = true`),
    roleCheck: check("players_role_check", sql`${table.role} = ANY (ARRAY['player'::text, 'admin'::text])`),
    // Self-referential FK — confirmed существует (players_blocked_by_fkey).
    blockedByFk: foreignKey({
      name: "players_blocked_by_fkey",
      columns: [table.blockedBy],
      foreignColumns: [table.id],
    }),
  })
);

// ---------------------------------------------------------------------------
// tournaments
// ---------------------------------------------------------------------------
export const tournaments = pgTable(
  "tournaments",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    title: text("title").notNull(),
    startAt: timestamp("start_at", { withTimezone: true, mode: "string" }).notNull(),
    maxPlayers: integer("max_players").notNull(),
    status: text("status").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "string" }).notNull().defaultNow(),
    seasonId: uuid("season_id"),
    description: text("description"),
    location: text("location"),
    googleSheetTabName: text("google_sheet_tab_name"),
    kind: text("kind").notNull().default("free"),
  },
  (table) => ({
    statusIdx: index("idx_tournaments_status").on(table.status),
    startAtIdx: index("idx_tournaments_start_at").on(table.startAt),
    maxPlayersCheck: check("tournaments_max_players_check", sql`${table.maxPlayers} > 0`),
    statusCheck: check(
      "tournaments_status_check",
      sql`${table.status} = ANY (ARRAY['draft'::text, 'open'::text, 'closed'::text, 'completed'::text])`
    ),
    kindCheck: check(
      "tournaments_kind_check",
      sql`${table.kind} = ANY (ARRAY['free'::text, 'paid'::text, 'cash'::text])`
    ),
    seasonIdFk: foreignKey({
      name: "tournaments_season_id_fkey",
      columns: [table.seasonId],
      foreignColumns: [seasons.id],
    }).onDelete("set null"),
  })
);

// ---------------------------------------------------------------------------
// registrations
// ---------------------------------------------------------------------------
export const registrations = pgTable(
  "registrations",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    playerId: uuid("player_id").notNull(),
    tournamentId: uuid("tournament_id").notNull(),
    status: text("status").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "string" }).notNull().defaultNow(),
  },
  (table) => ({
    playerIdIdx: index("idx_registrations_player_id").on(table.playerId),
    tournamentIdIdx: index("idx_registrations_tournament_id").on(table.tournamentId),
    statusIdx: index("idx_registrations_status").on(table.status),
    playerTournamentUnique: uniqueIndex("registrations_player_id_tournament_id_key").on(
      table.playerId,
      table.tournamentId
    ),
    statusCheck: check(
      "registrations_status_check",
      sql`${table.status} = ANY (ARRAY['registered'::text, 'waitlist'::text, 'cancelled'::text, 'attended'::text])`
    ),
    playerIdFk: foreignKey({
      name: "registrations_player_id_fkey",
      columns: [table.playerId],
      foreignColumns: [players.id],
    }).onDelete("cascade"),
    tournamentIdFk: foreignKey({
      name: "registrations_tournament_id_fkey",
      columns: [table.tournamentId],
      foreignColumns: [tournaments.id],
    }).onDelete("cascade"),
  })
);

// ---------------------------------------------------------------------------
// results
// ---------------------------------------------------------------------------
export const results = pgTable(
  "results",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tournamentId: uuid("tournament_id").notNull(),
    playerId: uuid("player_id").notNull(),
    place: integer("place").notNull(),
    ratingPoints: integer("rating_points").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "string" }).notNull().defaultNow(),
    reentries: integer("reentries").notNull().default(0),
    knockouts: integer("knockouts").notNull().default(0),
    // Денормализация tournaments.season_id, БЕЗ FK (confirmed) — сознательно
    // не усиливается здесь.
    seasonId: uuid("season_id").notNull(),
    winnings: integer("winnings").notNull().default(0),
    addons: integer("addons").notNull().default(0),
    spent: integer("spent").notNull().default(0),
  },
  (table) => ({
    playerIdIdx: index("idx_results_player_id").on(table.playerId),
    tournamentIdIdx: index("idx_results_tournament_id").on(table.tournamentId),
    tournamentPlaceUnique: uniqueIndex("results_tournament_id_place_key").on(
      table.tournamentId,
      table.place
    ),
    tournamentPlayerUnique: uniqueIndex("results_tournament_id_player_id_key").on(
      table.tournamentId,
      table.playerId
    ),
    placeCheck: check("results_place_check", sql`${table.place} > 0`),
    ratingPointsCheck: check("results_rating_points_check", sql`${table.ratingPoints} >= 0`),
    tournamentIdFk: foreignKey({
      name: "results_tournament_id_fkey",
      columns: [table.tournamentId],
      foreignColumns: [tournaments.id],
    }).onDelete("cascade"),
    playerIdFk: foreignKey({
      name: "results_player_id_fkey",
      columns: [table.playerId],
      foreignColumns: [players.id],
    }).onDelete("cascade"),
  })
);

// ---------------------------------------------------------------------------
// player_achievements
// ---------------------------------------------------------------------------
export const playerAchievements = pgTable(
  "player_achievements",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    playerId: uuid("player_id").notNull(),
    // Свободный текст (confirmed) — не Postgres enum, список живёт в коде
    // (ACHIEVEMENT_TARGETS, features/achievements.ts).
    achievementCode: text("achievement_code").notNull(),
    currentValue: integer("current_value").notNull().default(0),
    completedAt: timestamp("completed_at", { withTimezone: true, mode: "string" }),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "string" }).notNull().defaultNow(),
  },
  (table) => ({
    playerIdIdx: index("player_achievements_player_id_idx").on(table.playerId),
    codeIdx: index("player_achievements_code_idx").on(table.achievementCode),
    playerCodeUnique: uniqueIndex("player_achievements_player_id_achievement_code_key").on(
      table.playerId,
      table.achievementCode
    ),
    currentValueCheck: check("player_achievements_current_value_check", sql`${table.currentValue} >= 0`),
    playerIdFk: foreignKey({
      name: "player_achievements_player_id_fkey",
      columns: [table.playerId],
      foreignColumns: [players.id],
    }).onDelete("cascade"),
  })
);

// ---------------------------------------------------------------------------
// tournament_live_entries
// ---------------------------------------------------------------------------
export const tournamentLiveEntries = pgTable(
  "tournament_live_entries",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tournamentId: uuid("tournament_id").notNull(),
    playerId: uuid("player_id").notNull(),
    // 1:1 с registrations по бизнес-логике, но БЕЗ UNIQUE на уровне БД
    // (confirmed) — сознательно не усиливается здесь.
    registrationId: uuid("registration_id").notNull(),
    arrived: boolean("arrived").notNull().default(false),
    rebuys: integer("rebuys").notNull().default(0),
    addons: integer("addons").notNull().default(0),
    knockouts: integer("knockouts").notNull().default(0),
    place: integer("place"),
    sheetRowNumber: integer("sheet_row_number"),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "string" }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "string" }).notNull().defaultNow(),
    winnings: integer("winnings").notNull().default(0),
  },
  (table) => ({
    tournamentIdIdx: index("tournament_live_entries_tournament_id_idx").on(table.tournamentId),
    registrationIdIdx: index("tournament_live_entries_registration_id_idx").on(table.registrationId),
    tournamentPlayerUnique: uniqueIndex("tournament_live_entries_tournament_id_player_id_key").on(
      table.tournamentId,
      table.playerId
    ),
    tournamentIdFk: foreignKey({
      name: "tournament_live_entries_tournament_id_fkey",
      columns: [table.tournamentId],
      foreignColumns: [tournaments.id],
    }).onDelete("cascade"),
    playerIdFk: foreignKey({
      name: "tournament_live_entries_player_id_fkey",
      columns: [table.playerId],
      foreignColumns: [players.id],
    }).onDelete("cascade"),
    registrationIdFk: foreignKey({
      name: "tournament_live_entries_registration_id_fkey",
      columns: [table.registrationId],
      foreignColumns: [registrations.id],
    }).onDelete("cascade"),
  })
);

// ---------------------------------------------------------------------------
// app_settings
// ---------------------------------------------------------------------------
// RLS enabled + 1 policy ("Public read app_settings") в реальной БД — не
// переносится сюда: Drizzle Schema не описывает RLS (см. Deviations в отчёте).
export const appSettings = pgTable("app_settings", {
  key: text("key").primaryKey(),
  value: jsonb("value").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true, mode: "string" }).notNull().defaultNow(),
});

// ---------------------------------------------------------------------------
// activity_events
// ---------------------------------------------------------------------------
// RLS enabled, 0 policies в реальной БД — не переносится сюда (см. выше).
export const activityEvents = pgTable(
  "activity_events",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    playerId: uuid("player_id").notNull(),
    // Свободный текст, фактически user input (confirmed) — не enum.
    eventType: text("event_type").notNull(),
    eventLabel: text("event_label"),
    metadata: jsonb("metadata"),
    platform: text("platform").notNull().default("unknown"),
    sessionId: text("session_id"),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "string" }).notNull().defaultNow(),
  },
  (table) => ({
    createdIdx: index("activity_events_created").on(table.createdAt.desc()),
    playerCreatedIdx: index("activity_events_player_created").on(table.playerId, table.createdAt.desc()),
    typeCreatedIdx: index("activity_events_type_created").on(table.eventType, table.createdAt.desc()),
    playerIdFk: foreignKey({
      name: "activity_events_player_id_fkey",
      columns: [table.playerId],
      foreignColumns: [players.id],
    }).onDelete("cascade"),
  })
);
