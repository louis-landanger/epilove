import {
  calendarDateIn,
  type Gender,
  type IsoDate,
  LYON_CAMPUS,
  type Member,
  type Mode,
  type Relations,
} from "@epilove/core";
import { and, eq, inArray, isNull, lt, ne, or, sql } from "drizzle-orm";
import type { Database } from "../client";
import {
  appUser,
  block,
  hiddenContact,
  likeAction,
  match,
  photo,
  preferences,
  profile,
  profileInterest,
  school,
} from "../schema";

/**
 * Read side of the members (read-only access to session A's tables): turns
 * rows into the `Member` and `Relations` objects the access policies of
 * @epilove/core work on. Nothing here decides visibility: callers always
 * pass the result through `canSee`, `canViewProfile` or `canMessage`.
 */

/** The campus calendar date of an instant (activity windows, ages). */
export const campusDate = (instant: Date): IsoDate => calendarDateIn(LYON_CAMPUS.timeZone, instant);

export interface MemberRow {
  readonly member: Member;
  readonly firstName: string;
  readonly pronouns: string | null;
  readonly program: string | null;
  readonly schoolName: string;
  readonly languages: readonly string[];
  readonly intentions: readonly string[];
  readonly approvedPhotos: number;
  /** Profile completeness score (PRO-05), 0 to 100. */
  readonly completeness: number;
  readonly crossSchoolBoost: boolean;
  readonly schoolFilter: readonly string[];
  readonly createdAt: Date;
}

const memberColumns = {
  id: appUser.id,
  status: appUser.status,
  emailHmac: appUser.emailHmac,
  lastActiveAt: appUser.lastActiveAt,
  createdAt: appUser.createdAt,
  schoolSlug: school.slug,
  schoolName: school.name,
  firstName: profile.firstName,
  birthDate: profile.birthDate,
  gender: profile.gender,
  pronouns: profile.pronouns,
  program: profile.program,
  graduationYear: profile.graduationYear,
  languages: profile.languages,
  intentions: profile.intentions,
  completeness: profile.completeness,
  modes: preferences.modes,
  interestedIn: preferences.interestedIn,
  ageMin: preferences.ageMin,
  ageMax: preferences.ageMax,
  hideFromOwnSchool: preferences.hideFromOwnSchool,
  hideFromOwnYear: preferences.hideFromOwnYear,
  incognito: preferences.incognito,
  crossSchoolBoost: preferences.crossSchoolBoost,
  schoolFilter: preferences.schoolFilter,
  approvedPhotos: sql<number>`(select count(*)::int from ${photo} where ${photo.userId} = ${appUser.id} and ${photo.status} = 'approved')`,
  hiddenEmailHmacs: sql<
    string[]
  >`coalesce((select array_agg(${hiddenContact.emailHmac}) from ${hiddenContact} where ${hiddenContact.userId} = ${appUser.id}), '{}')`,
};

type MemberSelection = Awaited<ReturnType<typeof selectMembers>>[number];

function toMemberRow(r: MemberSelection): MemberRow {
  // A profile is complete once onboarding is over and at least one photo is approved.
  const profileComplete = r.status !== "onboarding" && r.approvedPhotos > 0;
  return {
    member: {
      id: r.id,
      status: r.status,
      profileComplete,
      schoolSlug: r.schoolSlug,
      graduationYear: r.graduationYear,
      birthDate: r.birthDate,
      gender: r.gender,
      modes: r.modes as Mode[],
      interestedIn: r.interestedIn as Gender[],
      ageRange: { min: r.ageMin, max: r.ageMax },
      hideFromOwnSchool: r.hideFromOwnSchool,
      hideFromOwnYear: r.hideFromOwnYear,
      incognito: r.incognito,
      emailHmac: r.emailHmac,
      hiddenEmailHmacs: new Set(r.hiddenEmailHmacs),
      lastActiveOn: campusDate(r.lastActiveAt ?? r.createdAt),
    },
    firstName: r.firstName,
    pronouns: r.pronouns,
    program: r.program,
    schoolName: r.schoolName,
    languages: r.languages,
    intentions: r.intentions,
    approvedPhotos: r.approvedPhotos,
    completeness: r.completeness,
    crossSchoolBoost: r.crossSchoolBoost,
    schoolFilter: r.schoolFilter,
    createdAt: r.createdAt,
  };
}

function selectMembers(db: Database) {
  return db
    .select(memberColumns)
    .from(appUser)
    .innerJoin(school, eq(school.id, appUser.schoolId))
    .innerJoin(profile, eq(profile.userId, appUser.id))
    .innerJoin(preferences, eq(preferences.userId, appUser.id));
}

/** Members by id. Accounts without a profile yet (early onboarding) are absent from the result. */
export async function loadMembers(db: Database, ids: readonly string[]): Promise<Map<string, MemberRow>> {
  const unique = [...new Set(ids)];
  if (unique.length === 0) {
    return new Map();
  }
  const rows = await selectMembers(db).where(inArray(appUser.id, unique));
  return new Map(rows.map((row) => [row.id, toMemberRow(row)]));
}

