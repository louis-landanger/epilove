import { ageOn } from "../people/age";
import type { Member, Mode } from "../policies/types";
import type { IsoDate } from "../time/calendar";

/** Deck filters chosen by the member (DEC-06), applied to the deck and the Drop. One-way. */
export interface DeckFilter {
  readonly mode: "all" | Mode;
  readonly schoolSlugs: readonly string[];
  readonly graduationYears: readonly number[];
  readonly intentions: readonly string[];
  readonly ageMin: number | null;
  readonly ageMax: number | null;
}

export function matchesDeckFilter(
  filter: DeckFilter,
  target: { readonly member: Member; readonly intentions: readonly string[] },
  modes: readonly Mode[],
  today: IsoDate,
): boolean {
  if (filter.mode !== "all" && !modes.includes(filter.mode)) {
    return false;
  }
  if (filter.schoolSlugs.length > 0 && !filter.schoolSlugs.includes(target.member.schoolSlug)) {
    return false;
  }
  if (filter.graduationYears.length > 0 && !filter.graduationYears.includes(target.member.graduationYear)) {
    return false;
  }
  if (filter.intentions.length > 0 && !target.intentions.some((i) => filter.intentions.includes(i))) {
    return false;
  }
  const age = ageOn(target.member.birthDate, today);
  return (filter.ageMin === null || age >= filter.ageMin) && (filter.ageMax === null || age <= filter.ageMax);
}
