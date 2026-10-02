CREATE TABLE "date_share" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"match_id" uuid NOT NULL,
	"message_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"token_encrypted" "bytea" NOT NULL,
	"details_encrypted" "bytea" NOT NULL,
	"key_id" text NOT NULL,
	"check_in_at" timestamp with time zone NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"check_in_notified_at" timestamp with time zone,
	"check_in_answer" text,
	"checked_in_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "date_share_tokenHash_unique" UNIQUE("token_hash"),
	CONSTRAINT "date_share_answer_check" CHECK ("date_share"."check_in_answer" is null or "date_share"."check_in_answer" in ('ok', 'help'))
);
--> statement-breakpoint
ALTER TABLE "date_share" ADD CONSTRAINT "date_share_user_id_app_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."app_user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "date_share" ADD CONSTRAINT "date_share_match_id_match_id_fk" FOREIGN KEY ("match_id") REFERENCES "public"."match"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "date_share" ADD CONSTRAINT "date_share_message_id_message_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."message"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "date_share_user_idx" ON "date_share" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "date_share_check_in_idx" ON "date_share" USING btree ("check_in_at") WHERE "date_share"."check_in_notified_at" is null and "date_share"."revoked_at" is null;