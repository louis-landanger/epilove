CREATE TABLE "email_digest" (
	"user_id" uuid NOT NULL,
	"week" text NOT NULL,
	"sent_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "email_digest_user_id_week_pk" PRIMARY KEY("user_id","week")
);
--> statement-breakpoint
CREATE TABLE "quiet_hours" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"enabled" boolean NOT NULL,
	"start_hour" integer NOT NULL,
	"end_hour" integer NOT NULL,
	"allow_messages" boolean NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "quiet_hours_start_check" CHECK ("quiet_hours"."start_hour" between 0 and 23),
	CONSTRAINT "quiet_hours_end_check" CHECK ("quiet_hours"."end_hour" between 0 and 23)
);
--> statement-breakpoint
ALTER TABLE "email_digest" ADD CONSTRAINT "email_digest_user_id_app_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."app_user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quiet_hours" ADD CONSTRAINT "quiet_hours_user_id_app_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."app_user"("id") ON DELETE cascade ON UPDATE no action;