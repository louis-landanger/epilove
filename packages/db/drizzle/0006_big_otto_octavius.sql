ALTER TABLE "pact_result" ADD COLUMN "match_id" uuid;--> statement-breakpoint
ALTER TABLE "pact_season" ADD COLUMN "report" jsonb;--> statement-breakpoint
ALTER TABLE "pact_season" ADD COLUMN "computed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "pact_season" ADD COLUMN "revealed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "pact_result" ADD CONSTRAINT "pact_result_match_id_match_id_fk" FOREIGN KEY ("match_id") REFERENCES "public"."match"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "pact_result_season_id_user_high_index" ON "pact_result" USING btree ("season_id","user_high");