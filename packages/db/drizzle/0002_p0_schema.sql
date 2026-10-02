CREATE TABLE "drop" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"user_id" uuid NOT NULL,
	"day" date NOT NULL,
	"candidates" uuid[] NOT NULL,
	"opened_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "drop_userId_day_unique" UNIQUE("user_id","day")
);
--> statement-breakpoint
CREATE TABLE "like_action" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"actor_id" uuid NOT NULL,
	"target_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"target_content_type" text,
	"target_content_id" uuid,
	"comment" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "like_action_actorId_targetId_unique" UNIQUE("actor_id","target_id"),
	CONSTRAINT "like_action_not_self" CHECK ("like_action"."actor_id" <> "like_action"."target_id"),
	CONSTRAINT "like_action_kind_check" CHECK ("like_action"."kind" in ('like', 'superlike', 'pass')),
	CONSTRAINT "like_action_comment_length" CHECK ("like_action"."comment" is null or char_length("like_action"."comment") <= 150)
);
--> statement-breakpoint
CREATE TABLE "match" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"user_low" uuid NOT NULL,
	"user_high" uuid NOT NULL,
	"mode" text NOT NULL,
	"source" text NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"unmatched_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_message_at" timestamp with time zone,
	CONSTRAINT "match_userLow_userHigh_unique" UNIQUE("user_low","user_high"),
	CONSTRAINT "match_ordered_pair" CHECK ("match"."user_low" < "match"."user_high"),
	CONSTRAINT "match_mode_check" CHECK ("match"."mode" in ('love', 'friends')),
	CONSTRAINT "match_source_check" CHECK ("match"."source" in ('like', 'crush', 'pact', 'flash')),
	CONSTRAINT "match_status_check" CHECK ("match"."status" in ('active', 'unmatched'))
);
--> statement-breakpoint
CREATE TABLE "message" (
	"id" uuid PRIMARY KEY NOT NULL,
	"match_id" uuid NOT NULL,
	"sender_id" uuid,
	"kind" text NOT NULL,
	"body_encrypted" "bytea",
	"key_id" text,
	"media_key" text,
	"reply_to" uuid,
	"moderation" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"edited_at" timestamp with time zone,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "message_kind_check" CHECK ("message"."kind" in ('text', 'image', 'voice', 'gif', 'date_proposal', 'system'))
);
--> statement-breakpoint
CREATE TABLE "message_read" (
	"match_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"last_read_message_id" uuid NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "message_read_match_id_user_id_pk" PRIMARY KEY("match_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "reaction" (
	"message_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"emoji" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "reaction_message_id_user_id_pk" PRIMARY KEY("message_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "notification" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"user_id" uuid NOT NULL,
	"type" text NOT NULL,
	"payload" jsonb,
	"read_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "push_subscription" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"user_id" uuid NOT NULL,
	"endpoint" text NOT NULL,
	"p256dh" text NOT NULL,
	"auth" text NOT NULL,
	"user_agent" text,
	"last_success_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "push_subscription_endpoint_unique" UNIQUE("endpoint")
);
--> statement-breakpoint
CREATE TABLE "outbox" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"topic" text NOT NULL,
	"payload" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"published_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "pact_participant" (
	"season_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"modes" text[] NOT NULL,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "pact_participant_season_id_user_id_pk" PRIMARY KEY("season_id","user_id"),
	CONSTRAINT "pact_participant_modes_check" CHECK ("pact_participant"."modes" <@ array['love', 'friends']::text[])
);
--> statement-breakpoint
CREATE TABLE "pact_result" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"season_id" uuid NOT NULL,
	"mode" text NOT NULL,
	"user_low" uuid NOT NULL,
	"user_high" uuid NOT NULL,
	"score" real NOT NULL,
	"explanation" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "pact_result_seasonId_mode_userLow_userHigh_unique" UNIQUE("season_id","mode","user_low","user_high"),
	CONSTRAINT "pact_result_ordered_pair" CHECK ("pact_result"."user_low" < "pact_result"."user_high"),
	CONSTRAINT "pact_result_mode_check" CHECK ("pact_result"."mode" in ('love', 'friends'))
);
--> statement-breakpoint
CREATE TABLE "pact_season" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"opens_at" timestamp with time zone NOT NULL,
	"closes_at" timestamp with time zone NOT NULL,
	"reveal_at" timestamp with time zone NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"threshold" real DEFAULT 0.6 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "pact_season_slug_unique" UNIQUE("slug"),
	CONSTRAINT "pact_season_status_check" CHECK ("pact_season"."status" in ('draft', 'open', 'closed', 'computed', 'revealed')),
	CONSTRAINT "pact_season_dates_check" CHECK ("pact_season"."opens_at" < "pact_season"."closes_at" and "pact_season"."closes_at" < "pact_season"."reveal_at")
);
--> statement-breakpoint
CREATE TABLE "interest" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"slug" text NOT NULL,
	"label_fr" text NOT NULL,
	"label_en" text NOT NULL,
	"category" text NOT NULL,
	CONSTRAINT "interest_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "photo" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"user_id" uuid NOT NULL,
	"storage_key" text NOT NULL,
	"position" smallint NOT NULL,
	"width" integer,
	"height" integer,
	"thumbhash" text,
	"alt_text" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"moderation" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "photo_storageKey_unique" UNIQUE("storage_key"),
	CONSTRAINT "photo_status_check" CHECK ("photo"."status" in ('pending', 'approved', 'rejected')),
	CONSTRAINT "photo_position_check" CHECK ("photo"."position" between 0 and 5)
);
--> statement-breakpoint
CREATE TABLE "preferences" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"modes" text[] DEFAULT '{}' NOT NULL,
	"interested_in" text[] DEFAULT '{}' NOT NULL,
	"age_min" smallint DEFAULT 18 NOT NULL,
	"age_max" smallint DEFAULT 30 NOT NULL,
	"school_filter" uuid[] DEFAULT '{}' NOT NULL,
	"hide_from_own_school" boolean DEFAULT false NOT NULL,
	"hide_from_own_year" boolean DEFAULT false NOT NULL,
	"incognito" boolean DEFAULT false NOT NULL,
	"cross_school_boost" boolean DEFAULT true NOT NULL,
	"discreet_notifications" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "preferences_modes_check" CHECK ("preferences"."modes" <@ array['love', 'friends']::text[]),
	CONSTRAINT "preferences_interested_in_check" CHECK ("preferences"."interested_in" <@ array['woman', 'man', 'nonbinary']::text[]),
	CONSTRAINT "preferences_age_range_check" CHECK ("preferences"."age_min" >= 18 and "preferences"."age_max" >= "preferences"."age_min")
);
--> statement-breakpoint
CREATE TABLE "profile" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"first_name" text NOT NULL,
	"birth_date" date NOT NULL,
	"gender" text NOT NULL,
	"pronouns" text,
	"program" text,
	"graduation_year" smallint NOT NULL,
	"languages" text[] DEFAULT '{}' NOT NULL,
	"intentions" text[] DEFAULT '{}' NOT NULL,
	"anthem" jsonb,
	"embedding" vector(384),
	"completeness" smallint DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "profile_gender_check" CHECK ("profile"."gender" in ('woman', 'man', 'nonbinary')),
	CONSTRAINT "profile_intentions_check" CHECK ("profile"."intentions" <@ array['relationship', 'see_what_happens', 'friendship']::text[]),
	CONSTRAINT "profile_first_name_length" CHECK (char_length("profile"."first_name") between 1 and 40)
);
--> statement-breakpoint
CREATE TABLE "profile_interest" (
	"user_id" uuid NOT NULL,
	"interest_id" uuid NOT NULL,
	CONSTRAINT "profile_interest_user_id_interest_id_pk" PRIMARY KEY("user_id","interest_id")
);
--> statement-breakpoint
CREATE TABLE "prompt" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"slug" text NOT NULL,
	"text_fr" text NOT NULL,
	"text_en" text NOT NULL,
	"category" text NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "prompt_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "prompt_answer" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"user_id" uuid NOT NULL,
	"prompt_id" uuid NOT NULL,
	"text" text,
	"voice_key" text,
	"transcript" text,
	"position" smallint NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "prompt_answer_userId_promptId_unique" UNIQUE("user_id","prompt_id"),
	CONSTRAINT "prompt_answer_text_length" CHECK ("prompt_answer"."text" is null or char_length("prompt_answer"."text") <= 200)
);
--> statement-breakpoint
CREATE TABLE "question" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"slug" text NOT NULL,
	"section" text NOT NULL,
	"text_fr" text NOT NULL,
	"text_en" text NOT NULL,
	"options" jsonb NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"pact_only" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "question_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "question_answer" (
	"user_id" uuid NOT NULL,
	"question_id" uuid NOT NULL,
	"answer" text NOT NULL,
	"acceptable" text[] NOT NULL,
	"importance" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "question_answer_user_id_question_id_pk" PRIMARY KEY("user_id","question_id"),
	CONSTRAINT "question_answer_importance_check" CHECK ("question_answer"."importance" in ('irrelevant', 'little', 'somewhat', 'very', 'mandatory'))
);
--> statement-breakpoint
CREATE TABLE "appeal" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"action_id" uuid NOT NULL,
	"text" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"reviewer_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"decided_at" timestamp with time zone,
	CONSTRAINT "appeal_status_check" CHECK ("appeal"."status" in ('pending', 'upheld', 'overturned'))
);
--> statement-breakpoint
CREATE TABLE "audit_log" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"actor_id" uuid,
	"action" text NOT NULL,
	"target_type" text NOT NULL,
	"target_id" text,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "block" (
	"blocker_id" uuid NOT NULL,
	"blocked_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "block_blocker_id_blocked_id_pk" PRIMARY KEY("blocker_id","blocked_id"),
	CONSTRAINT "block_not_self" CHECK ("block"."blocker_id" <> "block"."blocked_id")
);
--> statement-breakpoint
CREATE TABLE "hidden_contact" (
	"user_id" uuid NOT NULL,
	"email_hmac" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "hidden_contact_user_id_email_hmac_pk" PRIMARY KEY("user_id","email_hmac")
);
--> statement-breakpoint
CREATE TABLE "moderation_action" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"report_id" uuid,
	"target_user_id" uuid,
	"moderator_id" uuid,
	"action" text NOT NULL,
	"rule" text NOT NULL,
	"statement" text NOT NULL,
	"expires_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "moderation_action_check" CHECK ("moderation_action"."action" in ('warning', 'restriction', 'suspension', 'ban', 'content_removal', 'no_action'))
);
--> statement-breakpoint
CREATE TABLE "report" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"reporter_id" uuid,
	"reported_id" uuid,
	"context" text NOT NULL,
	"context_ref" text,
	"reason" text NOT NULL,
	"details_encrypted" "bytea",
	"key_id" text,
	"priority" text NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"assigned_to" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"resolved_at" timestamp with time zone,
	CONSTRAINT "report_context_check" CHECK ("report"."context" in ('profile', 'photo', 'message', 'event')),
	CONSTRAINT "report_reason_check" CHECK ("report"."reason" in ('harassment', 'threat', 'explicit_content', 'hate', 'minor', 'impersonation', 'outing', 'spam', 'not_on_campus', 'other')),
	CONSTRAINT "report_priority_check" CHECK ("report"."priority" in ('p1', 'p2', 'p3')),
	CONSTRAINT "report_status_check" CHECK ("report"."status" in ('open', 'in_review', 'resolved', 'dismissed'))
);
--> statement-breakpoint
CREATE TABLE "app_user" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"school_id" uuid NOT NULL,
	"email" text NOT NULL,
	"email_hmac" text NOT NULL,
	"email_verified" boolean DEFAULT false NOT NULL,
	"name" text DEFAULT '' NOT NULL,
	"image" text,
	"role" text DEFAULT 'user' NOT NULL,
	"banned" boolean DEFAULT false NOT NULL,
	"ban_reason" text,
	"ban_expires" timestamp with time zone,
	"status" text DEFAULT 'onboarding' NOT NULL,
	"verified_at" timestamp with time zone,
	"reverify_due_at" timestamp with time zone,
	"last_active_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "app_user_email_unique" UNIQUE("email"),
	CONSTRAINT "app_user_emailHmac_unique" UNIQUE("email_hmac"),
	CONSTRAINT "app_user_role_check" CHECK ("app_user"."role" in ('user', 'organizer', 'moderator', 'admin')),
	CONSTRAINT "app_user_status_check" CHECK ("app_user"."status" in ('onboarding', 'active', 'paused', 'restricted', 'suspended', 'banned', 'deleting'))
);
--> statement-breakpoint
CREATE TABLE "consent" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"user_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"version" text NOT NULL,
	"granted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"withdrawn_at" timestamp with time zone,
	CONSTRAINT "consent_kind_check" CHECK ("consent"."kind" in ('terms', 'privacy', 'sensitive_data', 'ai_features', 'email_digest'))
);
--> statement-breakpoint
CREATE TABLE "waitlist_entry" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"email_hmac" text NOT NULL,
	"school_id" uuid NOT NULL,
	"referral_code" text NOT NULL,
	"referred_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "waitlist_entry_emailHmac_unique" UNIQUE("email_hmac"),
	CONSTRAINT "waitlist_entry_referralCode_unique" UNIQUE("referral_code")
);
--> statement-breakpoint
ALTER TABLE "drop" ADD CONSTRAINT "drop_user_id_app_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."app_user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "like_action" ADD CONSTRAINT "like_action_actor_id_app_user_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."app_user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "like_action" ADD CONSTRAINT "like_action_target_id_app_user_id_fk" FOREIGN KEY ("target_id") REFERENCES "public"."app_user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "match" ADD CONSTRAINT "match_user_low_app_user_id_fk" FOREIGN KEY ("user_low") REFERENCES "public"."app_user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "match" ADD CONSTRAINT "match_user_high_app_user_id_fk" FOREIGN KEY ("user_high") REFERENCES "public"."app_user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "match" ADD CONSTRAINT "match_unmatched_by_app_user_id_fk" FOREIGN KEY ("unmatched_by") REFERENCES "public"."app_user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "message" ADD CONSTRAINT "message_match_id_match_id_fk" FOREIGN KEY ("match_id") REFERENCES "public"."match"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "message" ADD CONSTRAINT "message_sender_id_app_user_id_fk" FOREIGN KEY ("sender_id") REFERENCES "public"."app_user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "message_read" ADD CONSTRAINT "message_read_match_id_match_id_fk" FOREIGN KEY ("match_id") REFERENCES "public"."match"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "message_read" ADD CONSTRAINT "message_read_user_id_app_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."app_user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reaction" ADD CONSTRAINT "reaction_message_id_message_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."message"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reaction" ADD CONSTRAINT "reaction_user_id_app_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."app_user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification" ADD CONSTRAINT "notification_user_id_app_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."app_user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "push_subscription" ADD CONSTRAINT "push_subscription_user_id_app_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."app_user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pact_participant" ADD CONSTRAINT "pact_participant_season_id_pact_season_id_fk" FOREIGN KEY ("season_id") REFERENCES "public"."pact_season"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pact_participant" ADD CONSTRAINT "pact_participant_user_id_app_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."app_user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pact_result" ADD CONSTRAINT "pact_result_season_id_pact_season_id_fk" FOREIGN KEY ("season_id") REFERENCES "public"."pact_season"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pact_result" ADD CONSTRAINT "pact_result_user_low_app_user_id_fk" FOREIGN KEY ("user_low") REFERENCES "public"."app_user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pact_result" ADD CONSTRAINT "pact_result_user_high_app_user_id_fk" FOREIGN KEY ("user_high") REFERENCES "public"."app_user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "photo" ADD CONSTRAINT "photo_user_id_app_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."app_user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "preferences" ADD CONSTRAINT "preferences_user_id_app_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."app_user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "profile" ADD CONSTRAINT "profile_user_id_app_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."app_user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "profile_interest" ADD CONSTRAINT "profile_interest_user_id_app_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."app_user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "profile_interest" ADD CONSTRAINT "profile_interest_interest_id_interest_id_fk" FOREIGN KEY ("interest_id") REFERENCES "public"."interest"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prompt_answer" ADD CONSTRAINT "prompt_answer_user_id_app_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."app_user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prompt_answer" ADD CONSTRAINT "prompt_answer_prompt_id_prompt_id_fk" FOREIGN KEY ("prompt_id") REFERENCES "public"."prompt"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "question_answer" ADD CONSTRAINT "question_answer_user_id_app_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."app_user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "question_answer" ADD CONSTRAINT "question_answer_question_id_question_id_fk" FOREIGN KEY ("question_id") REFERENCES "public"."question"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "appeal" ADD CONSTRAINT "appeal_action_id_moderation_action_id_fk" FOREIGN KEY ("action_id") REFERENCES "public"."moderation_action"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "appeal" ADD CONSTRAINT "appeal_reviewer_id_app_user_id_fk" FOREIGN KEY ("reviewer_id") REFERENCES "public"."app_user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "block" ADD CONSTRAINT "block_blocker_id_app_user_id_fk" FOREIGN KEY ("blocker_id") REFERENCES "public"."app_user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "block" ADD CONSTRAINT "block_blocked_id_app_user_id_fk" FOREIGN KEY ("blocked_id") REFERENCES "public"."app_user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hidden_contact" ADD CONSTRAINT "hidden_contact_user_id_app_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."app_user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "moderation_action" ADD CONSTRAINT "moderation_action_report_id_report_id_fk" FOREIGN KEY ("report_id") REFERENCES "public"."report"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "moderation_action" ADD CONSTRAINT "moderation_action_target_user_id_app_user_id_fk" FOREIGN KEY ("target_user_id") REFERENCES "public"."app_user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "moderation_action" ADD CONSTRAINT "moderation_action_moderator_id_app_user_id_fk" FOREIGN KEY ("moderator_id") REFERENCES "public"."app_user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "report" ADD CONSTRAINT "report_reporter_id_app_user_id_fk" FOREIGN KEY ("reporter_id") REFERENCES "public"."app_user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "report" ADD CONSTRAINT "report_reported_id_app_user_id_fk" FOREIGN KEY ("reported_id") REFERENCES "public"."app_user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "report" ADD CONSTRAINT "report_assigned_to_app_user_id_fk" FOREIGN KEY ("assigned_to") REFERENCES "public"."app_user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app_user" ADD CONSTRAINT "app_user_school_id_school_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."school"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "consent" ADD CONSTRAINT "consent_user_id_app_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."app_user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "waitlist_entry" ADD CONSTRAINT "waitlist_entry_school_id_school_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."school"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "like_action_target_id_created_at_index" ON "like_action" USING btree ("target_id","created_at");--> statement-breakpoint
CREATE INDEX "match_user_high_index" ON "match" USING btree ("user_high");--> statement-breakpoint
CREATE INDEX "message_match_id_id_index" ON "message" USING btree ("match_id","id" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "notification_user_id_created_at_index" ON "notification" USING btree ("user_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "outbox_pending_idx" ON "outbox" USING btree ("created_at") WHERE "outbox"."published_at" is null;--> statement-breakpoint
CREATE INDEX "photo_user_id_position_index" ON "photo" USING btree ("user_id","position");--> statement-breakpoint
CREATE INDEX "profile_embedding_idx" ON "profile" USING hnsw ("embedding" vector_cosine_ops);--> statement-breakpoint
CREATE INDEX "audit_log_target_type_target_id_index" ON "audit_log" USING btree ("target_type","target_id");--> statement-breakpoint
CREATE INDEX "audit_log_actor_id_index" ON "audit_log" USING btree ("actor_id");--> statement-breakpoint
CREATE INDEX "block_blocked_id_index" ON "block" USING btree ("blocked_id");--> statement-breakpoint
CREATE INDEX "hidden_contact_email_hmac_index" ON "hidden_contact" USING btree ("email_hmac");--> statement-breakpoint
CREATE INDEX "moderation_action_target_user_id_index" ON "moderation_action" USING btree ("target_user_id");--> statement-breakpoint
CREATE INDEX "report_status_priority_created_at_index" ON "report" USING btree ("status","priority","created_at");--> statement-breakpoint
CREATE INDEX "report_reported_id_index" ON "report" USING btree ("reported_id");--> statement-breakpoint
CREATE INDEX "app_user_active_idx" ON "app_user" USING btree ("last_active_at") WHERE "app_user"."status" = 'active';--> statement-breakpoint
CREATE INDEX "consent_user_id_kind_index" ON "consent" USING btree ("user_id","kind");