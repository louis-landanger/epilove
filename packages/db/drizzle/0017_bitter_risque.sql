CREATE TABLE "member_badge" (
	"user_id" uuid NOT NULL,
	"badge" text NOT NULL,
	"granted_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "member_badge_user_id_badge_pk" PRIMARY KEY("user_id","badge"),
	CONSTRAINT "member_badge_check" CHECK ("member_badge"."badge" in ('photo_verified', 'ambassador'))
);
--> statement-breakpoint
ALTER TABLE "member_badge" ADD CONSTRAINT "member_badge_user_id_app_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."app_user"("id") ON DELETE cascade ON UPDATE no action;