ALTER TABLE "like_action" ADD COLUMN "blind" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "match" ADD COLUMN "blind" boolean DEFAULT false NOT NULL;