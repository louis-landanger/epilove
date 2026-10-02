CREATE TABLE "flash_scan" (
	"event_id" uuid NOT NULL,
	"scanner_id" uuid NOT NULL,
	"scanned_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "flash_scan_event_id_scanner_id_scanned_id_pk" PRIMARY KEY("event_id","scanner_id","scanned_id")
);
--> statement-breakpoint
ALTER TABLE "flash_scan" ADD CONSTRAINT "flash_scan_event_id_event_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."event"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "flash_scan" ADD CONSTRAINT "flash_scan_scanner_id_app_user_id_fk" FOREIGN KEY ("scanner_id") REFERENCES "public"."app_user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "flash_scan" ADD CONSTRAINT "flash_scan_scanned_id_app_user_id_fk" FOREIGN KEY ("scanned_id") REFERENCES "public"."app_user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "flash_scan_scanner_idx" ON "flash_scan" USING btree ("scanner_id","created_at");