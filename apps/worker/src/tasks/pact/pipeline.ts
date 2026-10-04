import {
  buildPactEdges,
  MODES,
  type Mode,
  type ModeReport,
  PACT_RULES,
  type PactParticipant,
  type PolicyContext,
  pactModeReport,
  sectionScores,
} from "@atomes/core";
import type { NewPactResult } from "@atomes/db/repositories/pact";
import type { Solve, SolverRequest, SolverResponse } from "./solver";

/**
 * One Pact computation (docs/06-matching.md, section 9): graph, solver,
 * checks, results and quality report. Pure apart from the solver call, so
 * the dry run on synthetic members and the real run share every step.
 */
export interface PactRunInput {
  readonly participants: readonly PactParticipant[];
  readonly context: PolicyContext;
  readonly threshold: number;
  readonly neighbours?: number;
  readonly engine?: SolverRequest["engine"];
  readonly power?: number;
  /** Section of each question id, for the radar chart. */
  readonly sectionOf: ReadonlyMap<string, string>;
  readonly sections: readonly string[];
  readonly solve: Solve;
  readonly random?: () => number;
}

export interface PactReport {
  readonly threshold: number;
  readonly neighbours: number;
  readonly participants: number;
  readonly timings: { readonly graphMs: number; readonly solverMs: number };
  readonly modes: readonly ModeReport[];
}

export interface PactRunOutput {
  readonly results: readonly NewPactResult[];
  readonly report: PactReport;
}

export async function runPact(input: PactRunInput): Promise<PactRunOutput> {
  const neighbours = input.neighbours ?? PACT_RULES.neighbours;
  const started = performance.now();
  const edges = buildPactEdges(input.participants, input.context, { threshold: input.threshold, neighbours });
  const graphMs = Math.round(performance.now() - started);

  // Love first: a pair matched in love mode is not matched again in friends mode (one match per pair).
  const graphs = MODES.map((mode) => ({
    mode,
    nodes: input.participants.filter((p) => p.modes.includes(mode)).map((p) => p.member.id),
    edges: edges.filter((e) => e.mode === mode).map((e) => [e.a, e.b, e.score] as const),
  })).filter((graph) => graph.nodes.length > 0);
  const request: SolverRequest = {
    threshold: input.threshold,
    neighbours,
    power: input.power ?? 1,
    engine: input.engine ?? "auto",
    distinctPairs: true,
    graphs,
  };
  const solverStarted = performance.now();
  const response = await input.solve(request);
  const solverMs = Math.round(performance.now() - solverStarted);
  checkResponse(request, response);

  const byId = new Map(input.participants.map((p) => [p.member.id, p]));
  const results: NewPactResult[] = [];
  const modes: ModeReport[] = [];
  for (const graph of response.graphs) {
    const pairs = graph.pairs.map(([a, b, score]) => {
      const sections = sectionScores(
        byId.get(a)?.answers ?? new Map(),
        byId.get(b)?.answers ?? new Map(),
        input.sectionOf,
        input.sections,
      );
      return { a, b, score, sections };
    });
    for (const pair of pairs) {
      results.push({
        mode: graph.mode,
        userLow: pair.a,
        userHigh: pair.b,
        score: pair.score,
        explanation: { sections: pair.sections },
      });
    }
    const participants = input.participants
      .filter((p) => p.modes.includes(graph.mode))
      .map((p) => ({
        id: p.member.id,
        schoolSlug: p.member.schoolSlug,
        graduationYear: p.member.graduationYear,
      }));
    modes.push(
      pactModeReport(
        { mode: graph.mode, participants, pairs, solver: graph.stats },
        { threshold: input.threshold, random: input.random },
      ),
    );
  }
  return {
    results,
    report: {
      threshold: input.threshold,
      neighbours,
      participants: input.participants.length,
      timings: { graphMs, solverMs },
      modes,
    },
  };
}

/**
 * Never trust the solver blindly: every pair must be an edge of the request
 * with its score, nobody is matched twice in a mode, and no pair is matched
 * in two modes.
 */
export function checkResponse(request: SolverRequest, response: SolverResponse) {
  const requested = new Map(request.graphs.map((graph) => [graph.mode, graph]));
  const allPairs = new Set<string>();
  for (const graph of response.graphs) {
    const sent = requested.get(graph.mode);
    if (!sent) {
      throw new Error(`The solver answered for an unknown mode: ${graph.mode}.`);
    }
    const scores = new Map(sent.edges.map(([a, b, score]) => [`${a}|${b}`, score]));
    const seen = new Set<string>();
    for (const [a, b, score] of graph.pairs) {
      const expected = scores.get(`${a}|${b}`);
      if (expected === undefined || Math.abs(expected - score) > 1e-9) {
        throw new Error("The solver returned a pair that is not an edge of the request.");
      }
      if (score < request.threshold) {
        throw new Error("The solver returned a pair below the threshold.");
      }
      if (seen.has(a) || seen.has(b)) {
        throw new Error("The solver matched a member twice in one mode.");
      }
      if (allPairs.has(`${a}|${b}`)) {
        throw new Error("The solver matched a pair in two modes.");
      }
      seen.add(a);
      seen.add(b);
      allPairs.add(`${a}|${b}`);
    }
  }
}

/** Best edge first: a stand-in for the Python solver in unit tests. */
export const greedySolve: Solve = async (request) => {
  const taken = new Set<string>();
  return {
    graphs: request.graphs.map((graph) => {
      const used = new Set<string>();
      const pairs = [...graph.edges]
        .filter(([a, b]) => !taken.has(`${a}|${b}`))
        .sort((x, y) => y[2] - x[2])
        .filter(([a, b]) => {
          if (used.has(a) || used.has(b)) {
            return false;
          }
          used.add(a);
          used.add(b);
          taken.add(`${a}|${b}`);
          return true;
        })
        .map(([a, b, score]) => [a, b, score] as [string, string, number]);
      return { mode: graph.mode as Mode, pairs, stats: { engine: "greedy" } };
    }),
  };
};
