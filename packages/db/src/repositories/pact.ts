import { canComputePact, canJoinPact, type Mode, type PactStatus } from "@epilove/core";
import { PACT_CHANNEL } from "@epilove/realtime/events";
import { and, asc, count, desc, eq, inArray, lte, ne, or, sql } from "drizzle-orm";
import type { Database } from "../client";
import { appUser, block, match, notification, pactParticipant, pactResult, pactSeason } from "../schema";
import { enqueue, type OutboxEntry } from "./outbox";

/**
 * The Pact (PAC-02, PAC-03): seasons, participation, results and the reveal.
 * Results are written two days before the reveal and stay private until the
 * season is revealed; the reveal turns them into matches in one transaction.
 */

const seasonColumns = {
  id: pactSeason.id,
  slug: pactSeason.slug,
  name: pactSeason.name,
  opensAt: pactSeason.opensAt,
  closesAt: pactSeason.closesAt,
  revealAt: pactSeason.revealAt,
  status: pactSeason.status,
  threshold: pactSeason.threshold,
  computedAt: pactSeason.computedAt,
  revealedAt: pactSeason.revealedAt,
};

export interface PactSeasonRow {
  readonly id: string;
  readonly slug: string;
  readonly name: string;
  readonly opensAt: Date;
  readonly closesAt: Date;
  readonly revealAt: Date;
  readonly status: PactStatus;
  readonly threshold: number;
  readonly computedAt: Date | null;
  readonly revealedAt: Date | null;
}

/** The season members see: the latest announced one (drafts are invisible). It stays visible until the next. */
export async function currentSeason(db: Database): Promise<PactSeasonRow | null> {
  const [row] = await db
    .select(seasonColumns)
    .from(pactSeason)
    .where(ne(pactSeason.status, "draft"))
    .orderBy(desc(pactSeason.revealAt))
    .limit(1);
  return row ?? null;
}

export async function seasonBySlug(db: Database, slug: string): Promise<PactSeasonRow | null> {
  const [row] = await db.select(seasonColumns).from(pactSeason).where(eq(pactSeason.slug, slug));
  return row ?? null;
}

export async function seasonById(db: Database, id: string): Promise<PactSeasonRow | null> {
  const [row] = await db.select(seasonColumns).from(pactSeason).where(eq(pactSeason.id, id));
  return row ?? null;
}

export async function participationOf(db: Database, seasonId: string, userId: string) {
  const [row] = await db
    .select({ modes: pactParticipant.modes, joinedAt: pactParticipant.completedAt })
    .from(pactParticipant)
    .where(and(eq(pactParticipant.seasonId, seasonId), eq(pactParticipant.userId, userId)));
  return row ? { modes: row.modes as Mode[], joinedAt: row.joinedAt } : null;
}

export async function participantCount(db: Database, seasonId: string): Promise<number> {
  const [row] = await db
    .select({ value: count() })
    .from(pactParticipant)
    .where(eq(pactParticipant.seasonId, seasonId));
  return row?.value ?? 0;
}

export async function participantsOf(db: Database, seasonId: string) {
  const rows = await db
    .select({ userId: pactParticipant.userId, modes: pactParticipant.modes })
    .from(pactParticipant)
    .where(eq(pactParticipant.seasonId, seasonId))
    .orderBy(asc(pactParticipant.userId));
  return rows.map((row) => ({ userId: row.userId, modes: row.modes as Mode[] }));
}

/** Joins (or changes one's modes). Idempotent. Refused outside the open window, checked under a lock. */
export async function joinSeason(
  db: Database,
  input: { seasonId: string; userId: string; modes: readonly Mode[]; now: Date },
): Promise<"joined" | "closed"> {
  return db.transaction(async (tx) => {
    const [season] = await tx
      .select(seasonColumns)
      .from(pactSeason)
      .where(eq(pactSeason.id, input.seasonId))
      .for("share");
    if (!season || !canJoinPact(season, input.now)) {
      return "closed";
    }
    await tx
      .insert(pactParticipant)
      .values({
        seasonId: input.seasonId,
        userId: input.userId,
        modes: [...input.modes],
        completedAt: input.now,
      })
      .onConflictDoUpdate({
        target: [pactParticipant.seasonId, pactParticipant.userId],
        set: { modes: [...input.modes] },
      });
    return "joined";
  });
}

