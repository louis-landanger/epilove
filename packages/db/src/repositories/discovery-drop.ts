import type { DeckFilter, IsoDate } from "@atomes/core";
import { and, eq, inArray, isNull, lt, sql } from "drizzle-orm";
import type { Database } from "../client";
import { appUser, discoveryFilter, drop, dropRun, likeAction, notification } from "../schema";
import { DEFAULT_DECK_FILTER, type SwipeRecord } from "./discovery";
import { enqueue } from "./outbox";

/**
 * Storage of the evening Drop (DEC-07). The computation (apps/worker) applies
 * the access policies; reading a Drop applies them again (API).
 */

/** Every like and pass made by these members, keyed by actor then target. */
export async function swipesBy(
  db: Database,
  actorIds: readonly string[],
): Promise<Map<string, Map<string, SwipeRecord>>> {
  const result = new Map<string, Map<string, SwipeRecord>>(actorIds.map((id) => [id, new Map()]));
  if (actorIds.length === 0) {
    return result;
  }
  const rows = await db
    .select({
      actorId: likeAction.actorId,
      targetId: likeAction.targetId,
      kind: likeAction.kind,
      at: likeAction.createdAt,
    })
    .from(likeAction)
    .where(inArray(likeAction.actorId, [...actorIds]));
  for (const row of rows) {
    result.get(row.actorId)?.set(row.targetId, { kind: row.kind, at: row.at });
  }
  return result;
}

export async function deckFiltersOf(
  db: Database,
  userIds: readonly string[],
): Promise<Map<string, DeckFilter>> {
  const result = new Map<string, DeckFilter>(userIds.map((id) => [id, DEFAULT_DECK_FILTER]));
  if (userIds.length === 0) {
    return result;
  }
  const rows = await db
    .select()
    .from(discoveryFilter)
    .where(inArray(discoveryFilter.userId, [...userIds]));
  for (const row of rows) {
    result.set(row.userId, {
      mode: row.mode,
      schoolSlugs: row.schoolSlugs,
      graduationYears: row.graduationYears,
      intentions: row.intentions,
      ageMin: row.ageMin,
      ageMax: row.ageMax,
    });
  }
  return result;
}

/** A computation that started this long ago without finishing is considered dead and can be redone. */
const STALE_RUN_MS = 30 * 60_000;

/** Claims the computation of a day's Drop. False when it is done or running elsewhere. */
export async function claimDropRun(db: Database, day: IsoDate, now: Date, force = false): Promise<boolean> {
  const [inserted] = await db
    .insert(dropRun)
    .values({ day, startedAt: now })
    .onConflictDoNothing()
    .returning({ day: dropRun.day });
  if (inserted) {
    return true;
  }
  const [reclaimed] = await db
    .update(dropRun)
    .set({ startedAt: now, computedAt: null, publishedAt: force ? null : dropRun.publishedAt })
    .where(
      and(
        eq(dropRun.day, day),
        force
          ? undefined
          : and(isNull(dropRun.computedAt), lt(dropRun.startedAt, new Date(now.getTime() - STALE_RUN_MS))),
      ),
    )
    .returning({ day: dropRun.day });
  return Boolean(reclaimed);
}

export async function dropRunOf(db: Database, day: IsoDate) {
  const [row] = await db.select().from(dropRun).where(eq(dropRun.day, day));
  return row ?? null;
}

/** Stores the day's Drops (replacing an earlier computation) and marks the run computed. */
export async function saveDrops(
  db: Database,
  input: { day: IsoDate; drops: ReadonlyMap<string, readonly string[]>; stats: unknown; now: Date },
) {
  await db.transaction(async (tx) => {
    await tx.delete(drop).where(eq(drop.day, input.day));
    // Accounts deleted while the Drop was computed are skipped; the others are locked until commit.
    const wanted = [...input.drops.keys()];
    const existing = wanted.length
      ? new Set(
          (
            await tx
              .select({ id: appUser.id })
              .from(appUser)
              .where(inArray(appUser.id, wanted))
              .for("key share")
          ).map((row) => row.id),
        )
      : new Set<string>();
    const rows = [...input.drops].filter(
      ([userId, candidates]) => candidates.length > 0 && existing.has(userId),
    );
    for (let start = 0; start < rows.length; start += 1000) {
      await tx.insert(drop).values(
        rows.slice(start, start + 1000).map(([userId, candidates]) => ({
          userId,
          day: input.day,
          candidates: [...candidates],
        })),
      );
    }
    await tx
      .update(dropRun)
      .set({ computedAt: input.now, stats: input.stats })
      .where(eq(dropRun.day, input.day));
  });
}

/**
 * Publishes a computed Drop (21:00): one `drop_ready` notification and one
 * realtime event per member who got profiles. Once only.
 */
export async function publishDrops(db: Database, day: IsoDate, now: Date): Promise<number> {
  return db.transaction(async (tx) => {
    const [run] = await tx
      .update(dropRun)
      .set({ publishedAt: now })
      .where(and(eq(dropRun.day, day), sql`${dropRun.computedAt} is not null`, isNull(dropRun.publishedAt)))
      .returning({ day: dropRun.day });
    if (!run) {
      return 0;
    }
    // Accounts locked until commit (as account deletion locks them): one deleted meanwhile
    // drops out of the batch instead of failing everyone's notification on the foreign key.
    const recipients = await tx
      .select({ userId: drop.userId })
      .from(drop)
      .innerJoin(appUser, eq(appUser.id, drop.userId))
      .where(and(eq(drop.day, day), sql`cardinality(${drop.candidates}) > 0`))
      .for("key share", { of: appUser });
    for (let start = 0; start < recipients.length; start += 1000) {
      const chunk = recipients.slice(start, start + 1000);
      await tx
        .insert(notification)
        .values(chunk.map((r) => ({ userId: r.userId, type: "drop_ready", payload: { day } })));
      await enqueue(
        tx,
        chunk.flatMap((r) => [
          { userId: r.userId, event: { type: "drop.ready" as const } },
          { userId: r.userId, event: { type: "notification.created" as const } },
        ]),
      );
    }
    return recipients.length;
  });
}

/** The member's published Drop of `day`, or null (not computed, not published yet, or none). */
export async function publishedDropOf(db: Database, userId: string, day: IsoDate) {
  const [row] = await db
    .select({ candidates: drop.candidates, openedAt: drop.openedAt, publishedAt: dropRun.publishedAt })
    .from(drop)
    .innerJoin(dropRun, eq(dropRun.day, drop.day))
    .where(and(eq(drop.userId, userId), eq(drop.day, day), sql`${dropRun.publishedAt} is not null`));
  return row ?? null;
}

export async function markDropOpened(db: Database, userId: string, day: IsoDate, now: Date) {
  await db
    .update(drop)
    .set({ openedAt: now })
    .where(and(eq(drop.userId, userId), eq(drop.day, day), isNull(drop.openedAt)));
}
