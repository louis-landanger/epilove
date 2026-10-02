import type { Member, Relations } from "./types";

/** Test helpers shared by the policy tests (not exported from the package). */
export const TEST_TODAY = "2026-10-02";

export function testMember(overrides: Partial<Member> & Pick<Member, "id">): Member {
  return {
    status: "active",
    profileComplete: true,
    schoolSlug: "epita",
    graduationYear: 2029,
    birthDate: "2005-05-12",
    gender: "woman",
    modes: ["love", "friends"],
    interestedIn: ["man", "woman", "nonbinary"],
    ageRange: { min: 18, max: 30 },
    hideFromOwnSchool: false,
    hideFromOwnYear: false,
    incognito: false,
    emailHmac: `hmac-${overrides.id}`,
    hiddenEmailHmacs: new Set(),
    lastActiveOn: TEST_TODAY,
    ...overrides,
  };
}

export interface TestRelations {
  readonly blocks?: ReadonlyArray<readonly [string, string]>;
  readonly likes?: ReadonlyArray<readonly [string, string]>;
  readonly matches?: ReadonlyArray<readonly [string, string]>;
}

export function testRelations({ blocks = [], likes = [], matches = [] }: TestRelations = {}): Relations {
  const key = (a: string, b: string) => `${a}>${b}`;
  const blockSet = new Set(blocks.map(([a, b]) => key(a, b)));
  const likeSet = new Set(likes.map(([a, b]) => key(a, b)));
  const matchSet = new Set(matches.flatMap(([a, b]) => [key(a, b), key(b, a)]));
  return {
    hasBlocked: (a, b) => blockSet.has(key(a, b)),
    hasLiked: (a, b) => likeSet.has(key(a, b)),
    hasActiveMatch: (a, b) => matchSet.has(key(a, b)),
  };
}