export async function leaveSeason(
  db: Database,
  input: { seasonId: string; userId: string; now: Date },
): Promise<"left" | "closed"> {
  return db.transaction(async (tx) => {
    const [season] = await tx
      .select(seasonColumns)
      .from(pactSeason)
      .where(eq(pactSeason.id, input.seasonId))
      .for("share");
    if (!season || !canJoinPact(season, input.now)) {
      return "closed";
    }
    await tx
      .delete(pactParticipant)
      .where(and(eq(pactParticipant.seasonId, input.seasonId), eq(pactParticipant.userId, input.userId)));
    return "left";
  });
}

export interface NewPactResult {
  readonly mode: Mode;
  readonly userLow: string;
  readonly userHigh: string;
  readonly score: number;
  readonly explanation: unknown;
}

/**
 * Replaces the season's results (the computation can be replayed until the
 * reveal) and stores the quality report. Participation is closed for good.
 */
export async function saveResults(
  db: Database,
  input: { seasonId: string; now: Date; results: readonly NewPactResult[]; report: unknown },
): Promise<"saved" | "not_computable"> {
  return db.transaction(async (tx) => {
    const [season] = await tx
      .select(seasonColumns)
      .from(pactSeason)
      .where(eq(pactSeason.id, input.seasonId))
      .for("update");
    if (!season || !canComputePact(season, input.now)) {
      return "not_computable";
    }
    await tx.delete(pactResult).where(eq(pactResult.seasonId, input.seasonId));
    for (let start = 0; start < input.results.length; start += 1000) {
      await tx.insert(pactResult).values(
        input.results.slice(start, start + 1000).map((result) => ({
          seasonId: input.seasonId,
          mode: result.mode,
          userLow: result.userLow,
          userHigh: result.userHigh,
          score: result.score,
          explanation: result.explanation,
        })),
      );
    }
    await tx
      .update(pactSeason)
      .set({ status: "computed", computedAt: input.now, report: input.report })
      .where(eq(pactSeason.id, input.seasonId));
    return "saved";
  });
}

/** Computed seasons whose reveal is due before `until` (the scheduler looks a minute ahead). */
export async function seasonsDueForReveal(db: Database, until: Date) {
  return db
    .select({ id: pactSeason.id, revealAt: pactSeason.revealAt })
    .from(pactSeason)
    .where(and(eq(pactSeason.status, "computed"), lte(pactSeason.revealAt, until)));
}

export async function resultsOfSeason(db: Database, seasonId: string) {
  return db
    .select({
      id: pactResult.id,
      mode: pactResult.mode,
      userLow: pactResult.userLow,
      userHigh: pactResult.userHigh,
      score: pactResult.score,
    })
    .from(pactResult)
    .where(eq(pactResult.seasonId, seasonId));
}

export type RevealOutcome =
  | { readonly revealed: false; readonly reason: "not_found" | "not_computed" | "too_early" }
  | {
      readonly revealed: true;
      readonly matches: number;
      readonly dropped: number;
      readonly notified: number;
    };

/**
 * Reveals a season (PAC-03), once: creates a `pact` match for every result
 * still allowed (`keep`, checked by the caller against the access policies
 * right before), drops the others, notifies every participant and broadcasts
 * `pact.reveal`. Blocks are checked once more inside the transaction.
 * Running it twice does nothing the second time.
 */
