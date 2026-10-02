CREATE TABLE "event" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"organizer_id" uuid,
	"organizer_name" text NOT NULL,
	"title" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"venue" text NOT NULL,
	"spot_id" uuid,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone,
	"cover_key" text,
	"school_ids" uuid[] DEFAULT '{}'::uuid[] NOT NULL,
	"status" text DEFAULT 'published' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "event_status_check" CHECK ("event"."status" in ('published', 'cancelled'))
);
--> statement-breakpoint
CREATE TABLE "event_rsvp" (
	"event_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"status" text NOT NULL,
	"share_with_matches" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "event_rsvp_event_id_user_id_pk" PRIMARY KEY("event_id","user_id"),
	CONSTRAINT "event_rsvp_status_check" CHECK ("event_rsvp"."status" in ('going', 'maybe'))
);
--> statement-breakpoint
ALTER TABLE "event" ADD CONSTRAINT "event_organizer_id_app_user_id_fk" FOREIGN KEY ("organizer_id") REFERENCES "public"."app_user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event" ADD CONSTRAINT "event_spot_id_spot_id_fk" FOREIGN KEY ("spot_id") REFERENCES "public"."spot"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_rsvp" ADD CONSTRAINT "event_rsvp_event_id_event_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."event"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_rsvp" ADD CONSTRAINT "event_rsvp_user_id_app_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."app_user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "event_starts_at_idx" ON "event" USING btree ("starts_at");--> statement-breakpoint
CREATE INDEX "event_rsvp_user_idx" ON "event_rsvp" USING btree ("user_id");