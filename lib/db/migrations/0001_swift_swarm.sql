CREATE TABLE "email_otp_codes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"purpose" text NOT NULL,
	"player_id" uuid,
	"code_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"resend_after_at" timestamp with time zone NOT NULL,
	"failed_attempts" integer DEFAULT 0 NOT NULL,
	"consumed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "email_otp_codes_purpose_check" CHECK ("email_otp_codes"."purpose" = ANY (ARRAY['login'::text, 'link_email'::text]))
);
--> statement-breakpoint
ALTER TABLE "email_otp_codes" ADD CONSTRAINT "email_otp_codes_player_id_fkey" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "email_otp_codes_active_idx" ON "email_otp_codes" USING btree ("email","purpose","consumed_at","expires_at");--> statement-breakpoint
CREATE INDEX "email_otp_codes_email_purpose_idx" ON "email_otp_codes" USING btree ("email","purpose","created_at");--> statement-breakpoint
CREATE INDEX "email_otp_codes_expires_at_idx" ON "email_otp_codes" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "email_otp_codes_player_id_idx" ON "email_otp_codes" USING btree ("player_id");