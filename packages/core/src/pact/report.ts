import type { Mode } from "../policies/types";
import type { SectionScore } from "./sections";

/**
 * Quality report of a Pact computation (docs/06-matching.md, section 9,
 * "Contrôle qualité"), read by the team before the reveal: score
 * distribution, share of cross-school pairs, coverage per school and an
 * anonymised sample for manual review. It never contains an id, a first name
 * or an answer, and groups smaller than `MIN_GROUP_SIZE` are not broken down.
 */
export const MIN_GROUP_SIZE = 10;

export interface ReportParticipant {
  readonly id: string;
  readonly schoolSlug: string;
  readonly graduationYear: number;
}

export interface ReportPair {
  readonly a: string;
  readonly b: string;
  readonly score: number;
  readonly sections: readonly SectionScore[];
}

export interface ModeReportInput {
  readonly mode: Mode;
  readonly participants: readonly ReportParticipant[];
  readonly pairs: readonly ReportPair[];
  /** Statistics returned by the solver (engine, durations, edge counts). */
  readonly solver: Readonly<Record<string, unknown>>;
}

export interface ModeReport {
  readonly mode: Mode;
  readonly participants: number;
  readonly pairs: number;
  readonly coverage: number;
  readonly scores: {
    readonly min: number | null;
    readonly p10: number | null;
    readonly median: number | null;
    readonly mean: number | null;
    readonly max: number | null;
  };
  readonly histogram: readonly { readonly from: number; readonly to: number; readonly count: number }[];
  readonly crossSchoolShare: number | null;
  readonly sameYearShare: number | null;
  /** Per school: `null` counts when the group is too small to report. */
  readonly bySchool: readonly {
    readonly school: string;
    readonly participants: number | null;
    readonly matched: number | null;
  }[];
  readonly sample: readonly {
    readonly schools: readonly [string, string];
    readonly sameYear: boolean;
    readonly score: number;
    readonly sections: readonly SectionScore[];
  }[];
  readonly solver: Readonly<Record<string, unknown>>;
}

const round = (value: number, digits = 3) => Math.round(value * 10 ** digits) / 10 ** digits;

function quantile(sorted: readonly number[], q: number): number | null {
  if (sorted.length === 0) {
    return null;
  }
  const position = (sorted.length - 1) * q;
  const low = Math.floor(position);
  const high = Math.ceil(position);
  return round(
    (sorted[low] as number) + ((sorted[high] as number) - (sorted[low] as number)) * (position - low),
  );
}

function histogram(scores: readonly number[], threshold: number) {
  const bands: { from: number; to: number; count: number }[] = [];
  for (let low = Math.floor(threshold * 20) / 20; low < 1 - 1e-9; low = round(low + 0.05, 2)) {
    const high = round(low + 0.05, 2);
    const last = high >= 1 - 1e-9;
    bands.push({
      from: round(low, 2),
      to: high,
      count: scores.filter((s) => (s >= low && s < high) || (last && s === 1)).length,
    });
  }
  return bands;
}

/** `random` returns numbers in [0, 1): the sample is drawn with it (seeded in tests). */
export function pactModeReport(
  input: ModeReportInput,
  options: { threshold: number; sampleSize?: number; random?: () => number },
): ModeReport {
  const random = options.random ?? Math.random;
  const byId = new Map(input.participants.map((p) => [p.id, p]));
  const scores = input.pairs.map((pair) => pair.score).sort((x, y) => x - y);
  const described = input.pairs.flatMap((pair) => {
    const a = byId.get(pair.a);
    const b = byId.get(pair.b);
    return a && b ? [{ pair, a, b }] : [];
  });
  const crossSchool = described.filter(({ a, b }) => a.schoolSlug !== b.schoolSlug).length;
  const sameYear = described.filter(({ a, b }) => a.graduationYear === b.graduationYear).length;

  const matched = new Set(input.pairs.flatMap((pair) => [pair.a, pair.b]));
  const schools = [...new Set(input.participants.map((p) => p.schoolSlug))].sort();
  const bySchool = schools.map((school) => {
    const members = input.participants.filter((p) => p.schoolSlug === school);
    const large = members.length >= MIN_GROUP_SIZE;
    return {
      school,
      participants: large ? members.length : null,
      matched: large ? members.filter((p) => matched.has(p.id)).length : null,
    };
  });

  // Partial Fisher-Yates: a uniform sample without replacement.
  const pool = [...described];
  const sampleSize = Math.min(options.sampleSize ?? 20, pool.length);
  for (let i = 0; i < sampleSize; i++) {
    const j = i + Math.floor(random() * (pool.length - i));
    [pool[i], pool[j]] = [pool[j] as (typeof pool)[number], pool[i] as (typeof pool)[number]];
  }
  const sample = pool.slice(0, sampleSize).map(({ pair, a, b }) => ({
    schools: [a.schoolSlug, b.schoolSlug].sort() as [string, string],
    sameYear: a.graduationYear === b.graduationYear,
    score: round(pair.score),
    sections: pair.sections,
  }));

  return {
    mode: input.mode,
    participants: input.participants.length,
    pairs: input.pairs.length,
    coverage:
      input.participants.length === 0 ? 0 : round((2 * input.pairs.length) / input.participants.length),
    scores: {
      min: quantile(scores, 0),
      p10: quantile(scores, 0.1),
      median: quantile(scores, 0.5),
      mean: scores.length === 0 ? null : round(scores.reduce((sum, s) => sum + s, 0) / scores.length),
      max: quantile(scores, 1),
    },
    histogram: histogram(scores, options.threshold),
    crossSchoolShare: described.length === 0 ? null : round(crossSchool / described.length),
    sameYearShare: described.length === 0 ? null : round(sameYear / described.length),
    bySchool,
    sample,
    solver: input.solver,
  };
}
