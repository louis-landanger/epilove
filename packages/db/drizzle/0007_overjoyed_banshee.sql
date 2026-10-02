CREATE TABLE "drop_run" (
	"day" date PRIMARY KEY NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"computed_at" timestamp with time zone,
	"published_at" timestamp with time zone,
	"stats" jsonb
);
--> statement-breakpoint
CREATE INDEX "drop_day_index" ON "drop" USING btree ("day");