import { and, desc, eq, gt, isNull, sql } from "drizzle-orm";
import type { Database } from "../client";
import { appUser, match, notification, secretCrush } from "../schema";
import { enqueue } from "./outbox";

/**
 * Secret crushes (DEC-08). Nothing here reveals whether an address belongs
 * to a member: a crush is stored the same way either way, and only a mutual
 * crush is ever looked up.
 */

export interface CrushRow {
  readonly id: string;
  readonly hint: string;
  readonly createdAt: Date;
  readonly expiresAt: Date;
  readonly matchedAt: Date | null;
}

/** The member's crushes (withdrawn ones excluded), newest first. */
export async function crushesOf(db: Database, userId: string): Promise<CrushRow[]> {
  return db
    .select({
      id: secretCrush.id,
      hint: secretCrush.hint,
      createdAt: secretCrush.createdAt,
      expiresAt: secretCrush.expiresAt,
      matchedAt: secretCrush.matchedAt,
    })
    .from(secretCrush)
    .where(and(eq(secretCrush.userId, userId), isNull(secretCrush.withdrawnAt)))
    .orderBy(desc(secretCrush.createdAt));
}

export type AddCrushResult =
  | { readonly ok: false; readonly reason: "limit" | "rate" }
  | {
      readonly ok: true;
      readonly crushId: string;
      /** The other member's active crush on the viewer, if any (a mutual crush). */
      readonly reverse: { readonly crushId: string; readonly userId: string } | null;
    };

/**
 * Adds (or renews) a crush, within the limits, then looks for the reverse
 * crush. Both members' fingerprints are locked as a pair: two mutual crushes
 * added at the same moment cannot miss each other.
 */
export async function addCrush(
  db: Database,
  input: {
    userId: string;
    userEmailHmac: string;
    targetEmailHmac: string;
    hint: string;
    now: Date;
    expiresAt: Date;
    maxActive: number;
    addsPer30Days: number;
  },
): Promise<AddCrushResult> {
  return db.transaction(async (tx) => {
    const [low, high] = [input.userEmailHmac, input.targetEmailHmac].sort();
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`crush:${low}:${high}`}))`);
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`crush-quota:${input.userId}`}))`);

    const nowIso = input.now.toISOString();
    const [counts] = await tx
      .select({
        active: sql<number>`count(*) filter (where ${secretCrush.withdrawnAt} is null and ${secretCrush.matchedAt} is null and ${secretCrush.expiresAt} > ${nowIso}::timestamptz and ${secretCrush.targetEmailHmac} <> ${input.targetEmailHmac})::int`,
        recent: sql<number>`count(*) filter (where ${secretCrush.createdAt} > ${nowIso}::timestamptz - interval '30 days')::int`,
        existing: sql<number>`count(*) filter (where ${secretCrush.targetEmailHmac} = ${input.targetEmailHmac} and ${secretCrush.withdrawnAt} is null and ${secretCrush.expiresAt} > ${nowIso}::timestamptz)::int`,
      })
      .from(secretCrush)
      .where(eq(secretCrush.userId, input.userId));
    const alreadyActive = (counts?.existing ?? 0) > 0;
    if (!alreadyActive && (counts?.active ?? 0) >= input.maxActive) {
      return { ok: false, reason: "limit" } as const;
    }
    if (!alreadyActive && (counts?.recent ?? 0) >= input.addsPer30Days) {
      return { ok: false, reason: "rate" } as const;
    }

    // Idempotent: the same address again keeps the existing crush.
    const [row] = alreadyActive
      ? await tx
          .select({ id: secretCrush.id })
          .from(secretCrush)
          .where(
            and(eq(secretCrush.userId, input.userId), eq(secretCrush.targetEmailHmac, input.targetEmailHmac)),
          )
      : await tx
          .insert(secretCrush)
          .values({
            userId: input.userId,
            targetEmailHmac: input.targetEmailHmac,
            hint: input.hint,
            createdAt: input.now,
            expiresAt: input.expiresAt,
          })
          .onConflictDoUpdate({
            target: [secretCrush.userId, secretCrush.targetEmailHmac],
            set: {
              hint: input.hint,
              createdAt: input.now,
              expiresAt: input.expiresAt,
              matchedAt: null,
              withdrawnAt: null,
            },
          })
          .returning({ id: secretCrush.id });
    if (!row) {
      throw new Error("Crush upsert returned nothing.");
    }

    const [reverse] = await tx
      .select({ crushId: secretCrush.id, userId: secretCrush.userId })
      .from(secretCrush)
      .innerJoin(appUser, eq(appUser.id, secretCrush.userId))
      .where(
        and(
          eq(appUser.emailHmac, input.targetEmailHmac),
          eq(secretCrush.targetEmailHmac, input.userEmailHmac),
          isNull(secretCrush.withdrawnAt),
          isNull(secretCrush.matchedAt),
          gt(secretCrush.expiresAt, input.now),
        ),
      );
    return { ok: true, crushId: row.id, reverse: reverse ?? null } as const;
  });
}

/**
 * Turns a mutual crush into a match (source `crush`), once the caller has
 * checked the access policies. Idempotent: an existing match for the pair is
 * reused. Both members are notified as for any match.
 */
export async function confirmCrushMatch(
  db: Database,
  input: { a: string; b: string; crushIds: readonly string[]; mode: "love" | "friends"; now: Date },
): Promise<string> {
  return db.transaction(async (tx) => {
    const [low, high] = input.a < input.b ? [input.a, input.b] : [input.b, input.a];
    const [created] = await tx
      .insert(match)
      .values({ userLow: low, userHigh: high, mode: input.mode, source: "crush", createdAt: input.now })
      .onConflictDoNothing()
      .returning({ id: match.id });
    for (const crushId of input.crushIds) {
      await tx.update(secretCrush).set({ matchedAt: input.now }).where(eq(secretCrush.id, crushId));
    }
    if (!created) {
      const [existing] = await tx
        .select({ id: match.id })
        .from(match)
        .where(and(eq(match.userLow, low), eq(match.userHigh, high)));
      return existing?.id ?? "";
    }
    await tx
      .insert(notification)
      .values(
        [low, high].map((userId) => ({ userId, type: "match_created", payload: { matchId: created.id } })),
      );
    await enqueue(
      tx,
      [low, high].flatMap((userId) => [
        { userId, event: { type: "match.created" as const, matchId: created.id } },
        { userId, event: { type: "notification.created" as const } },
      ]),
    );
    return created.id;
  });
}

export async function withdrawCrush(db: Database, userId: string, crushId: string, now: Date) {
  await db
    .update(secretCrush)
    .set({ withdrawnAt: now })
    .where(and(eq(secretCrush.id, crushId), eq(secretCrush.userId, userId), isNull(secretCrush.withdrawnAt)));
}
