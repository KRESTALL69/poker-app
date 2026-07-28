ALTER TABLE "tournament_live_entries" ADD COLUMN "cash_buy_in" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "tournament_live_entries" ADD COLUMN "cash_exited" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "tournament_live_entries" ADD COLUMN "cash_cash_out" integer DEFAULT 0 NOT NULL;