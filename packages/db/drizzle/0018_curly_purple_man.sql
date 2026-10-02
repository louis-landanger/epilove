CREATE TABLE "availability" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"activity" text NOT NULL,
	"area" text NOT NULL,
	"until" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "availability_activity_check" CHECK ("availability"."activity" in ('coffee', 'lunch', 'study', 'walk', 'sport', 'drink')),
	CONSTRAINT "availability_area_check" CHECK ("availability"."area" in ('campus', 'city'))
);
--> statement-breakpoint
ALTER TABLE "availability" ADD CONSTRAINT "availability_user_id_app_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."app_user"("id") ON DELETE cascade ON UPDATE no action;