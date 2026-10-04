import { pactEligibleModes } from "@atomes/core";
import { createDatabase, type Database } from "@atomes/db";
import { campusDate, loadMembers, loadRelationsAmong } from "@atomes/db/repositories/members";
import {
  participantsOf,
  type RevealOutcome,
  resultsOfSeason,
  revealSeason,
  seasonsDueForReveal,
} from "@atomes/db/repositories/pact";
import type { Task } from "graphile-worker";
import { z } from "zod";

/**
 * Reveal of the Pact (PAC-03). Results were computed days before; at the
 * announced minute, the access policies are checked once more (a block, a
 * pause or a ban since the computation removes the pair), then the matches
 * are created and `pact.reveal` is broadcast to every open screen.
 */
export async function revealPact(db: Database, seasonId: string, now: Date): Promise<RevealOutcome> {
  const [results, enrolled] = await Promise.all([
    resultsOfSeason(db, seasonId),
    participantsOf(db, seasonId),
  ]);
  const ids = [...new Set(results.flatMap((r) => [r.userLow, r.userHigh]))];
  const [members, relations] = await Promise.all([loadMembers(db, ids), loadRelationsAmong(db, ids)]);
  const modesOf = new Map(enrolled.map((p) => [p.userId, p.modes]));
  // A pair who matched by themselves since the computation keeps their match: the Pact confirms it.
  const context = { today: campusDate(now), relations: { ...relations, hasActiveMatch: () => false } };
  const keep = new Set(
    results
      .filter((result) => {
        const low = members.get(result.userLow);
        const high = members.get(result.userHigh);
        if (!low || !high) {
          return false;
        }
        return pactEligibleModes(
          { member: low.member, modes: modesOf.get(result.userLow) ?? [] },
          { member: high.member, modes: modesOf.get(result.userHigh) ?? [] },
          context,
        ).includes(result.mode);
      })
      .map((result) => result.id),
  );
  return revealSeason(db, { seasonId, now, keep });
}

const revealPayload = z.object({ seasonId: z.uuid() });

async function withDatabase<T>(run: (db: Database) => Promise<T>): Promise<T | undefined> {
  const url = process.env.DATABASE_URL;
  if (!url) {
    return undefined;
  }
  const { db, close } = createDatabase(url, { maxConnections: 2 });
  try {
    return await run(db);
  } finally {
    await close();
  }
}

/** Runs at the reveal minute (scheduled by `pactRevealDue`). Idempotent. */
export const pactReveal: Task = async (payload, helpers) => {
  const { seasonId } = revealPayload.parse(payload);
  const outcome = await withDatabase((db) => revealPact(db, seasonId, new Date()));
  if (outcome?.revealed === false && outcome.reason === "too_early") {
    // Retried by Graphile Worker a few seconds later.
    throw new Error("Pact reveal ran before its time.");
  }
  if (outcome?.revealed) {
    helpers.logger.info(
      `pact revealed: ${outcome.matches} matches, ${outcome.dropped} dropped, ${outcome.notified} notified`,
    );
  }
};

/**
 * Every minute: schedules the reveal of seasons due within the next minutes
 * at their exact time (the crontab only has minute precision).
 */
export const pactRevealDue: Task = async (_payload, helpers) => {
  const now = new Date();
  const due = await withDatabase((db) => seasonsDueForReveal(db, new Date(now.getTime() + 120_000)));
  for (const season of due ?? []) {
    await helpers.addJob(
      "pact_reveal",
      { seasonId: season.id },
      {
        runAt: season.revealAt > now ? season.revealAt : now,
        jobKey: `pact_reveal:${season.id}`,
        maxAttempts: 20,
      },
    );
  }
};
