CREATE TABLE "campus" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"time_zone" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "campus_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "school" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"campus_id" uuid NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"email_domains" text[] NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "school_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
ALTER TABLE "school" ADD CONSTRAINT "school_campus_id_campus_id_fk" FOREIGN KEY ("campus_id") REFERENCES "public"."campus"("id") ON DELETE restrict ON UPDATE no action;