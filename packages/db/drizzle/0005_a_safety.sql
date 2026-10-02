ALTER TABLE "hidden_contact" DROP CONSTRAINT "hidden_contact_user_id_email_hmac_pk";--> statement-breakpoint
ALTER TABLE "profile" ADD COLUMN "hidden_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "hidden_contact" ADD COLUMN "id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL;--> statement-breakpoint
ALTER TABLE "hidden_contact" ADD COLUMN "hint" text NOT NULL;--> statement-breakpoint
ALTER TABLE "app_user" ADD COLUMN "deletion_requested_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "hidden_contact" ADD CONSTRAINT "hidden_contact_userId_emailHmac_unique" UNIQUE("user_id","email_hmac");