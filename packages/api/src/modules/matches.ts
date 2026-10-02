import { AVAILABILITY_RULES, availabilityShown, canViewProfile, checkAvailability } from "@epilove/core";
import { availabilityOf, setAvailability } from "@epilove/db/repositories/campus-community";
import { loadProfileContent } from "@epilove/db/repositories/discovery";
import { activeMatchesOf, matchForMember, unmatch } from "@epilove/db/repositories/matches";
import { campusDate, loadMembers, loadRelations } from "@epilove/db/repositories/members";
import { ORPCError } from "@orpc/server";
import { os, requireViewer } from "../procedures";
import { requireMemberRow } from "../rencontre/access";
import { signedPhotoUrl } from "../rencontre/media";
import { lastMessagePreviews } from "../rencontre/messages";

export const matches = {
  list: os.matches.list.use(requireViewer).handler(async ({ context }) => {
    const db = context.database();
    const today = campusDate(new Date());
    const viewer = await requireMemberRow(db, context.viewer.userId);
    const rows = await activeMatchesOf(db, viewer.member.id);
    const otherIds = rows.map((r) => r.otherId);
    const now = new Date();
    const [members, relations, content, previews, dispo] = await Promise.all([
      loadMembers(db, otherIds),
      loadRelations(db, viewer.member.id, otherIds),
      loadProfileContent(db, otherIds),
      lastMessagePreviews(
        db,
        rows.map((r) => r.id),
      ),
      availabilityOf(db, otherIds),
    ]);
    return {
      matches: rows.flatMap((row) => {
        const other = members.get(row.otherId);
        // A match stays listed only while its profile is visible (no block, no ban, no hidden contact).
        if (!other || !canViewProfile(viewer.member, other.member, { today, relations }).visible) {
          return [];
        }
        const photo = content.get(row.otherId)?.photos[0];
        const preview = previews.get(row.id);
        const status = dispo.get(row.otherId);
        return [
          {
            matchId: row.id,
            mode: row.mode,
            createdAt: row.createdAt.toISOString(),
            other: {
              userId: row.otherId,
              firstName: other.firstName,
              photoUrl: photo ? signedPhotoUrl(photo.storageKey, "thumb") : null,
              school: { slug: other.member.schoolSlug, name: other.schoolName },
              available:
                status && availabilityShown(status, other.member, now)
                  ? { activity: status.activity, area: status.area, until: status.until.toISOString() }
                  : null,
            },
            lastMessage: preview
              ? {
                  preview: preview.text,
                  kind: preview.kind,
                  at: preview.at.toISOString(),
                  fromMe: preview.senderId === viewer.member.id,
                }
              : null,
            unread: row.unread,
          },
        ];
      }),
    };
  }),

  unmatch: os.matches.unmatch.use(requireViewer).handler(async ({ context, input }) => {
    const db = context.database();
    const found = await matchForMember(db, input.matchId, context.viewer.userId);
    if (!found) {
      throw new ORPCError("NOT_FOUND");
    }
    await unmatch(db, input.matchId, context.viewer.userId);
    return { ok: true as const };
  }),

  availability: os.matches.availability.use(requireViewer).handler(async ({ context }) => {
    const db = context.database();
    const viewer = await requireMemberRow(db, context.viewer.userId);
    const mine = (await availabilityOf(db, [viewer.member.id])).get(viewer.member.id);
    return {
      availability:
        mine && mine.until.getTime() > Date.now()
          ? { activity: mine.activity, area: mine.area, until: mine.until.toISOString() }
          : null,
    };
  }),

  setAvailability: os.matches.setAvailability.use(requireViewer).handler(async ({ context, input }) => {
    const db = context.database();
    const viewer = await requireMemberRow(db, context.viewer.userId);
    if (!input.availability) {
      await setAvailability(db, viewer.member.id, null);
      return { availability: null };
    }
    const until = new Date(input.availability.until);
    const check = checkAvailability(until, new Date());
    if (!check.ok) {
      throw new ORPCError("BAD_REQUEST", { message: check.reason });
    }
    const value = { activity: input.availability.activity, area: input.availability.area, until };
    await setAvailability(db, viewer.member.id, value);
    return { availability: { ...value, until: until.toISOString() } };
  }),
};
