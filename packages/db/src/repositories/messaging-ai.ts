import { and, count, eq, gte, inArray, isNull, sql } from "drizzle-orm";
import type { Database } from "../client";
import { aiIcebreakerRequest, consent } from "../schema";

/**
 * AI conversation starters (CHAT-04): consent and quota. The consent is the
 * shared `consent` record (kind `ai_features`, versioned and historised); a
 * request row only counts towards the daily quota and holds no content.
 */

/** Members among `ids` with an active consent to the AI features. */
export async function aiConsentsOf(db: Database, ids: readonly string[]): Promise<Set<string>> {
  if (ids.length === 0) {
    return new Set();
  }
  const rows = await db
    .selectDistinct({ userId: consent.userId })
    .from(consent)
    .where(
      and(inArray(consent.userId, [...ids]), eq(consent.kind, "ai_features"), isNull(consent.withdrawnAt)),
    );
  return new Set(rows.map((r) => r.userId));
}

/**
 * Grants (idempotent for the same version) or withdraws the consent. A new
 * version of the consent text withdraws the previous one and records the new.
 */
export async function setAiConsent(
  db: Database,
  userId: string,
  granted: boolean,
  version: string,
  now = new Date(),
): Promise<void> {
  await db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`ai-consent:${userId}`}, 0))`);
    const active = await tx
      .select({ id: consent.id, version: consent.version })
      .from(consent)
      .where(and(eq(consent.userId, userId), eq(consent.kind, "ai_features"), isNull(consent.withdrawnAt)));
    if (granted && active.length === 1 && active[0]?.version === version) {
      return;
    }
    if (active.length > 0) {
      await tx
        .update(consent)
        .set({ withdrawnAt: now })
        .where(
          inArray(
            consent.id,
            active.map((a) => a.id),
          ),
        );
    }
    if (granted) {
      await tx.insert(consent).values({ userId, kind: "ai_features", version, grantedAt: now });
    }
  });
}

/**
 * Reserves one request within the quota (rolling day). Returns the
 * reservation id, or null once the quota is reached. Serialised per member.
 */
export async function reserveAiIcebreaker(
  db: Database,
  userId: string,
  limit: number,
  now = new Date(),
): Promise<string | null> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`ai-icebreaker:${userId}`}, 0))`);
    const since = new Date(now.getTime() - 86_400_000);
    const [used] = await tx
      .select({ n: count() })
      .from(aiIcebreakerRequest)
      .where(and(eq(aiIcebreakerRequest.userId, userId), gte(aiIcebreakerRequest.createdAt, since)));
    if ((used?.n ?? 0) >= limit) {
      return null;
    }
    const [row] = await tx
      .insert(aiIcebreakerRequest)
      .values({ userId, createdAt: now })
      .returning({ id: aiIcebreakerRequest.id });
    return row?.id ?? null;
  });
}

/** Gives a reservation back when the model could not be reached. */
export async function releaseAiIcebreaker(db: Database, id: string): Promise<void> {
  await db.delete(aiIcebreakerRequest).where(eq(aiIcebreakerRequest.id, id));
}
