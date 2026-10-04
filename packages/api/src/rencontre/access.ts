import { canViewProfile, type ProfileAccess, type Relations } from "@atomes/core";
import type { Database } from "@atomes/db";
import { campusDate, loadMembers, loadRelations, type MemberRow } from "@atomes/db/repositories/members";
import { ORPCError } from "@orpc/server";

/**
 * Shared access checks of the dating modules. Every read about another member
 * goes through here, so the policies of @atomes/core are always applied.
 */

export interface PairAccess {
  readonly viewer: MemberRow;
  readonly target: MemberRow;
  readonly relations: Relations;
  readonly today: string;
  readonly access: ProfileAccess;
}

/** The viewer's own member row. A signed-in account without a profile yet cannot use the dating features. */
export async function requireMemberRow(db: Database, viewerId: string): Promise<MemberRow> {
  const rows = await loadMembers(db, [viewerId]);
  const row = rows.get(viewerId);
  if (!row) {
    throw new ORPCError("FORBIDDEN", { message: "profile_required" });
  }
  return row;
}

export async function loadPairAccess(db: Database, viewerId: string, targetId: string, now = new Date()) {
  const rows = await loadMembers(db, [viewerId, targetId]);
  const viewer = rows.get(viewerId);
  if (!viewer) {
    throw new ORPCError("FORBIDDEN", { message: "profile_required" });
  }
  const target = rows.get(targetId);
  if (!target) {
    return null;
  }
  const relations = await loadRelations(db, viewerId, [targetId]);
  const today = campusDate(now);
  return {
    viewer,
    target,
    relations,
    today,
    access: canViewProfile(viewer.member, target.member, { today, relations }),
  } satisfies PairAccess;
}

/**
 * Same as `loadPairAccess` but throws NOT_FOUND when the profile is not
 * visible: a refusal must not reveal whether the member exists, blocked us
 * or hid from us.
 */
export async function requireVisibleProfile(
  db: Database,
  viewerId: string,
  targetId: string,
  now = new Date(),
) {
  const pair = await loadPairAccess(db, viewerId, targetId, now);
  if (!pair?.access.visible) {
    throw new ORPCError("NOT_FOUND");
  }
  return pair;
}
