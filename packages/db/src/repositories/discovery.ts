import type { DeckFilter, IsoDate, Mode, QuotaUsage } from "@epilove/core";
import { and, asc, desc, eq, gte, inArray, isNull, ne, notExists, or, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import type { Database } from "../client";
import {
  discoveryFilter,
  discoveryUndo,
  impression,
  interest,
  likeAction,
  match,
  notification,
  photo,
  profileInterest,
  prompt,
  promptAnswer,
  school,
} from "../schema";
import { enqueue } from "./outbox";

/** Storage side of discovery (DEC-01 to DEC-06, DEC-11). Callers apply the access policies. */

type Executor = Pick<Database, "select" | "insert" | "update" | "delete" | "execute">;

export async function quotaUsage(
  db: Executor,
  userId: string,
  since: Date,
  today: IsoDate,
): Promise<QuotaUsage> {
  const [likes] = await db
    .select({
      likes: sql<number>`count(*) filter (where ${likeAction.kind} in ('like', 'superlike'))::int`,
      superlikes: sql<number>`count(*) filter (where ${likeAction.kind} = 'superlike')::int`,
    })
    .from(likeAction)
    .where(and(eq(likeAction.actorId, userId), gte(likeAction.createdAt, since)));
  const undos = await db
    .select({ day: discoveryUndo.day })
    .from(discoveryUndo)
    .where(and(eq(discoveryUndo.userId, userId), eq(discoveryUndo.day, today)));
  return { likesToday: likes?.likes ?? 0, superlikesToday: likes?.superlikes ?? 0, undosToday: undos.length };
}

export interface SwipeRecord {
  readonly kind: "like" | "superlike" | "pass";
  readonly at: Date;
}

/** Every decision the viewer made, by target. */
export async function swipeHistory(db: Database, viewerId: string): Promise<Map<string, SwipeRecord>> {
  const rows = await db
    .select({ targetId: likeAction.targetId, kind: likeAction.kind, at: likeAction.createdAt })
    .from(likeAction)
    .where(eq(likeAction.actorId, viewerId));
  return new Map(rows.map((r) => [r.targetId, { kind: r.kind, at: r.at }]));
}

const reverse = alias(likeAction, "reverse_like");

/** Likes received and not answered yet, per member (attention cap of the ranking). */
export async function pendingLikesReceived(
  db: Database,
  ids: readonly string[],
): Promise<Map<string, number>> {
  if (ids.length === 0) {
    return new Map();
  }
  const rows = await db
    .select({ targetId: likeAction.targetId, pending: sql<number>`count(*)::int` })
    .from(likeAction)
    .where(
      and(
        inArray(likeAction.targetId, [...ids]),
        ne(likeAction.kind, "pass"),
        notExists(
          db
            .select({ one: sql`1` })
            .from(reverse)
            .where(and(eq(reverse.actorId, likeAction.targetId), eq(reverse.targetId, likeAction.actorId))),
        ),
      ),
    )
    .groupBy(likeAction.targetId);
  return new Map(rows.map((r) => [r.targetId, r.pending]));
}

/** Deck impressions received today, per member (impression budget of the ranking). */
export async function impressionsToday(
  db: Database,
  ids: readonly string[],
  day: IsoDate,
): Promise<Map<string, number>> {
  if (ids.length === 0) {
    return new Map();
  }
  const rows = await db
    .select({ targetId: impression.targetId, total: sql<number>`sum(${impression.count})::int` })
    .from(impression)
    .where(and(inArray(impression.targetId, [...ids]), eq(impression.day, day)))
    .groupBy(impression.targetId);
  return new Map(rows.map((r) => [r.targetId, r.total]));
}

export async function recordImpressions(
  db: Database,
  viewerId: string,
  targetIds: readonly string[],
  surface: "deck" | "drop" | "profile",
  day: IsoDate,
) {
  if (targetIds.length === 0) {
    return;
  }
  await db
    .insert(impression)
    .values(targetIds.map((targetId) => ({ viewerId, targetId, surface, day })))
    .onConflictDoUpdate({
      target: [impression.viewerId, impression.targetId, impression.surface, impression.day],
      set: { count: sql`${impression.count} + 1` },
    });
}

export type { DeckFilter };

export const DEFAULT_DECK_FILTER: DeckFilter = {
  mode: "all",
  schoolSlugs: [],
  graduationYears: [],
  intentions: [],
  ageMin: null,
  ageMax: null,
};

export async function getDeckFilter(db: Database, userId: string): Promise<DeckFilter> {
  const [row] = await db.select().from(discoveryFilter).where(eq(discoveryFilter.userId, userId));
  return row
    ? {
        mode: row.mode,
        schoolSlugs: row.schoolSlugs,
        graduationYears: row.graduationYears,
        intentions: row.intentions,
        ageMin: row.ageMin,
        ageMax: row.ageMax,
      }
    : DEFAULT_DECK_FILTER;
}

export async function saveDeckFilter(db: Database, userId: string, filter: DeckFilter) {
  const values = {
    mode: filter.mode,
    schoolSlugs: [...filter.schoolSlugs],
    graduationYears: [...filter.graduationYears],
    intentions: [...filter.intentions],
    ageMin: filter.ageMin,
    ageMax: filter.ageMax,
  };
  await db
    .insert(discoveryFilter)
    .values({ userId, ...values })
    .onConflictDoUpdate({ target: discoveryFilter.userId, set: values });
}

export interface ProfileContent {
  readonly photos: {
    id: string;
    storageKey: string;
    width: number | null;
    height: number | null;
    altText: string | null;
  }[];
  readonly prompts: { id: string; questionFr: string; questionEn: string; answer: string }[];
  readonly interests: { id: string; labelFr: string; labelEn: string }[];
}

/** Approved photos, prompt answers and interests of several members. */
export async function loadProfileContent(
  db: Database,
  ids: readonly string[],
): Promise<Map<string, ProfileContent>> {
  const unique = [...new Set(ids)];
  const content = new Map<string, ProfileContent>(
    unique.map((id) => [id, { photos: [], prompts: [], interests: [] }]),
  );
  if (unique.length === 0) {
    return content;
  }
  const [photos, prompts, interests] = await Promise.all([
    db
      .select({
        userId: photo.userId,
        id: photo.id,
        storageKey: photo.storageKey,
        width: photo.width,
        height: photo.height,
        altText: photo.altText,
      })
      .from(photo)
      .where(and(inArray(photo.userId, unique), eq(photo.status, "approved")))
      .orderBy(asc(photo.position)),
    db
      .select({
        userId: promptAnswer.userId,
        id: promptAnswer.id,
        questionFr: prompt.textFr,
        questionEn: prompt.textEn,
        answer: promptAnswer.text,
      })
      .from(promptAnswer)
      .innerJoin(prompt, eq(prompt.id, promptAnswer.promptId))
      .where(and(inArray(promptAnswer.userId, unique), sql`${promptAnswer.text} is not null`))
      .orderBy(asc(promptAnswer.position)),
    db
      .select({
        userId: profileInterest.userId,
        id: interest.id,
        labelFr: interest.labelFr,
        labelEn: interest.labelEn,
      })
      .from(profileInterest)
      .innerJoin(interest, eq(interest.id, profileInterest.interestId))
      .where(inArray(profileInterest.userId, unique))
      .orderBy(asc(interest.labelFr)),
  ]);
  for (const { userId, ...p } of photos) {
    content.get(userId)?.photos.push(p);
  }
  for (const { userId, answer, ...p } of prompts) {
    content.get(userId)?.prompts.push({ ...p, answer: answer ?? "" });
  }
  for (const { userId, ...i } of interests) {
    content.get(userId)?.interests.push(i);
  }
  return content;
}

export interface DecideInput {
  readonly actorId: string;
  readonly targetId: string;
  readonly kind: "like" | "superlike" | "pass";
  readonly content: { readonly type: "photo" | "prompt"; readonly id: string } | null;
  readonly comment: string | null;
  /** Mode of the match if this like completes one (computed by the caller from the policies). */
  readonly matchMode: Mode;
  /** Quota, re-checked inside the transaction under a per-member lock. */
  readonly quota: {
    readonly since: Date;
    readonly today: IsoDate;
    readonly status: (usage: QuotaUsage) => { likesLeft: number; superlikesLeft: number };
  };
}

export type DecideResult =
  | { readonly outcome: "passed" }
  | { readonly outcome: "liked" }
  | { readonly outcome: "matched"; readonly matchId: string }
  | {
      readonly outcome: "rejected";
      readonly reason: "invalid_content" | "quota_exceeded" | "already_decided";
    };

/** Transaction-scoped advisory lock on an arbitrary text key. */
const lock = (tx: Executor, key: string) =>
  tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${key}, 0))`);

async function contentBelongsTo(
  tx: Executor,
  targetId: string,
  content: NonNullable<DecideInput["content"]>,
) {
  if (content.type === "photo") {
    const rows = await tx
      .select({ id: photo.id })
      .from(photo)
      .where(and(eq(photo.id, content.id), eq(photo.userId, targetId), eq(photo.status, "approved")));
    return rows.length > 0;
  }
  const rows = await tx
    .select({ id: promptAnswer.id })
    .from(promptAnswer)
    .where(and(eq(promptAnswer.id, content.id), eq(promptAnswer.userId, targetId)));
  return rows.length > 0;
}

/**
 * Records a like, super like or pass, and creates the match when the like is
 * reciprocal (docs/04-architecture.md, flow 4.2). Two members liking each other
 * at the same instant create exactly one match: both transactions take the same
 * pair lock, and the ordered pair is unique in the database. Repeating a
 * decision is idempotent.
 */
export async function decide(db: Database, input: DecideInput, now = new Date()): Promise<DecideResult> {
  const [low, high] =
    input.actorId < input.targetId ? [input.actorId, input.targetId] : [input.targetId, input.actorId];
  return db.transaction(async (tx) => {
    // Lock order: pair first, then the actor's quota. Every transaction follows it, so no deadlock.
    await lock(tx, `pair:${low}:${high}`);
    await lock(tx, `quota:${input.actorId}`);

    const [existing] = await tx
      .select({ kind: likeAction.kind })
      .from(likeAction)
      .where(and(eq(likeAction.actorId, input.actorId), eq(likeAction.targetId, input.targetId)));
    const [existingMatch] = await tx
      .select({ id: match.id, status: match.status })
      .from(match)
      .where(and(eq(match.userLow, low), eq(match.userHigh, high)));

    if (existing) {
      if (existing.kind !== "pass") {
        // Liking twice is idempotent; turning a like into a pass goes through unmatch instead.
        if (input.kind === "pass") {
          return { outcome: "rejected", reason: "already_decided" } as const;
        }
        return existingMatch?.status === "active"
          ? ({ outcome: "matched", matchId: existingMatch.id } as const)
          : ({ outcome: "liked" } as const);
      }
      if (input.kind === "pass") {
        return { outcome: "passed" } as const;
      }
    }
    if (existingMatch && existingMatch.status !== "active") {
      // A pair that unmatched stays apart.
      return { outcome: "rejected", reason: "already_decided" } as const;
    }

    if (input.kind !== "pass") {
      const quota = input.quota.status(
        await quotaUsage(tx, input.actorId, input.quota.since, input.quota.today),
      );
      if (quota.likesLeft <= 0 || (input.kind === "superlike" && quota.superlikesLeft <= 0)) {
        return { outcome: "rejected", reason: "quota_exceeded" } as const;
      }
      if (input.content && !(await contentBelongsTo(tx, input.targetId, input.content))) {
        return { outcome: "rejected", reason: "invalid_content" } as const;
      }
    }

    const values = {
      kind: input.kind,
      targetContentType: input.kind === "pass" ? null : (input.content?.type ?? null),
      targetContentId: input.kind === "pass" ? null : (input.content?.id ?? null),
      comment: input.kind === "pass" ? null : input.comment?.trim() || null,
      // The decision time: a pass turned into a like (second chance, likes received) counts today.
      createdAt: now,
    };
    if (existing) {
      await tx
        .update(likeAction)
        .set(values)
        .where(and(eq(likeAction.actorId, input.actorId), eq(likeAction.targetId, input.targetId)));
    } else {
      await tx.insert(likeAction).values({ actorId: input.actorId, targetId: input.targetId, ...values });
    }

    if (input.kind === "pass") {
      return { outcome: "passed" } as const;
    }

    const [reciprocal] = await tx
      .select({ kind: likeAction.kind })
      .from(likeAction)
      .where(
        and(
          eq(likeAction.actorId, input.targetId),
          eq(likeAction.targetId, input.actorId),
          ne(likeAction.kind, "pass"),
        ),
      );
    if (!reciprocal) {
      await enqueue(tx, [
        { userId: input.targetId, event: { type: "like.received", superlike: input.kind === "superlike" } },
      ]);
      await tx.insert(notification).values({
        userId: input.targetId,
        type: input.kind === "superlike" ? "superlike_received" : "like_received",
        payload: {},
      });
      return { outcome: "liked" } as const;
    }

    const [created] = await tx
      .insert(match)
      .values({ userLow: low, userHigh: high, mode: input.matchMode, source: "like", createdAt: now })
      .onConflictDoNothing()
      .returning({ id: match.id });
    const matchId =
      created?.id ??
      (
        await tx
          .select({ id: match.id })
          .from(match)
          .where(and(eq(match.userLow, low), eq(match.userHigh, high)))
      )[0]?.id;
    if (!matchId) {
      throw new Error("Match could not be created.");
    }
    if (created) {
      await enqueue(tx, [
        { userId: input.actorId, event: { type: "match.created", matchId } },
        { userId: input.targetId, event: { type: "match.created", matchId } },
      ]);
      await tx.insert(notification).values([
        { userId: input.actorId, type: "match_created", payload: { matchId } },
        { userId: input.targetId, type: "match_created", payload: { matchId } },
      ]);
    }
    return { outcome: "matched", matchId } as const;
  });
}

const HOUR = 3_600_000;

/** Undoes the most recent pass of the last 24 hours, once per campus day (DEC-11). */
export async function undoLastPass(
  db: Database,
  userId: string,
  today: IsoDate,
  windowHours: number,
  now = new Date(),
): Promise<{ restoredId: string } | { restoredId: null; reason: "nothing_to_undo" | "quota_exceeded" }> {
  return db.transaction(async (tx) => {
    await lock(tx, `quota:${userId}`);
    const used = await tx
      .select({ day: discoveryUndo.day })
      .from(discoveryUndo)
      .where(and(eq(discoveryUndo.userId, userId), eq(discoveryUndo.day, today)));
    if (used.length > 0) {
      return { restoredId: null, reason: "quota_exceeded" } as const;
    }
    const [last] = await tx
      .select({ targetId: likeAction.targetId })
      .from(likeAction)
      .where(
        and(
          eq(likeAction.actorId, userId),
          eq(likeAction.kind, "pass"),
          gte(likeAction.createdAt, new Date(now.getTime() - windowHours * HOUR)),
        ),
      )
      .orderBy(desc(likeAction.createdAt))
      .limit(1);
    if (!last) {
      return { restoredId: null, reason: "nothing_to_undo" } as const;
    }
    await tx
      .delete(likeAction)
      .where(
        and(
          eq(likeAction.actorId, userId),
          eq(likeAction.targetId, last.targetId),
          eq(likeAction.kind, "pass"),
        ),
      );
    await tx.insert(discoveryUndo).values({ userId, day: today });
    return { restoredId: last.targetId } as const;
  });
}

/**
 * Likes received that the viewer has not answered yet, newest first (DEC-04).
 * The caller filters them through `canViewProfile`.
 */
export async function likesReceived(db: Database, viewerId: string) {
  return db
    .select({
      actorId: likeAction.actorId,
      kind: likeAction.kind,
      comment: likeAction.comment,
      contentType: likeAction.targetContentType,
      contentId: likeAction.targetContentId,
      at: likeAction.createdAt,
    })
    .from(likeAction)
    .where(
      and(
        eq(likeAction.targetId, viewerId),
        ne(likeAction.kind, "pass"),
        notExists(
          db
            .select({ one: sql`1` })
            .from(reverse)
            .where(
              and(
                eq(reverse.actorId, viewerId),
                eq(reverse.targetId, likeAction.actorId),
                ne(reverse.kind, "pass"),
              ),
            ),
        ),
        notExists(
          db
            .select({ one: sql`1` })
            .from(match)
            .where(
              or(
                and(eq(match.userLow, viewerId), eq(match.userHigh, likeAction.actorId)),
                and(eq(match.userHigh, viewerId), eq(match.userLow, likeAction.actorId)),
              ),
            ),
        ),
      ),
    )
    .orderBy(desc(likeAction.createdAt))
    .limit(200);
}

/** What the viewer already decided about one member (profile screen). */
export async function decisionAbout(db: Database, viewerId: string, targetId: string) {
  const [row] = await db
    .select({ kind: likeAction.kind, at: likeAction.createdAt })
    .from(likeAction)
    .where(and(eq(likeAction.actorId, viewerId), eq(likeAction.targetId, targetId)));
  return row ?? null;
}

/** Active match between two members, if any. */
export async function activeMatchBetween(db: Database, a: string, b: string) {
  const [low, high] = a < b ? [a, b] : [b, a];
  const [row] = await db
    .select({ id: match.id, mode: match.mode, createdAt: match.createdAt })
    .from(match)
    .where(
      and(
        eq(match.userLow, low),
        eq(match.userHigh, high),
        eq(match.status, "active"),
        isNull(match.unmatchedBy),
      ),
    );
  return row ?? null;
}

/** Schools of the campus, for the deck filters. */
export async function listSchools(db: Database) {
  return db.select({ slug: school.slug, name: school.name }).from(school).orderBy(asc(school.name));
}
