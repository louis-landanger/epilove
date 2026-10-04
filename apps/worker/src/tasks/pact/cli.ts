import { parseArgs } from "node:util";
import { calendarDateIn, LYON_CAMPUS, PACT_RULES } from "@atomes/core";
import { createDatabase, databaseUrlFromEnv, schema } from "@atomes/db";
import { loadMembers } from "@atomes/db/repositories/members";
import { currentSeason, enrolMembers, seasonBySlug, upsertSeason } from "@atomes/db/repositories/pact";
import { answerSheets } from "@atomes/db/repositories/questionnaire";
import { and, eq, like, sql } from "drizzle-orm";
import { quickAddJob } from "graphile-worker";
import { computePact } from "./compute";
import { clearLoad, prepareLoad } from "./load";
import { type PactReport, runPact } from "./pipeline";
import { createSolver, type SolverRequest } from "./solver";
import { syntheticPact } from "./synthetic";

/**
 * Pact commands:
 *
 * - `pnpm pact:compute [--season <slug>] [--engine auto|networkx|cpsat] [--power 1|2]`
 *   computes the season whose participation closed and writes the results;
 * - `pnpm pact:compute --synthetic 3000 [--seed 7]` is a dry run on a
 *   synthetic campus, in memory (nothing written);
 * - `pnpm pact:demo [--reveal-in 60] [--open]` (development only) prepares a
 *   demo season with the development members, revealed in N seconds;
 * - `pnpm pact:load [--members 3000] [--reveal-in 180] [--clean]` (development
 *   only) prepares the k6 load test (infra/load): load members paired in a
 *   « Charge » season revealed in N seconds; `--clean` removes them.
 *
 * Output: the quality report (aggregates only, no identifiers).
 */
const { positionals, values } = parseArgs({
  allowPositionals: true,
  options: {
    season: { type: "string" },
    engine: { type: "string", default: "auto" },
    power: { type: "string", default: "1" },
    neighbours: { type: "string", default: String(PACT_RULES.neighbours) },
    synthetic: { type: "string" },
    seed: { type: "string", default: "7" },
    "reveal-in": { type: "string", default: "60" },
    open: { type: "boolean", default: false },
    full: { type: "boolean", default: false },
    members: { type: "string", default: "3000" },
    clean: { type: "boolean", default: false },
  },
});

const engine = values.engine as SolverRequest["engine"];
if (!["auto", "networkx", "cpsat"].includes(engine ?? "")) {
  throw new Error("--engine must be auto, networkx or cpsat.");
}
const power = Number(values.power);
const neighbours = Number(values.neighbours);
const solve = createSolver();

function printReport(report: PactReport, extra: Record<string, unknown> = {}) {
  const summary = {
    ...extra,
    participants: report.participants,
    threshold: report.threshold,
    neighbours: report.neighbours,
    timings: report.timings,
    modes: report.modes.map((mode) =>
      values.full
        ? mode
        : {
            mode: mode.mode,
            participants: mode.participants,
            pairs: mode.pairs,
            coverage: mode.coverage,
            scores: mode.scores,
            crossSchoolShare: mode.crossSchoolShare,
            sameYearShare: mode.sameYearShare,
            bySchool: mode.bySchool,
            solver: { ...mode.solver, histogram: undefined },
          },
    ),
  };
  console.log(JSON.stringify(summary, null, 2));
}

async function computeCommand() {
  const now = new Date();
  if (values.synthetic) {
    const count = Number(values.synthetic);
    const started = performance.now();
    const synthetic = syntheticPact(count, Number(values.seed), now);
    const output = await runPact({
      participants: synthetic.participants,
      context: {
        today: calendarDateIn(LYON_CAMPUS.timeZone, now),
        relations: {
          hasBlocked: () => false,
          hasLiked: () => false,
          hasActiveMatch: () => false,
          hasEndedMatch: () => false,
        },
      },
      threshold: PACT_RULES.defaultThreshold,
      neighbours,
      engine,
      power,
      sectionOf: synthetic.sectionOf,
      sections: synthetic.sections,
      solve,
    });
    printReport(output.report, {
      dryRun: true,
      population: synthetic.population,
      totalSeconds: Math.round((performance.now() - started) / 100) / 10,
    });
    return;
  }
  const { db, close } = createDatabase(databaseUrlFromEnv(), { maxConnections: 4 });
  try {
    const season = values.season ? await seasonBySlug(db, values.season) : await currentSeason(db);
    if (!season) {
      throw new Error("No season to compute.");
    }
    const output = await computePact({ db, seasonId: season.id, now, solve, engine, power, neighbours });
    printReport(output.report, { season: season.slug, results: output.results.length });
  } finally {
    await close();
  }
}

