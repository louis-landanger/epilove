CREATE TABLE "onboarding_draft" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"data" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "signup_block" (
	"email_hmac" text PRIMARY KEY NOT NULL,
	"reason" text NOT NULL,
	"until" date NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "signup_block_reason_check" CHECK ("signup_block"."reason" in ('underage'))
);
--> statement-breakpoint
ALTER TABLE "photo" ADD COLUMN "stage" text DEFAULT 'uploading' NOT NULL;--> statement-breakpoint
ALTER TABLE "onboarding_draft" ADD CONSTRAINT "onboarding_draft_user_id_app_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."app_user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "photo" ADD CONSTRAINT "photo_stage_check" CHECK ("photo"."stage" in ('uploading', 'processing', 'ready', 'failed'));--> statement-breakpoint
ALTER TABLE "profile" ADD CONSTRAINT "profile_languages_check" CHECK ("profile"."languages" <@ array['fr', 'en', 'es', 'de', 'it', 'pt', 'ar', 'zh', 'ja', 'ko', 'ru', 'tr', 'vi', 'hi']::text[]);