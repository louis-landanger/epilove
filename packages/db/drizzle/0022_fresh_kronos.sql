CREATE TABLE "ai_icebreaker_request" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "ai_icebreaker_request" ADD CONSTRAINT "ai_icebreaker_request_user_id_app_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."app_user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ai_icebreaker_request_user_idx" ON "ai_icebreaker_request" USING btree ("user_id","created_at");