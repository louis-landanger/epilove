CREATE TABLE "auth_account" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"account_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"id_token" text,
	"access_token_expires_at" timestamp with time zone,
	"refresh_token_expires_at" timestamp with time zone,
	"scope" text,
	"password" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "auth_passkey" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"name" text,
	"public_key" text NOT NULL,
	"credential_id" text NOT NULL,
	"counter" integer NOT NULL,
	"device_type" text NOT NULL,
	"backed_up" boolean NOT NULL,
	"transports" text,
	"aaguid" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "auth_session" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"token" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"impersonated_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "auth_session_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "auth_verification" (
	"id" uuid PRIMARY KEY NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "availability" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"activity" text NOT NULL,
	"area" text NOT NULL,
	"until" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "availability_activity_check" CHECK ("availability"."activity" in ('coffee', 'lunch', 'study', 'walk', 'sport', 'drink')),
	CONSTRAINT "availability_area_check" CHECK ("availability"."area" in ('campus', 'city'))
);
--> statement-breakpoint
CREATE TABLE "member_badge" (
	"user_id" uuid NOT NULL,
	"badge" text NOT NULL,
	"granted_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "member_badge_user_id_badge_pk" PRIMARY KEY("user_id","badge"),
	CONSTRAINT "member_badge_check" CHECK ("member_badge"."badge" in ('photo_verified', 'ambassador'))
);
--> statement-breakpoint
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
CREATE TABLE "discovery_filter" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"mode" text DEFAULT 'all' NOT NULL,
	"school_slugs" text[] DEFAULT '{}' NOT NULL,
	"graduation_years" smallint[] DEFAULT '{}' NOT NULL,
	"intentions" text[] DEFAULT '{}' NOT NULL,
	"age_min" smallint,
	"age_max" smallint,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "discovery_filter_mode_check" CHECK ("discovery_filter"."mode" in ('all', 'love', 'friends')),
	CONSTRAINT "discovery_filter_intentions_check" CHECK ("discovery_filter"."intentions" <@ array['relationship', 'see_what_happens', 'friendship']::text[]),
	CONSTRAINT "discovery_filter_age_check" CHECK (("discovery_filter"."age_min" is null or "discovery_filter"."age_min" >= 18) and ("discovery_filter"."age_max" is null or "discovery_filter"."age_min" is null or "discovery_filter"."age_max" >= "discovery_filter"."age_min"))
);
--> statement-breakpoint
CREATE TABLE "discovery_undo" (
	"user_id" uuid NOT NULL,
	"day" date NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "discovery_undo_user_id_day_pk" PRIMARY KEY("user_id","day")
);
--> statement-breakpoint
CREATE TABLE "drop_run" (
	"day" date PRIMARY KEY NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"computed_at" timestamp with time zone,
	"published_at" timestamp with time zone,
	"stats" jsonb
);
--> statement-breakpoint
CREATE TABLE "impression" (
	"viewer_id" uuid NOT NULL,
	"target_id" uuid NOT NULL,
	"surface" text NOT NULL,
	"day" date NOT NULL,
	"count" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "impression_viewer_id_target_id_surface_day_pk" PRIMARY KEY("viewer_id","target_id","surface","day"),
	CONSTRAINT "impression_surface_check" CHECK ("impression"."surface" in ('deck', 'drop', 'profile'))
);
--> statement-breakpoint
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
CREATE TABLE "event" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"organizer_id" uuid,
	"organizer_name" text NOT NULL,
	"title" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"venue" text NOT NULL,
	"spot_id" uuid,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone,
	"cover_key" text,
	"school_ids" uuid[] DEFAULT '{}'::uuid[] NOT NULL,
	"status" text DEFAULT 'published' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "event_status_check" CHECK ("event"."status" in ('published', 'cancelled'))
);
--> statement-breakpoint
CREATE TABLE "event_rsvp" (
	"event_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"status" text NOT NULL,
	"share_with_matches" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "event_rsvp_event_id_user_id_pk" PRIMARY KEY("event_id","user_id"),
	CONSTRAINT "event_rsvp_status_check" CHECK ("event_rsvp"."status" in ('going', 'maybe'))
);
--> statement-breakpoint
CREATE TABLE "flash_scan" (
	"event_id" uuid NOT NULL,
	"scanner_id" uuid NOT NULL,
	"scanned_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "flash_scan_event_id_scanner_id_scanned_id_pk" PRIMARY KEY("event_id","scanner_id","scanned_id")
);
--> statement-breakpoint
CREATE TABLE "ai_icebreaker_request" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "chat_preference" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"read_receipts" boolean DEFAULT true NOT NULL,
	"online_status" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "media_deletion" (
	"storage_key" text PRIMARY KEY NOT NULL,
	"delete_after" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "email_digest" (
	"user_id" uuid NOT NULL,
	"week" text NOT NULL,
	"sent_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "email_digest_user_id_week_pk" PRIMARY KEY("user_id","week")
);
--> statement-breakpoint
CREATE TABLE "notification_preference" (
	"user_id" uuid NOT NULL,
	"group" text NOT NULL,
	"push" boolean NOT NULL,
	"email" boolean NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "notification_preference_user_id_group_pk" PRIMARY KEY("user_id","group")
);
--> statement-breakpoint
CREATE TABLE "quiet_hours" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"enabled" boolean NOT NULL,
	"start_hour" integer NOT NULL,
	"end_hour" integer NOT NULL,
	"allow_messages" boolean NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "quiet_hours_start_check" CHECK ("quiet_hours"."start_hour" between 0 and 23),
	CONSTRAINT "quiet_hours_end_check" CHECK ("quiet_hours"."end_hour" between 0 and 23)
);
--> statement-breakpoint
CREATE TABLE "photo_verification" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"user_id" uuid NOT NULL,
	"gesture" text NOT NULL,
	"status" text DEFAULT 'uploading' NOT NULL,
	"storage_key" text,
	"rejection" text,
	"reviewed_by" uuid,
	"reviewed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "photo_verification_gesture_check" CHECK ("photo_verification"."gesture" in ('peace', 'thumbs_up', 'hand_on_head', 'three_fingers', 'point_up', 'ok_sign', 'open_palm', 'hand_on_chin')),
	CONSTRAINT "photo_verification_status_check" CHECK ("photo_verification"."status" in ('uploading', 'processing', 'pending', 'approved', 'rejected', 'failed')),
	CONSTRAINT "photo_verification_rejection_check" CHECK ("photo_verification"."rejection" in ('gesture_mismatch', 'face_mismatch', 'unclear', 'not_live'))
);
--> statement-breakpoint
CREATE TABLE "spot" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"slug" text NOT NULL,
	"name_fr" text NOT NULL,
	"name_en" text NOT NULL,
	"kind" text NOT NULL,
	"area" text NOT NULL,
	"latitude" double precision NOT NULL,
	"longitude" double precision NOT NULL,
	"description_fr" text NOT NULL,
	"description_en" text NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	CONSTRAINT "spot_slug_unique" UNIQUE("slug"),
	CONSTRAINT "spot_kind_check" CHECK ("spot"."kind" in ('park', 'square', 'riverbank', 'viewpoint')),
	CONSTRAINT "spot_area_check" CHECK ("spot"."area" in ('presquile', 'vieux-lyon', 'rive-gauche', 'confluence', 'vaise', 'nord'))
);
--> statement-breakpoint
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
CREATE TABLE "identity_vault" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"former_user_id" uuid NOT NULL,
	"email" text NOT NULL,
	"first_name" text,
	"birth_date" text,
	"closed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"purge_after" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "onboarding_draft" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"data" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "signup_block" (
	"email_hmac" text PRIMARY KEY NOT NULL,
	"reason" text NOT NULL,
	"until" date NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "signup_block_reason_check" CHECK ("signup_block"."reason" in ('underage'))
);
--> statement-breakpoint
ALTER TABLE "message" DROP CONSTRAINT "message_kind_check";--> statement-breakpoint
ALTER TABLE "hidden_contact" DROP CONSTRAINT "hidden_contact_user_id_email_hmac_pk";--> statement-breakpoint
ALTER TABLE "like_action" ADD COLUMN "blind" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "match" ADD COLUMN "blind" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "match" ADD COLUMN "nudged_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "notification" ADD COLUMN "pushed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "pact_result" ADD COLUMN "match_id" uuid;--> statement-breakpoint
ALTER TABLE "pact_season" ADD COLUMN "report" jsonb;--> statement-breakpoint
ALTER TABLE "pact_season" ADD COLUMN "computed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "pact_season" ADD COLUMN "revealed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "photo" ADD COLUMN "stage" text DEFAULT 'uploading' NOT NULL;--> statement-breakpoint
ALTER TABLE "profile" ADD COLUMN "hidden_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "prompt_answer" ADD COLUMN "voice_stage" text;--> statement-breakpoint
ALTER TABLE "prompt_answer" ADD COLUMN "voice_content_type" text;--> statement-breakpoint
ALTER TABLE "prompt_answer" ADD COLUMN "voice_duration_ms" integer;--> statement-breakpoint
ALTER TABLE "prompt_answer" ADD COLUMN "voice_peaks" smallint[];--> statement-breakpoint
ALTER TABLE "hidden_contact" ADD COLUMN "id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL;--> statement-breakpoint
ALTER TABLE "hidden_contact" ADD COLUMN "hint" text NOT NULL;--> statement-breakpoint
ALTER TABLE "app_user" ADD COLUMN "campus_verified_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "app_user" ADD COLUMN "photo_verified_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "app_user" ADD COLUMN "email_proven_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "app_user" ADD COLUMN "reverify_reminded_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "app_user" ADD COLUMN "paused_for_reverification" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "app_user" ADD COLUMN "paused_until" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "app_user" ADD COLUMN "deletion_requested_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "app_user" ADD COLUMN "locale" text DEFAULT 'fr' NOT NULL;--> statement-breakpoint
ALTER TABLE "auth_account" ADD CONSTRAINT "auth_account_user_id_app_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."app_user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "auth_passkey" ADD CONSTRAINT "auth_passkey_user_id_app_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."app_user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "auth_session" ADD CONSTRAINT "auth_session_user_id_app_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."app_user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "availability" ADD CONSTRAINT "availability_user_id_app_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."app_user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "member_badge" ADD CONSTRAINT "member_badge_user_id_app_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."app_user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "weekly_answer" ADD CONSTRAINT "weekly_answer_user_id_app_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."app_user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "weekly_answer" ADD CONSTRAINT "weekly_answer_question_id_weekly_question_id_fk" FOREIGN KEY ("question_id") REFERENCES "public"."weekly_question"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "date_share" ADD CONSTRAINT "date_share_user_id_app_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."app_user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "date_share" ADD CONSTRAINT "date_share_match_id_match_id_fk" FOREIGN KEY ("match_id") REFERENCES "public"."match"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "date_share" ADD CONSTRAINT "date_share_message_id_message_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."message"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "discovery_filter" ADD CONSTRAINT "discovery_filter_user_id_app_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."app_user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "discovery_undo" ADD CONSTRAINT "discovery_undo_user_id_app_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."app_user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "impression" ADD CONSTRAINT "impression_viewer_id_app_user_id_fk" FOREIGN KEY ("viewer_id") REFERENCES "public"."app_user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "impression" ADD CONSTRAINT "impression_target_id_app_user_id_fk" FOREIGN KEY ("target_id") REFERENCES "public"."app_user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "secret_crush" ADD CONSTRAINT "secret_crush_user_id_app_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."app_user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event" ADD CONSTRAINT "event_organizer_id_app_user_id_fk" FOREIGN KEY ("organizer_id") REFERENCES "public"."app_user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event" ADD CONSTRAINT "event_spot_id_spot_id_fk" FOREIGN KEY ("spot_id") REFERENCES "public"."spot"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_rsvp" ADD CONSTRAINT "event_rsvp_event_id_event_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."event"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_rsvp" ADD CONSTRAINT "event_rsvp_user_id_app_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."app_user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "flash_scan" ADD CONSTRAINT "flash_scan_event_id_event_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."event"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "flash_scan" ADD CONSTRAINT "flash_scan_scanner_id_app_user_id_fk" FOREIGN KEY ("scanner_id") REFERENCES "public"."app_user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "flash_scan" ADD CONSTRAINT "flash_scan_scanned_id_app_user_id_fk" FOREIGN KEY ("scanned_id") REFERENCES "public"."app_user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_icebreaker_request" ADD CONSTRAINT "ai_icebreaker_request_user_id_app_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."app_user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_preference" ADD CONSTRAINT "chat_preference_user_id_app_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."app_user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_digest" ADD CONSTRAINT "email_digest_user_id_app_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."app_user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_preference" ADD CONSTRAINT "notification_preference_user_id_app_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."app_user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quiet_hours" ADD CONSTRAINT "quiet_hours_user_id_app_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."app_user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "photo_verification" ADD CONSTRAINT "photo_verification_user_id_app_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."app_user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "photo_verification" ADD CONSTRAINT "photo_verification_reviewed_by_app_user_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."app_user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "data_export" ADD CONSTRAINT "data_export_user_id_app_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."app_user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "onboarding_draft" ADD CONSTRAINT "onboarding_draft_user_id_app_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."app_user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "auth_account_user_id_index" ON "auth_account" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "auth_passkey_user_id_index" ON "auth_passkey" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "auth_passkey_credential_id_index" ON "auth_passkey" USING btree ("credential_id");--> statement-breakpoint
CREATE INDEX "auth_session_user_id_index" ON "auth_session" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "auth_verification_identifier_index" ON "auth_verification" USING btree ("identifier");--> statement-breakpoint
CREATE INDEX "weekly_answer_question_idx" ON "weekly_answer" USING btree ("question_id","week");--> statement-breakpoint
CREATE INDEX "weekly_answer_user_idx" ON "weekly_answer" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "date_share_user_idx" ON "date_share" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "date_share_check_in_idx" ON "date_share" USING btree ("check_in_at") WHERE "date_share"."check_in_notified_at" is null and "date_share"."revoked_at" is null;--> statement-breakpoint
CREATE INDEX "impression_target_id_day_index" ON "impression" USING btree ("target_id","day");--> statement-breakpoint
CREATE INDEX "secret_crush_target_email_hmac_index" ON "secret_crush" USING btree ("target_email_hmac");--> statement-breakpoint
CREATE INDEX "event_starts_at_idx" ON "event" USING btree ("starts_at");--> statement-breakpoint
CREATE INDEX "event_rsvp_user_idx" ON "event_rsvp" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "flash_scan_scanner_idx" ON "flash_scan" USING btree ("scanner_id","created_at");--> statement-breakpoint
CREATE INDEX "ai_icebreaker_request_user_idx" ON "ai_icebreaker_request" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "photo_verification_user_id_created_at_index" ON "photo_verification" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "photo_verification_pending_idx" ON "photo_verification" USING btree ("created_at") WHERE "photo_verification"."status" = 'pending';--> statement-breakpoint
CREATE INDEX "data_export_user_id_index" ON "data_export" USING btree ("user_id");--> statement-breakpoint
ALTER TABLE "pact_result" ADD CONSTRAINT "pact_result_match_id_match_id_fk" FOREIGN KEY ("match_id") REFERENCES "public"."match"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "drop_day_index" ON "drop" USING btree ("day");--> statement-breakpoint
CREATE INDEX "message_sender_id_created_at_index" ON "message" USING btree ("sender_id","created_at");--> statement-breakpoint
CREATE INDEX "notification_push_pending_idx" ON "notification" USING btree ("created_at") WHERE "notification"."pushed_at" is null;--> statement-breakpoint
CREATE INDEX "pact_result_season_id_user_high_index" ON "pact_result" USING btree ("season_id","user_high");--> statement-breakpoint
ALTER TABLE "hidden_contact" ADD CONSTRAINT "hidden_contact_userId_emailHmac_unique" UNIQUE("user_id","email_hmac");--> statement-breakpoint
ALTER TABLE "message" ADD CONSTRAINT "message_kind_check" CHECK ("message"."kind" in ('text', 'image', 'voice', 'gif', 'sticker', 'date_proposal', 'game', 'system'));--> statement-breakpoint
ALTER TABLE "photo" ADD CONSTRAINT "photo_stage_check" CHECK ("photo"."stage" in ('uploading', 'processing', 'ready', 'failed'));--> statement-breakpoint
ALTER TABLE "profile" ADD CONSTRAINT "profile_languages_check" CHECK ("profile"."languages" <@ array['fr', 'en', 'es', 'de', 'it', 'pt', 'ar', 'zh', 'ja', 'ko', 'ru', 'tr', 'vi', 'hi']::text[]);--> statement-breakpoint
ALTER TABLE "prompt_answer" ADD CONSTRAINT "prompt_answer_voice_stage_check" CHECK ("prompt_answer"."voice_stage" in ('uploading', 'processing', 'ready', 'failed'));--> statement-breakpoint
ALTER TABLE "prompt_answer" ADD CONSTRAINT "prompt_answer_voice_type_check" CHECK ("prompt_answer"."voice_content_type" in ('audio/webm', 'audio/mp4', 'audio/ogg'));--> statement-breakpoint
ALTER TABLE "prompt_answer" ADD CONSTRAINT "prompt_answer_voice_duration" CHECK ("prompt_answer"."voice_duration_ms" is null or "prompt_answer"."voice_duration_ms" between 1 and 30500);--> statement-breakpoint
ALTER TABLE "app_user" ADD CONSTRAINT "app_user_locale_check" CHECK ("app_user"."locale" in ('fr', 'en'));