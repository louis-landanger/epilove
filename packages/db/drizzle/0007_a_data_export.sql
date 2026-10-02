CREATE TABLE "data_export" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"user_id" uuid NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"storage_key" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ready_at" timestamp with time zone,
	"expires_at" timestamp with time zone,
	CONSTRAINT "data_export_status_check" CHECK ("data_export"."status" in ('pending', 'ready', 'failed'))
);
--> statement-breakpoint
ALTER TABLE "data_export" ADD CONSTRAINT "data_export_user_id_app_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."app_user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "data_export_user_id_index" ON "data_export" USING btree ("user_id");