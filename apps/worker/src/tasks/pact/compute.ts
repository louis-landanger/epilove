import { canComputePact, type PactParticipant } from "@atomes/core";
import type { Database } from "@atomes/db";
import { campusDate, loadMembers, loadRelationsAmong } from "@atomes/db/repositories/members";
import { participantsOf, saveResults, seasonById } from "@atomes/db/repositories/pact";
import { answerSheets, listActiveQuestions } from "@atomes/db/repositories/questionnaire";
import { type PactRunOutput, runPact } from "./pipeline";
import type { Solve, SolverRequest } from "./solver";

export interface ComputeOptions {
  readonly db: Database;
  readonly seasonId: string;
  readonly now: Date;
  readonly solve: Solve;
  readonly engine?: SolverRequest["engine"];
  readonly power?: number;
  readonly neighbours?: number;
}

/**
 * Computes a season's results and quality report (`pnpm pact:compute`),
 * between the close of participation and the reveal. Can be replayed: each
 * run replaces the previous results.
 */
export async function computePact(options: ComputeOptions): Promise<PactRunOutput> {
  const { db, now } = options;
  const season = await seasonById(db, options.seasonId);
  if (!season) {
    throw new Error("Unknown Pact season.");
  }
  if (!canComputePact(season, now)) {
    throw new Error("This season cannot be computed now (participation still open, or already revealed).");
  }
  const enrolled = await participantsOf(db, season.id);
  const ids = enrolled.map((p) => p.userId);
  const [members, sheets, relations, questions] = await Promise.all([
    loadMembers(db, ids),
    answerSheets(db, ids),
    loadRelationsAmong(db, ids),
    listActiveQuestions(db),
  ]);
  const participants: PactParticipant[] = enrolled.flatMap((p) => {
    const row = members.get(p.userId);
    return row
      ? [
          {
            member: row.member,
            // A mode removed from the profile since joining no longer counts.
            modes: p.modes.filter((mode) => row.member.modes.includes(mode)),
            answers: sheets.get(p.userId) ?? new Map(),
          },
        ]
      : [];
  });
  const output = await runPact({
    participants,
    context: { today: campusDate(now), relations },
    threshold: season.threshold,
    neighbours: options.neighbours,
    engine: options.engine,
    power: options.power,
    sectionOf: new Map(questions.map((q) => [q.id, q.section])),
    sections: [...new Set(questions.map((q) => q.section))],
    solve: options.solve,
  });
  const saved = await saveResults(db, {
    seasonId: season.id,
    now,
    results: output.results,
    report: output.report,
  });
  if (saved !== "saved") {
    throw new Error("The season changed during the computation; nothing was saved.");
  }
  return output;
}
