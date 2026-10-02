import { BADGES, MODES } from "@epilove/core";
import { oc } from "@orpc/contract";
import { z } from "zod";
import { compatibilityView, contentLocale } from "./questionnaire";

export const memberPhoto = z.object({
  id: z.uuid(),
  /** Signed, expiring imgproxy URL (never a permanent link). */
  url: z.string(),
  alt: z.string().nullable(),
  width: z.number().int().nullable(),
  height: z.number().int().nullable(),
});

export const memberPrompt = z.object({ id: z.uuid(), question: z.string(), answer: z.string() });
export const memberInterest = z.object({ id: z.uuid(), label: z.string(), shared: z.boolean() });

/** Everything a card or a full profile shows about another member. Never an email or a last name. */
export const memberCard = z.object({
  userId: z.uuid(),
  firstName: z.string(),
  age: z.number().int(),
  pronouns: z.string().nullable(),
  school: z.object({ slug: z.string(), name: z.string() }),
  graduationYear: z.number().int(),
  program: z.string().nullable(),
  /** Modes the two members share (love, friends). */
  modes: z.array(z.enum(MODES)),
  intentions: z.array(z.string()),
  languages: z.array(z.string()),
  photos: z.array(memberPhoto),
  prompts: z.array(memberPrompt),
  interests: z.array(memberInterest),
  compatibility: compatibilityView.nullable(),
  /** Discreet badges (COM-04): founder, verified photo, ambassador. Never about popularity. */
  badges: z.array(z.enum(BADGES)),
});
export type MemberCard = z.infer<typeof memberCard>;

export const quotaView = z.object({
  likesLeft: z.number().int(),
  likesPerDay: z.number().int(),
  superlikesLeft: z.number().int(),
  undosLeft: z.number().int(),
});
export type QuotaView = z.infer<typeof quotaView>;

export const deckMode = z.enum(["all", ...MODES]);

export const deckFilter = z.object({
  mode: deckMode,
  schoolSlugs: z.array(z.string().max(32)).max(10),
  graduationYears: z.array(z.number().int().min(2020).max(2040)).max(10),
  intentions: z.array(z.enum(["relationship", "see_what_happens", "friendship"])).max(3),
  ageMin: z.number().int().min(18).max(99).nullable(),
  ageMax: z.number().int().min(18).max(99).nullable(),
});
export type DeckFilterView = z.infer<typeof deckFilter>;

/** Why the deck is empty, so the screen can say something useful. */
export const deckEmptyReason = z.enum(["exhausted", "profile_incomplete", "paused", "restricted"]);

export const decisionKind = z.enum(["like", "superlike", "pass"]);
export const likedContent = z.object({ type: z.enum(["photo", "prompt"]), id: z.uuid() });

export const decisionOutput = z.object({
  outcome: z.enum(["liked", "passed", "matched"]),
  matchId: z.uuid().nullable(),
  quota: quotaView,
});

export const likeReceived = z.object({
  card: memberCard,
  kind: z.enum(["like", "superlike"]),
  comment: z.string().nullable(),
  /** What was liked: one of the viewer's photos or prompt answers. */
  liked: z
    .discriminatedUnion("type", [
      z.object({ type: z.literal("photo"), url: z.string() }),
      z.object({ type: z.literal("prompt"), question: z.string(), answer: z.string() }),
    ])
    .nullable(),
  at: z.iso.datetime(),
});
export type LikeReceived = z.infer<typeof likeReceived>;

export const profileView = z.object({
  card: memberCard,
  via: z.enum(["self", "match", "discovery", "liked_you"]),
  matchId: z.uuid().nullable(),
  myDecision: decisionKind.nullable(),
  likedYou: z.boolean(),
  canLike: z.boolean(),
});
export type ProfileView = z.infer<typeof profileView>;

export const crushView = z.object({
  id: z.uuid(),
  /** First letter and school domain only ("a•••@epita.fr"). */
  hint: z.string(),
  createdAt: z.iso.datetime(),
  expiresAt: z.iso.datetime(),
  status: z.enum(["active", "matched", "expired"]),
});
export type CrushView = z.infer<typeof crushView>;

export const crushList = z.object({ crushes: z.array(crushView), maxActive: z.number().int() });

export const discoveryContract = {
  /**
   * The next cards of the deck (DEC-01). The deck is recomputed on every call:
   * pass the ids already on screen in `exclude` to get the following ones.
   */
  deck: oc
    .input(
      z.object({
        locale: contentLocale,
        limit: z.number().int().min(1).max(20).default(8),
        exclude: z.array(z.uuid()).max(100).default([]),
      }),
    )
    .output(
      z.object({
        cards: z.array(memberCard),
        quota: quotaView,
        empty: deckEmptyReason.nullable(),
        /** Cards back for a second chance (DEC-09): passed more than 45 days ago, changed since. */
        secondChance: z.array(z.uuid()).default([]),
      }),
    ),
  /** Like (optionally on a photo or prompt, with a comment), super like or pass (DEC-02, DEC-03). Idempotent. */
  decide: oc
    .input(
      z.object({
        targetId: z.uuid(),
        kind: decisionKind,
        content: likedContent.nullable().default(null),
        comment: z.string().max(150).nullable().default(null),
      }),
    )
    .output(decisionOutput),
  /** Brings back the last pass of the last 24 hours, once a day (DEC-11). */
  undo: oc
    .input(z.object({ locale: contentLocale }))
    .output(z.object({ restored: memberCard.nullable(), quota: quotaView })),
  /** Free, unblurred list of the people who liked the viewer (DEC-04). */
  likesReceived: oc
    .input(z.object({ locale: contentLocale }))
    .output(z.object({ likes: z.array(likeReceived), quota: quotaView })),
  /** Full profile of another member (or oneself), if the policies allow it. */
  profile: oc.input(z.object({ userId: z.uuid(), locale: contentLocale })).output(profileView),
  /** The viewer's own card, as others see it (match screen, previews). */
  me: oc.input(z.object({ locale: contentLocale })).output(memberCard),
  /** Deck filters (DEC-06). */
  filters: oc.output(
    z.object({
      filter: deckFilter,
      schools: z.array(z.object({ slug: z.string(), name: z.string() })),
    }),
  ),
  saveFilters: oc.input(deckFilter).output(deckFilter),
  /**
   * The evening Drop (DEC-07): the profiles of the current Drop not decided
   * yet, and when the next one arrives (on the server's clock).
   */
  /** The member's secret crushes (DEC-08). */
  crushes: oc.output(crushList),
  /**
   * Adds a secret crush by school email. The answer never says whether the
   * address belongs to a member; `matched` is set only for a mutual crush.
   */
  addCrush: oc
    .input(z.object({ email: z.string().max(254), locale: contentLocale }))
    .output(crushList.extend({ matched: z.object({ matchId: z.uuid(), card: memberCard }).nullable() })),
  removeCrush: oc.input(z.object({ crushId: z.uuid() })).output(crushList),
  drop: oc.input(z.object({ locale: contentLocale })).output(
    z.object({
      cards: z.array(memberCard),
      /** Profiles in the current Drop, decided ones included. */
      total: z.number().int(),
      expiresAt: z.iso.datetime().nullable(),
      nextAt: z.iso.datetime(),
      serverNow: z.iso.datetime(),
    }),
  ),
};
