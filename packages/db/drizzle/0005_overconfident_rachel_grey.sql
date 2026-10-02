CREATE TABLE "notification_preference" (
	"user_id" uuid NOT NULL,
	"group" text NOT NULL,
	"push" boolean NOT NULL,
	"email" boolean NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "notification_preference_user_id_group_pk" PRIMARY KEY("user_id","group")
);
--> statement-breakpoint
ALTER TABLE "notification" ADD COLUMN "pushed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "notification_preference" ADD CONSTRAINT "notification_preference_user_id_app_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."app_user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "notification_push_pending_idx" ON "notification" USING btree ("created_at") WHERE "notification"."pushed_at" is null;