ALTER TABLE "app_user" ADD COLUMN "email_proven_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "app_user" ADD COLUMN "reverify_reminded_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "app_user" ADD COLUMN "paused_for_reverification" boolean DEFAULT false NOT NULL;