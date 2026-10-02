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
ALTER TABLE "app_user" ADD COLUMN "photo_verified_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "photo_verification" ADD CONSTRAINT "photo_verification_user_id_app_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."app_user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "photo_verification" ADD CONSTRAINT "photo_verification_reviewed_by_app_user_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."app_user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "photo_verification_user_id_created_at_index" ON "photo_verification" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "photo_verification_pending_idx" ON "photo_verification" USING btree ("created_at") WHERE "photo_verification"."status" = 'pending';