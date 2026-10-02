CREATE TABLE "secret_crush" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"user_id" uuid NOT NULL,
	"target_email_hmac" text NOT NULL,
	"hint" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"matched_at" timestamp with time zone,
	"withdrawn_at" timestamp with time zone,
	CONSTRAINT "secret_crush_userId_targetEmailHmac_unique" UNIQUE("user_id","target_email_hmac")
);
--> statement-breakpoint
ALTER TABLE "secret_crush" ADD CONSTRAINT "secret_crush_user_id_app_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."app_user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "secret_crush_target_email_hmac_index" ON "secret_crush" USING btree ("target_email_hmac");