const DEV_ID_PREFIX = "de000000-0000-7000-8000-";

async function demoCommand() {
  if (process.env.APP_ENV !== "development" && process.env.APP_ENV !== "test") {
    throw new Error("pnpm pact:demo requires APP_ENV=development or APP_ENV=test.");
  }
  const now = new Date();
  const revealIn = Math.max(5, Number(values["reveal-in"]));
  const day = 86_400_000;
  const url = databaseUrlFromEnv();
  const { db, close } = createDatabase(url, { maxConnections: 4 });
  try {
    // A fresh start: previous demo matches would keep the same pairs out of the graph.
    await db
      .delete(schema.match)
      .where(
        and(eq(schema.match.source, "pact"), like(sql`${schema.match.userLow}::text`, `${DEV_ID_PREFIX}%`)),
      );
    if (values.open) {
      const seasonId = await upsertSeason(db, {
        slug: "demo",
        name: "Démo",
        opensAt: new Date(now.getTime() - day),
        closesAt: new Date(now.getTime() + 7 * day),
        revealAt: new Date(now.getTime() + 8 * day),
        status: "open",
      });
      await db.delete(schema.pactParticipant).where(eq(schema.pactParticipant.seasonId, seasonId));
      console.log("Demo season open for 7 days: join it from /campus/pacte.");
      return;
    }
    const revealAt = new Date(now.getTime() + revealIn * 1000);
    const seasonId = await upsertSeason(db, {
      slug: "demo",
      name: "Démo",
      opensAt: new Date(now.getTime() - 7 * day),
      closesAt: new Date(now.getTime() - 1000),
      revealAt,
      status: "closed",
    });
    await db.delete(schema.pactParticipant).where(eq(schema.pactParticipant.seasonId, seasonId));
    const devIds = (
      await db
        .select({ id: schema.appUser.id })
        .from(schema.appUser)
        .where(like(sql`${schema.appUser.id}::text`, `${DEV_ID_PREFIX}%`))
    ).map((row) => row.id);
    const [members, sheets] = await Promise.all([loadMembers(db, devIds), answerSheets(db, devIds)]);
    const enrolled = [...members.values()]
      .filter((row) => (sheets.get(row.member.id)?.size ?? 0) >= PACT_RULES.minAnswers)
      .map((row) => ({ userId: row.member.id, modes: row.member.modes }));
    await enrolMembers(db, seasonId, enrolled, now);
    const output = await computePact({ db, seasonId, now: new Date(), solve, engine, power, neighbours });
    await quickAddJob(
      { connectionString: url },
      "pact_reveal",
      { seasonId },
      { runAt: revealAt, jobKey: `pact_reveal:${seasonId}`, maxAttempts: 20 },
    );
    printReport(output.report, { season: "demo", enrolled: enrolled.length, results: output.results.length });
    console.log(
      `Reveal at ${revealAt.toISOString()} (in ${revealIn} s): open /campus/pacte. The worker must run.`,
    );
  } finally {
    await close();
  }
}

async function loadCommand() {
  if (process.env.APP_ENV !== "development" && process.env.APP_ENV !== "test") {
    throw new Error("pnpm pact:load requires APP_ENV=development or APP_ENV=test.");
  }
  const url = databaseUrlFromEnv();
  const { db, close } = createDatabase(url, { maxConnections: 4 });
  try {
    if (values.clean) {
      await clearLoad(db);
      console.log("Load members and season removed.");
      return;
    }
    const now = new Date();
    const revealAt = new Date(now.getTime() + Math.max(30, Number(values["reveal-in"])) * 1000);
    const count = Math.max(2, Number(values.members));
    const seasonId = await prepareLoad(db, { count, revealAt, now });
    await quickAddJob(
      { connectionString: url },
      "pact_reveal",
      { seasonId },
      { runAt: revealAt, jobKey: `pact_reveal:${seasonId}`, maxAttempts: 20 },
    );
    console.log(JSON.stringify({ members: count - (count % 2), revealAt: revealAt.toISOString() }));
  } finally {
    await close();
  }
}

const command = positionals[0];
if (command === "compute") {
  await computeCommand();
} else if (command === "demo") {
  await demoCommand();
} else if (command === "load") {
  await loadCommand();
} else {
  throw new Error("Usage: cli.ts compute|demo|load [options]");
}