export async function revealSeason(
  db: Database,
  input: { seasonId: string; now: Date; keep: ReadonlySet<string> },
): Promise<RevealOutcome> {
  return db.transaction(async (tx) => {
    const [season] = await tx
      .select(seasonColumns)
      .from(pactSeason)
      .where(eq(pactSeason.id, input.seasonId))
      .for("update");
    if (!season) {
      return { revealed: false, reason: "not_found" } as const;
    }
    if (season.status !== "computed") {
      return { revealed: false, reason: "not_computed" } as const;
    }
    if (season.revealAt > input.now) {
      return { revealed: false, reason: "too_early" } as const;
    }

    const results = await tx
      .select({
        id: pactResult.id,
        mode: pactResult.mode,
        userLow: pactResult.userLow,
        userHigh: pactResult.userHigh,
      })
      .from(pactResult)
      .where(eq(pactResult.seasonId, input.seasonId));
    const candidates = [...new Set(results.flatMap((r) => [r.userLow, r.userHigh]))];
    // Accounts deleted since the computation are left out; the others are locked until commit.
    const live = candidates.length
      ? new Set(
          (
            await tx
              .select({ id: appUser.id })
              .from(appUser)
              .where(inArray(appUser.id, candidates))
              .for("key share")
          ).map((row) => row.id),
        )
      : new Set<string>();
    const kept = results.filter(
      (result) => input.keep.has(result.id) && live.has(result.userLow) && live.has(result.userHigh),
    );
    const members = [...new Set(kept.flatMap((r) => [r.userLow, r.userHigh]))];

    const pairKey = (a: string, b: string) => (a < b ? `${a}|${b}` : `${b}|${a}`);
    const blocked = new Set<string>();
    const existing = new Map<string, { id: string; status: string }>();
    if (members.length > 0) {
      const blocks = await tx
        .select({ a: block.blockerId, b: block.blockedId })
        .from(block)
        .where(and(inArray(block.blockerId, members), inArray(block.blockedId, members)));
      for (const row of blocks) {
        blocked.add(pairKey(row.a, row.b));
      }
      const matches = await tx
        .select({ id: match.id, userLow: match.userLow, userHigh: match.userHigh, status: match.status })
        .from(match)
        .where(and(inArray(match.userLow, members), inArray(match.userHigh, members)));
      for (const row of matches) {
        existing.set(pairKey(row.userLow, row.userHigh), { id: row.id, status: row.status });
      }
    }

    // A pair that matched by themselves since the computation keeps their match.
    const linked: { resultId: string; matchId: string }[] = [];
    const toCreate: typeof kept = [];
    const keptIds = new Set(kept.map((r) => r.id));
    const dropped = new Set(results.filter((r) => !keptIds.has(r.id)).map((r) => r.id));
    for (const result of kept) {
      const key = pairKey(result.userLow, result.userHigh);
      const current = existing.get(key);
      if (blocked.has(key) || current?.status === "unmatched") {
        dropped.add(result.id);
      } else if (current) {
        linked.push({ resultId: result.id, matchId: current.id });
      } else {
        toCreate.push(result);
      }
    }
    for (let start = 0; start < toCreate.length; start += 1000) {
      const chunk = toCreate.slice(start, start + 1000);
      const created = await tx
        .insert(match)
        .values(
          chunk.map((r) => ({
            userLow: r.userLow,
            userHigh: r.userHigh,
            mode: r.mode,
            source: "pact" as const,
            createdAt: input.now,
          })),
        )
        .onConflictDoNothing()
        .returning({ id: match.id, userLow: match.userLow, userHigh: match.userHigh });
      const byPair = new Map(created.map((m) => [pairKey(m.userLow, m.userHigh), m.id]));
      for (const result of chunk) {
        const matchId = byPair.get(pairKey(result.userLow, result.userHigh));
        if (matchId) {
          linked.push({ resultId: result.id, matchId });
        } else {
          dropped.add(result.id);
        }
      }
    }
    for (let start = 0; start < linked.length; start += 1000) {
      const chunk = linked.slice(start, start + 1000);
      await tx.execute(sql`
        update ${pactResult} set match_id = v.match_id
        from (select unnest(array[${sql.join(
          chunk.map((l) => sql`${l.resultId}`),
          sql`, `,
        )}]::uuid[]) as id, unnest(array[${sql.join(
          chunk.map((l) => sql`${l.matchId}`),
          sql`, `,
        )}]::uuid[]) as match_id) as v
        where ${pactResult.id} = v.id`);
    }
    if (dropped.size > 0) {
      await tx.delete(pactResult).where(inArray(pactResult.id, [...dropped]));
    }

    // Everyone who took part hears about the reveal, matched or not.
    // Locked like the matched pairs above: an account deleted meanwhile drops out of the batch.
    const participants = await tx
      .select({ userId: pactParticipant.userId })
      .from(pactParticipant)
      .innerJoin(appUser, eq(appUser.id, pactParticipant.userId))
      .where(eq(pactParticipant.seasonId, input.seasonId))
      .for("key share", { of: appUser });
    for (let start = 0; start < participants.length; start += 1000) {
      await tx.insert(notification).values(
        participants.slice(start, start + 1000).map((p) => ({
          userId: p.userId,
          type: "pact_reveal",
          payload: { seasonId: input.seasonId },
        })),
      );
    }
    const matchedIds = new Map(linked.map((l) => [l.resultId, l.matchId]));
    // The broadcast first: it starts the reveal on every screen, the rest can follow.
    const events: OutboxEntry[] = [
      { channel: PACT_CHANNEL, event: { type: "pact.reveal", seasonId: input.seasonId } },
    ];
    const personal: OutboxEntry[] = kept.flatMap((result) => {
      const matchId = matchedIds.get(result.id);
      return matchId
        ? [
            { userId: result.userLow, event: { type: "match.created" as const, matchId } },
            { userId: result.userHigh, event: { type: "match.created" as const, matchId } },
          ]
        : [];
    });
    events.push(
      ...personal,
      ...participants.map((p) => ({ userId: p.userId, event: { type: "notification.created" as const } })),
    );
    for (let start = 0; start < events.length; start += 1000) {
      await enqueue(tx, events.slice(start, start + 1000));
    }

    await tx
      .update(pactSeason)
      .set({ status: "revealed", revealedAt: input.now })
      .where(eq(pactSeason.id, input.seasonId));
    return {
      revealed: true,
      matches: linked.length,
      dropped: dropped.size,
      notified: participants.length,
    } as const;
  });
}

