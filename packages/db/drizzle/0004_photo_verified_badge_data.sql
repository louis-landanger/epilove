-- "Photo vérifiée" (COM-04) now comes from app_user.photo_verified_at, set when a
-- moderator approves the gesture selfie (ONB-08). Badges granted in member_badge
-- before that keep their date, then leave the table before its check narrows (0005).
UPDATE "app_user" SET "photo_verified_at" = "member_badge"."granted_at"
FROM "member_badge"
WHERE "member_badge"."user_id" = "app_user"."id"
  AND "member_badge"."badge" = 'photo_verified'
  AND "app_user"."photo_verified_at" IS NULL;--> statement-breakpoint
DELETE FROM "member_badge" WHERE "badge" = 'photo_verified';
