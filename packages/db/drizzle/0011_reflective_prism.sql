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
