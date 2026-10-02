CREATE TABLE "discovery_filter" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"mode" text DEFAULT 'all' NOT NULL,
	"school_slugs" text[] DEFAULT '{}' NOT NULL,
	"graduation_years" smallint[] DEFAULT '{}' NOT NULL,
	"intentions" text[] DEFAULT '{}' NOT NULL,
	"age_min" smallint,
	"age_max" smallint,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "discovery_filter_mode_check" CHECK ("discovery_filter"."mode" in ('all', 'love', 'friends')),
	CONSTRAINT "discovery_filter_intentions_check" CHECK ("discovery_filter"."intentions" <@ array['relationship', 'see_what_happens', 'friendship']::text[]),
	CONSTRAINT "discovery_filter_age_check" CHECK (("discovery_filter"."age_min" is null or "discovery_filter"."age_min" >= 18) and ("discovery_filter"."age_max" is null or "discovery_filter"."age_min" is null or "discovery_filter"."age_max" >= "discovery_filter"."age_min"))
);
--> statement-breakpoint
CREATE TABLE "discovery_undo" (
	"user_id" uuid NOT NULL,
	"day" date NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "discovery_undo_user_id_day_pk" PRIMARY KEY("user_id","day")
);
--> statement-breakpoint
CREATE TABLE "impression" (
	"viewer_id" uuid NOT NULL,
	"target_id" uuid NOT NULL,
	"surface" text NOT NULL,
	"day" date NOT NULL,
	"count" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "impression_viewer_id_target_id_surface_day_pk" PRIMARY KEY("viewer_id","target_id","surface","day"),
	CONSTRAINT "impression_surface_check" CHECK ("impression"."surface" in ('deck', 'drop', 'profile'))
);
--> statement-breakpoint
ALTER TABLE "discovery_filter" ADD CONSTRAINT "discovery_filter_user_id_app_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."app_user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "discovery_undo" ADD CONSTRAINT "discovery_undo_user_id_app_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."app_user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "impression" ADD CONSTRAINT "impression_viewer_id_app_user_id_fk" FOREIGN KEY ("viewer_id") REFERENCES "public"."app_user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "impression" ADD CONSTRAINT "impression_target_id_app_user_id_fk" FOREIGN KEY ("target_id") REFERENCES "public"."app_user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "impression_target_id_day_index" ON "impression" USING btree ("target_id","day");