import { GENDERS, INTENTIONS, LANGUAGES, MAX_PHOTOS, MODES, PROMPT_ANSWER_MAX_LENGTH } from "@epilove/core";
import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  date,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  smallint,
  text,
  unique,
  uuid,
  vector,
} from "drizzle-orm/pg-core";
import { createdAt, id, oneOf, subsetOf, timestamps } from "./columns";
import { appUser } from "./users";

export { INTENTIONS, MAX_PHOTOS };

/** Moderation status (ADM-01): only approved photos are shown to other members. */
export const PHOTO_STATUSES = ["pending", "approved", "rejected"] as const;
/**
 * Processing stage: `uploading` until the browser confirms the upload,
 * `processing` while the worker re-encodes it, then `ready` or `failed`.
 */
export const PHOTO_STAGES = ["uploading", "processing", "ready", "failed"] as const;
export type PhotoStage = (typeof PHOTO_STAGES)[number];

/** Public part of a member (visible to eligible members only, never on the open web). */
export const profile = pgTable(
  "profile",
  {
    userId: uuid()
      .primaryKey()
      .references(() => appUser.id, { onDelete: "cascade" }),
    firstName: text().notNull(),
    /** Age is always computed, never stored. 18+ is enforced by `isAdult` before insert. */
    birthDate: date({ mode: "string" }).notNull(),
    gender: text({ enum: GENDERS }).notNull(),
    pronouns: text(),
    program: text(),
    graduationYear: smallint().notNull(),
    languages: text().array().notNull().default(sql`'{}'`),
    intentions: text().array().notNull().default(sql`'{}'`),
    /** "Mon son du moment" (PRO-07): provider, track id, title, artist, preview URL. */
    anthem: jsonb(),
    /** Multilingual embedding of prompts and interests (docs/06-matching.md, section 4). */
    embedding: vector({ dimensions: 384 }),
    completeness: smallint().notNull().default(0),
    ...timestamps,
  },
  (t) => [
    check("profile_gender_check", oneOf(t.gender, GENDERS)),
    check("profile_intentions_check", subsetOf(t.intentions, INTENTIONS)),
    check("profile_languages_check", subsetOf(t.languages, LANGUAGES)),
    check("profile_first_name_length", sql`char_length(${t.firstName}) between 1 and 40`),
    index("profile_embedding_idx").using("hnsw", t.embedding.op("vector_cosine_ops")),
  ],
);

/**
 * Discovery preferences. `interestedIn` reveals sexual orientation: sensitive
 * data (GDPR art. 9), never exported, never sent to analytics.
 */
export const preferences = pgTable(
  "preferences",
  {
    userId: uuid()
      .primaryKey()
      .references(() => appUser.id, { onDelete: "cascade" }),
    modes: text().array().notNull().default(sql`'{}'`),
    interestedIn: text().array().notNull().default(sql`'{}'`),
    ageMin: smallint().notNull().default(18),
    ageMax: smallint().notNull().default(30),
    schoolFilter: uuid().array().notNull().default(sql`'{}'`),
    hideFromOwnSchool: boolean().notNull().default(false),
    hideFromOwnYear: boolean().notNull().default(false),
    incognito: boolean().notNull().default(false),
    crossSchoolBoost: boolean().notNull().default(true),
    discreetNotifications: boolean().notNull().default(true),
    ...timestamps,
  },
  (t) => [
    check("preferences_modes_check", subsetOf(t.modes, MODES)),
    check("preferences_interested_in_check", subsetOf(t.interestedIn, GENDERS)),
    check("preferences_age_range_check", sql`${t.ageMin} >= 18 and ${t.ageMax} >= ${t.ageMin}`),
  ],
);

export const photo = pgTable(
  "photo",
  {
    id: id(),
    userId: uuid()
      .notNull()
      .references(() => appUser.id, { onDelete: "cascade" }),
    storageKey: text().notNull().unique(),
    position: smallint().notNull(),
    width: integer(),
    height: integer(),
    thumbhash: text(),
    altText: text(),
    stage: text({ enum: PHOTO_STAGES }).notNull().default("uploading"),
    status: text({ enum: PHOTO_STATUSES }).notNull().default("pending"),
    /** Classifier verdicts and moderator notes. */
    moderation: jsonb(),
    ...timestamps,
  },
  (t) => [
    check("photo_status_check", oneOf(t.status, PHOTO_STATUSES)),
    check("photo_stage_check", oneOf(t.stage, PHOTO_STAGES)),
    check("photo_position_check", sql`${t.position} between 0 and ${sql.raw(String(MAX_PHOTOS - 1))}`),
    index().on(t.userId, t.position),
  ],
);

/** Prompt catalogue (PRO-02). */
export const prompt = pgTable("prompt", {
  id: id(),
  slug: text().notNull().unique(),
  textFr: text().notNull(),
  textEn: text().notNull(),
  category: text().notNull(),
  active: boolean().notNull().default(true),
  createdAt: createdAt(),
});

export const promptAnswer = pgTable(
  "prompt_answer",
  {
    id: id(),
    userId: uuid()
      .notNull()
      .references(() => appUser.id, { onDelete: "cascade" }),
    promptId: uuid()
      .notNull()
      .references(() => prompt.id, { onDelete: "restrict" }),
    text: text(),
    voiceKey: text(),
    transcript: text(),
    position: smallint().notNull(),
    ...timestamps,
  },
  (t) => [
    unique().on(t.userId, t.promptId),
    check(
      "prompt_answer_text_length",
      sql`${t.text} is null or char_length(${t.text}) <= ${sql.raw(String(PROMPT_ANSWER_MAX_LENGTH))}`,
    ),
  ],
);

/** Closed catalogue of interests (no free tags, so no offensive tags). */
export const interest = pgTable("interest", {
  id: id(),
  slug: text().notNull().unique(),
  labelFr: text().notNull(),
  labelEn: text().notNull(),
  category: text().notNull(),
});

export const profileInterest = pgTable(
  "profile_interest",
  {
    userId: uuid()
      .notNull()
      .references(() => appUser.id, { onDelete: "cascade" }),
    interestId: uuid()
      .notNull()
      .references(() => interest.id, { onDelete: "cascade" }),
  },
  (t) => [primaryKey({ columns: [t.userId, t.interestId] })],
);
