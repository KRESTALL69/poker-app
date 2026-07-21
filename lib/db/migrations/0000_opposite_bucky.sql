CREATE TABLE "activity_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"player_id" uuid NOT NULL,
	"event_type" text NOT NULL,
	"event_label" text,
	"metadata" jsonb,
	"platform" text DEFAULT 'unknown' NOT NULL,
	"session_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "app_settings" (
	"key" text PRIMARY KEY NOT NULL,
	"value" jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "player_achievements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"player_id" uuid NOT NULL,
	"achievement_code" text NOT NULL,
	"current_value" integer DEFAULT 0 NOT NULL,
	"completed_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "player_achievements_current_value_check" CHECK ("player_achievements"."current_value" >= 0)
);
--> statement-breakpoint
CREATE TABLE "players" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"telegram_id" bigint,
	"username" text,
	"display_name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"role" text DEFAULT 'player' NOT NULL,
	"accepted_terms_at" timestamp with time zone,
	"accepted_terms_version" text,
	"profile_completed_at" timestamp with time zone,
	"nickname_status" text DEFAULT 'approved' NOT NULL,
	"pending_display_name" text,
	"telegram_avatar_url" text,
	"custom_avatar_url" text,
	"avatar_updated_at" timestamp with time zone,
	"requires_prepayment" boolean DEFAULT false,
	"no_show_count" integer DEFAULT 0,
	"last_no_show_at" timestamp with time zone,
	"can_access_paid" boolean DEFAULT false NOT NULL,
	"can_access_cash" boolean DEFAULT false NOT NULL,
	"can_access_free" boolean DEFAULT true NOT NULL,
	"admin_display_name" text,
	"email" text,
	"is_blocked" boolean DEFAULT false NOT NULL,
	"blocked_at" timestamp with time zone,
	"blocked_by" uuid,
	"block_reason" text,
	CONSTRAINT "players_telegram_id_key" UNIQUE("telegram_id"),
	CONSTRAINT "players_role_check" CHECK ("players"."role" = ANY (ARRAY['player'::text, 'admin'::text]))
);
--> statement-breakpoint
CREATE TABLE "registrations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"player_id" uuid NOT NULL,
	"tournament_id" uuid NOT NULL,
	"status" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "registrations_status_check" CHECK ("registrations"."status" = ANY (ARRAY['registered'::text, 'waitlist'::text, 'cancelled'::text, 'attended'::text]))
);
--> statement-breakpoint
CREATE TABLE "results" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tournament_id" uuid NOT NULL,
	"player_id" uuid NOT NULL,
	"place" integer NOT NULL,
	"rating_points" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"reentries" integer DEFAULT 0 NOT NULL,
	"knockouts" integer DEFAULT 0 NOT NULL,
	"season_id" uuid NOT NULL,
	"winnings" integer DEFAULT 0 NOT NULL,
	"addons" integer DEFAULT 0 NOT NULL,
	"spent" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "results_place_check" CHECK ("results"."place" > 0),
	CONSTRAINT "results_rating_points_check" CHECK ("results"."rating_points" >= 0)
);
--> statement-breakpoint
CREATE TABLE "seasons" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" text NOT NULL,
	"start_date" date NOT NULL,
	"end_date" date,
	"is_active" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tournament_live_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tournament_id" uuid NOT NULL,
	"player_id" uuid NOT NULL,
	"registration_id" uuid NOT NULL,
	"arrived" boolean DEFAULT false NOT NULL,
	"rebuys" integer DEFAULT 0 NOT NULL,
	"addons" integer DEFAULT 0 NOT NULL,
	"knockouts" integer DEFAULT 0 NOT NULL,
	"place" integer,
	"sheet_row_number" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"winnings" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tournaments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" text NOT NULL,
	"start_at" timestamp with time zone NOT NULL,
	"max_players" integer NOT NULL,
	"status" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"season_id" uuid,
	"description" text,
	"location" text,
	"google_sheet_tab_name" text,
	"kind" text DEFAULT 'free' NOT NULL,
	CONSTRAINT "tournaments_max_players_check" CHECK ("tournaments"."max_players" > 0),
	CONSTRAINT "tournaments_status_check" CHECK ("tournaments"."status" = ANY (ARRAY['draft'::text, 'open'::text, 'closed'::text, 'completed'::text])),
	CONSTRAINT "tournaments_kind_check" CHECK ("tournaments"."kind" = ANY (ARRAY['free'::text, 'paid'::text, 'cash'::text]))
);
--> statement-breakpoint
ALTER TABLE "activity_events" ADD CONSTRAINT "activity_events_player_id_fkey" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "player_achievements" ADD CONSTRAINT "player_achievements_player_id_fkey" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "players" ADD CONSTRAINT "players_blocked_by_fkey" FOREIGN KEY ("blocked_by") REFERENCES "public"."players"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "registrations" ADD CONSTRAINT "registrations_player_id_fkey" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "registrations" ADD CONSTRAINT "registrations_tournament_id_fkey" FOREIGN KEY ("tournament_id") REFERENCES "public"."tournaments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "results" ADD CONSTRAINT "results_tournament_id_fkey" FOREIGN KEY ("tournament_id") REFERENCES "public"."tournaments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "results" ADD CONSTRAINT "results_player_id_fkey" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tournament_live_entries" ADD CONSTRAINT "tournament_live_entries_tournament_id_fkey" FOREIGN KEY ("tournament_id") REFERENCES "public"."tournaments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tournament_live_entries" ADD CONSTRAINT "tournament_live_entries_player_id_fkey" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tournament_live_entries" ADD CONSTRAINT "tournament_live_entries_registration_id_fkey" FOREIGN KEY ("registration_id") REFERENCES "public"."registrations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tournaments" ADD CONSTRAINT "tournaments_season_id_fkey" FOREIGN KEY ("season_id") REFERENCES "public"."seasons"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "activity_events_created" ON "activity_events" USING btree ("created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "activity_events_player_created" ON "activity_events" USING btree ("player_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "activity_events_type_created" ON "activity_events" USING btree ("event_type","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "player_achievements_player_id_idx" ON "player_achievements" USING btree ("player_id");--> statement-breakpoint
CREATE INDEX "player_achievements_code_idx" ON "player_achievements" USING btree ("achievement_code");--> statement-breakpoint
CREATE UNIQUE INDEX "player_achievements_player_id_achievement_code_key" ON "player_achievements" USING btree ("player_id","achievement_code");--> statement-breakpoint
CREATE INDEX "idx_players_telegram_id" ON "players" USING btree ("telegram_id");--> statement-breakpoint
CREATE UNIQUE INDEX "players_email_lower_unique" ON "players" USING btree (lower("email")) WHERE "players"."email" is not null;--> statement-breakpoint
CREATE INDEX "players_is_blocked" ON "players" USING btree ("is_blocked") WHERE "players"."is_blocked" = true;--> statement-breakpoint
CREATE INDEX "idx_registrations_player_id" ON "registrations" USING btree ("player_id");--> statement-breakpoint
CREATE INDEX "idx_registrations_tournament_id" ON "registrations" USING btree ("tournament_id");--> statement-breakpoint
CREATE INDEX "idx_registrations_status" ON "registrations" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "registrations_player_id_tournament_id_key" ON "registrations" USING btree ("player_id","tournament_id");--> statement-breakpoint
CREATE INDEX "idx_results_player_id" ON "results" USING btree ("player_id");--> statement-breakpoint
CREATE INDEX "idx_results_tournament_id" ON "results" USING btree ("tournament_id");--> statement-breakpoint
CREATE UNIQUE INDEX "results_tournament_id_place_key" ON "results" USING btree ("tournament_id","place");--> statement-breakpoint
CREATE UNIQUE INDEX "results_tournament_id_player_id_key" ON "results" USING btree ("tournament_id","player_id");--> statement-breakpoint
CREATE UNIQUE INDEX "one_active_season" ON "seasons" USING btree ("is_active") WHERE "seasons"."is_active" = true;--> statement-breakpoint
CREATE INDEX "tournament_live_entries_tournament_id_idx" ON "tournament_live_entries" USING btree ("tournament_id");--> statement-breakpoint
CREATE INDEX "tournament_live_entries_registration_id_idx" ON "tournament_live_entries" USING btree ("registration_id");--> statement-breakpoint
CREATE UNIQUE INDEX "tournament_live_entries_tournament_id_player_id_key" ON "tournament_live_entries" USING btree ("tournament_id","player_id");--> statement-breakpoint
CREATE INDEX "idx_tournaments_status" ON "tournaments" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_tournaments_start_at" ON "tournaments" USING btree ("start_at");