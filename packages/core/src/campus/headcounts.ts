import { SCHOOLS, type SchoolSlug } from "./schools";

/**
 * Approximate number of students per school on the Lyon campus.
 *
 * ESTIMATES TO BE CONFIRMED with the schools (docs/00-vision.md, "Taille du
 * bassin"). They only serve to rank the school race of the waiting list by
 * share of each school's headcount rather than by absolute numbers
 * (docs/10-lancement.md, section 3), so that a small school can win.
 *
 * - EPITA: ~365 in 2023-2024 and growing.
 * - ESME: ~450.
 * - Sup'Biotech: "a few hundred at most".
 * - ISG: ~500 and more.
 * - IPSA: campus opened in 2025, first years only.
 */
export const SCHOOL_HEADCOUNT_ESTIMATES: Readonly<Record<SchoolSlug, number>> = {
  epita: 400,
  esme: 450,
  supbiotech: 250,
  isg: 500,
  ipsa: 150,
};

/** Collective goal of the waiting list, unlocking the launch party for everyone (docs/10, section 3). */
export const WAITLIST_COLLECTIVE_GOAL = 1000;

export interface SchoolRaceEntry {
  readonly slug: SchoolSlug;
  readonly count: number;
  readonly headcount: number;
  /** Sign-ups divided by the estimated headcount (can exceed 1 if the estimate is too low). */
  readonly share: number;
  /** 1-based, standard competition ranking: equal shares share a rank (1, 1, 3…). */
  readonly rank: number;
}

function assertCount(value: number, label: string): void {
  if (!Number.isInteger(value) || value < 0) {
    throw new RangeError(`${label} must be a non-negative integer, got ${value}.`);
  }
}

/**
 * Ranks the schools by share of their headcount. Every school of `SCHOOLS`
 * appears exactly once, missing counts are zero, and ties keep the order of
 * `SCHOOLS` so the result is stable between two refreshes.
 */
export function rankSchoolRace(
  counts: Partial<Record<SchoolSlug, number>>,
  headcounts: Readonly<Record<SchoolSlug, number>> = SCHOOL_HEADCOUNT_ESTIMATES,
): SchoolRaceEntry[] {
  const entries = SCHOOLS.map((school, order) => {
    const count = counts[school.slug] ?? 0;
    const headcount = headcounts[school.slug];
    assertCount(count, `Count of ${school.slug}`);
    if (!Number.isInteger(headcount) || headcount <= 0) {
      throw new RangeError(`Headcount of ${school.slug} must be a positive integer, got ${headcount}.`);
    }
    return { slug: school.slug, count, headcount, share: count / headcount, order };
  });

  // Compare count/headcount exactly with integers, never with rounded floats.
  const compare = (a: (typeof entries)[number], b: (typeof entries)[number]) =>
    b.count * a.headcount - a.count * b.headcount;

  const sorted = [...entries].sort((a, b) => compare(a, b) || a.order - b.order);

  return sorted.map((entry, index) => {
    let rank = index + 1;
    while (rank > 1) {
      const previous = sorted[rank - 2];
      if (!previous || compare(previous, entry) !== 0) {
        break;
      }
      rank -= 1;
    }
    return {
      slug: entry.slug,
      count: entry.count,
      headcount: entry.headcount,
      share: entry.share,
      rank,
    };
  });
}

export interface CollectiveGoalProgress {
  readonly total: number;
  readonly goal: number;
  /** Between 0 and 1. */
  readonly ratio: number;
  readonly remaining: number;
  readonly reached: boolean;
}

export function collectiveGoalProgress(
  total: number,
  goal: number = WAITLIST_COLLECTIVE_GOAL,
): CollectiveGoalProgress {
  assertCount(total, "Total");
  if (!Number.isInteger(goal) || goal <= 0) {
    throw new RangeError(`Goal must be a positive integer, got ${goal}.`);
  }
  return {
    total,
    goal,
    ratio: Math.min(1, total / goal),
    remaining: Math.max(0, goal - total),
    reached: total >= goal,
  };
}
