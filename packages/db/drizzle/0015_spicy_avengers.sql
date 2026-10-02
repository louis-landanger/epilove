CREATE TABLE "weekly_answer" (
	"week" text NOT NULL,
	"user_id" uuid NOT NULL,
	"question_id" uuid NOT NULL,
	"option" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "weekly_answer_week_user_id_pk" PRIMARY KEY("week","user_id")
);
--> statement-breakpoint
CREATE TABLE "weekly_question" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"slug" text NOT NULL,
	"text_fr" text NOT NULL,
	"text_en" text NOT NULL,
	"options" jsonb NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "weekly_question_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
ALTER TABLE "weekly_answer" ADD CONSTRAINT "weekly_answer_user_id_app_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."app_user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "weekly_answer" ADD CONSTRAINT "weekly_answer_question_id_weekly_question_id_fk" FOREIGN KEY ("question_id") REFERENCES "public"."weekly_question"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "weekly_answer_question_idx" ON "weekly_answer" USING btree ("question_id","week");--> statement-breakpoint
CREATE INDEX "weekly_answer_user_idx" ON "weekly_answer" USING btree ("user_id");