export async function loadMember(db: Database, id: string): Promise<MemberRow | null> {
  return (await loadMembers(db, [id])).get(id) ?? null;
}

/**
 * Coarse SQL pre-filter for discovery: members who could possibly be shown
 * (usable status, at least one approved photo). `canSee` does the real work.
 */
export async function loadDiscoverableMembers(db: Database, excludeId: string): Promise<MemberRow[]> {
  const rows = await selectMembers(db).where(
    and(
      inArray(appUser.status, ["active", "restricted"]),
      ne(appUser.id, excludeId),
      sql`exists (select 1 from ${photo} where ${photo.userId} = ${appUser.id} and ${photo.status} = 'approved')`,
    ),
  );
  return rows.map(toMemberRow);
}

/**
 * Relations between `viewerId` and `others` (blocks, likes, active and ended matches),
 * loaded in three queries. Relations between two of the `others` are unknown
 * and answered `false`: only pass pairs involving the viewer to the policies.
 */
export async function loadRelations(
  db: Database,
  viewerId: string,
  others: readonly string[],
): Promise<Relations> {
  const ids = [...new Set(others)].filter((id) => id !== viewerId);
  if (ids.length === 0) {
    return {
      hasBlocked: () => false,
      hasLiked: () => false,
      hasActiveMatch: () => false,
      hasEndedMatch: () => false,
    };
  }
  const [blocks, likes, matches] = await Promise.all([
    db
      .select({ blockerId: block.blockerId, blockedId: block.blockedId })
      .from(block)
      .where(
        or(
          and(eq(block.blockerId, viewerId), inArray(block.blockedId, ids)),
          and(eq(block.blockedId, viewerId), inArray(block.blockerId, ids)),
        ),
      ),
    db
      .select({ actorId: likeAction.actorId, targetId: likeAction.targetId })
      .from(likeAction)
      .where(
        and(
          ne(likeAction.kind, "pass"),
          or(
            and(eq(likeAction.actorId, viewerId), inArray(likeAction.targetId, ids)),
            and(eq(likeAction.targetId, viewerId), inArray(likeAction.actorId, ids)),
          ),
        ),
      ),
    db
      .select({ userLow: match.userLow, userHigh: match.userHigh, status: match.status })
      .from(match)
      .where(
        and(
          or(
            and(eq(match.userLow, viewerId), inArray(match.userHigh, ids)),
            and(eq(match.userHigh, viewerId), inArray(match.userLow, ids)),
          ),
        ),
      ),
  ]);
  const key = (a: string, b: string) => `${a}>${b}`;
  const blockSet = new Set(blocks.map((b) => key(b.blockerId, b.blockedId)));
  const likeSet = new Set(likes.map((l) => key(l.actorId, l.targetId)));
  const pairs = (status: string) =>
    new Set(
      matches
        .filter((m) => m.status === status)
        .flatMap((m) => [key(m.userLow, m.userHigh), key(m.userHigh, m.userLow)]),
    );
  const matchSet = pairs("active");
  const endedSet = pairs("unmatched");
  return {
    hasBlocked: (a, b) => blockSet.has(key(a, b)),
    hasLiked: (a, b) => likeSet.has(key(a, b)),
    hasActiveMatch: (a, b) => matchSet.has(key(a, b)),
    hasEndedMatch: (a, b) => endedSet.has(key(a, b)),
  };
}

/** Interest ids of several members (cheap: used to rank the whole deck). */
export async function interestIdsOf(db: Database, ids: readonly string[]): Promise<Map<string, Set<string>>> {
  const result = new Map<string, Set<string>>(ids.map((id) => [id, new Set()]));
  if (ids.length === 0) {
    return result;
  }
  const rows = await db
    .select({ userId: profileInterest.userId, interestId: profileInterest.interestId })
    .from(profileInterest)
    .where(inArray(profileInterest.userId, [...ids]));
  for (const row of rows) {
    result.get(row.userId)?.add(row.interestId);
  }
  return result;
}

/** Marks the member as active today (feeds the 21-day activity window). At most one write per hour. */
export async function touchLastActive(db: Database, userId: string, now: Date = new Date()) {
  await db
    .update(appUser)
    .set({ lastActiveAt: now })
    .where(
      and(
        eq(appUser.id, userId),
        or(isNull(appUser.lastActiveAt), lt(appUser.lastActiveAt, new Date(now.getTime() - 3_600_000))),
      ),
    );
}

/** Development member picker (/dev): never used outside APP_ENV=development|test. */
export async function listMembersForDevPicker(db: Database) {
  return db
    .select({
      id: appUser.id,
      firstName: profile.firstName,
      status: appUser.status,
      schoolSlug: school.slug,
      schoolName: school.name,
      gender: profile.gender,
      birthDate: profile.birthDate,
      modes: preferences.modes,
    })
    .from(appUser)
    .innerJoin(school, eq(school.id, appUser.schoolId))
    .innerJoin(profile, eq(profile.userId, appUser.id))
    .innerJoin(preferences, eq(preferences.userId, appUser.id))
    .orderBy(appUser.id)
    .limit(1000);
}
