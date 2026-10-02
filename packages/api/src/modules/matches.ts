import { canViewProfile } from "@epilove/core";
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
    const [members, relations, content, previews] = await Promise.all([
      loadMembers(db, otherIds),
      loadRelations(db, viewer.member.id, otherIds),
      loadProfileContent(db, otherIds),
      lastMessagePreviews(
        db,
        rows.map((r) => r.id),
      ),
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
            },
            lastMessage: preview
              ? {
                  preview: preview.text,
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
};