/** The member's results of a season (one per mode at most), with their match once revealed. */
export async function resultsFor(db: Database, seasonId: string, userId: string) {
  const rows = await db
    .select({
      id: pactResult.id,
      mode: pactResult.mode,
      userLow: pactResult.userLow,
      userHigh: pactResult.userHigh,
      score: pactResult.score,
      explanation: pactResult.explanation,
      matchId: pactResult.matchId,
    })
    .from(pactResult)
    .where(
      and(
        eq(pactResult.seasonId, seasonId),
        or(eq(pactResult.userLow, userId), eq(pactResult.userHigh, userId)),
      ),
    )
    .orderBy(asc(pactResult.mode));
  return rows.map((row) => ({
    id: row.id,
    mode: row.mode,
    otherId: row.userLow === userId ? row.userHigh : row.userLow,
    score: row.score,
    explanation: row.explanation,
    matchId: row.matchId,
  }));
}

/** Development helper (`pnpm pact:demo`): creates or resets a season with the given dates. */
export async function upsertSeason(
  db: Database,
  input: {
    slug: string;
    name: string;
    opensAt: Date;
    closesAt: Date;
    revealAt: Date;
    status: PactStatus;
    threshold?: number;
  },
): Promise<string> {
  const values = {
    name: input.name,
    opensAt: input.opensAt,
    closesAt: input.closesAt,
    revealAt: input.revealAt,
    status: input.status,
    threshold: input.threshold ?? 0.6,
    report: null,
    computedAt: null,
    revealedAt: null,
  };
  const [row] = await db
    .insert(pactSeason)
    .values({ slug: input.slug, ...values })
    .onConflictDoUpdate({ target: pactSeason.slug, set: values })
    .returning({ id: pactSeason.id });
  if (!row) {
    throw new Error("Season upsert returned nothing.");
  }
  await db.delete(pactResult).where(eq(pactResult.seasonId, row.id));
  return row.id;
}

/** Development helper: enrols members (with all the modes they asked for) in a season. */
export async function enrolMembers(
  db: Database,
  seasonId: string,
  members: readonly { userId: string; modes: readonly Mode[] }[],
  now: Date,
) {
  for (let start = 0; start < members.length; start += 1000) {
    await db
      .insert(pactParticipant)
      .values(
        members.slice(start, start + 1000).map((m) => ({
          seasonId,
          userId: m.userId,
          modes: [...m.modes],
          completedAt: now,
        })),
      )
      .onConflictDoNothing();
  }
}

/** Removes a season with its participants and results (tests, development). Matches stay. */
export async function deleteSeason(db: Database, seasonId: string) {
  await db.delete(pactSeason).where(eq(pactSeason.id, seasonId));
}
