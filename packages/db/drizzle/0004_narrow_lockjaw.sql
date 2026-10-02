CREATE TABLE "chat_preference" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"read_receipts" boolean DEFAULT true NOT NULL,
	"online_status" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "chat_preference" ADD CONSTRAINT "chat_preference_user_id_app_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."app_user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "message_sender_id_created_at_index" ON "message" USING btree ("sender_id","created_at");