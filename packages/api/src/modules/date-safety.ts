import { createHash, randomBytes } from "node:crypto";
import { checkShare, shareState, shareTimes } from "@atomes/core";
import { encryptText } from "@atomes/crypto";
import type { Database } from "@atomes/db";
import { spotById } from "@atomes/db/repositories/campus-life";
import {
  answerCheckIn,
  type DateShareRow,
  insertShare,
  revokeShare,
  shareById,
  shareByTokenHash,
  shareCounts,
  sharesOfDate,
} from "@atomes/db/repositories/messaging-date-safety";
import { ORPCError } from "@orpc/server";
import { z } from "zod";
import { os, requireViewer } from "../procedures";
import { decryptBody, messageKeyRing } from "../rencontre/messages";
import { requireConversation, requireDateProposal } from "./messaging";

/** Who, where and when, frozen when the link is created. */
const details = z.object({
  sharer: z.string(),
  other: z.string(),
  otherId: z.uuid(),
  place: z.string(),
  startsAt: z.string(),
  latitude: z.number().nullable(),
  longitude: z.number().nullable(),
});

const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");

function detailsOf(share: DateShareRow) {
  try {
    const parsed = details.safeParse(JSON.parse(decryptBody(share.detailsEncrypted, share.keyId)));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

/** The member's kit for the date of `share`: every link they created for it, and the check-in. */
async function kitOf(db: Database, share: DateShareRow, now: Date) {
  const info = detailsOf(share);
  if (!info) {
    throw new ORPCError("NOT_FOUND");
  }
  const shares = await sharesOfDate(db, share.userId, share.messageId);
  return {
    matchId: share.matchId,
    messageId: share.messageId,
    otherUserId: info.otherId,
    otherFirstName: info.other,
    place: info.place,
    startsAt: info.startsAt,
    checkInAt: share.checkInAt.toISOString(),
    checkIn: shares.find((s) => s.checkInAnswer)?.checkInAnswer ?? null,
    shares: shares.map((s) => ({
      id: s.id,
      path: `/partage/${decryptBody(s.tokenEncrypted, s.keyId)}`,
      createdAt: s.createdAt.toISOString(),
      expiresAt: s.expiresAt.toISOString(),
      state: shareState(s, now),
    })),
  };
}

/** A share of the viewer's; anybody else's is "not found". */
async function requireOwnShare(db: Database, shareId: string, viewerId: string) {
  const share = await shareById(db, shareId);
  if (!share || share.userId !== viewerId) {
    throw new ORPCError("NOT_FOUND");
  }
  return share;
}

/**
 * Date safety kit (IRL-03). Creating a link needs an open conversation and an
 * accepted date; reading the kit, answering the check-in and revoking only
 * need to own the link, so that they still work after a block or an unmatch.
 */
export const dateSafety = {
  share: os.dateSafety.share.use(requireViewer).handler(async ({ context, input }) => {
    const db = context.database();
    const now = new Date();
    const viewerId = context.viewer.userId;
    const conversation = await requireConversation(db, viewerId, input.matchId, now);
    const retried = await shareById(db, input.id);
    if (retried) {
      if (retried.userId !== viewerId) {
        throw new ORPCError("CONFLICT", { message: "id_conflict" });
      }
      return { kit: await kitOf(db, retried, now) };
    }
    const { message, date } = await requireDateProposal(db, conversation.match.id, input.messageId);
    const startsAt = new Date(date.startsAt);
    const counts = await shareCounts(db, {
      userId: viewerId,
      messageId: message.id,
      now,
      since: new Date(now.getTime() - 86_400_000),
    });
    const check = checkShare({ status: date.status, startsAt, ...counts, now });
    if (!check.ok) {
      throw new ORPCError(check.reason === "rate_limited" ? "TOO_MANY_REQUESTS" : "BAD_REQUEST", {
        message: check.reason,
      });
    }
    const spot = date.spotId ? await spotById(db, date.spotId) : null;
    const token = randomBytes(32).toString("base64url");
    const ring = messageKeyRing();
    const sealedDetails = encryptText(
      ring,
      JSON.stringify({
        sharer: conversation.viewer.firstName,
        other: conversation.other.firstName,
        otherId: conversation.other.member.id,
        place: spot?.nameFr ?? date.place ?? "",
        startsAt: startsAt.toISOString(),
        latitude: spot?.latitude ?? null,
        longitude: spot?.longitude ?? null,
      } satisfies z.infer<typeof details>),
    );
    const sealedToken = encryptText(ring, token);
    const saved = await insertShare(db, {
      id: input.id,
      userId: viewerId,
      matchId: conversation.match.id,
      messageId: message.id,
      tokenHash: hashToken(token),
      tokenEncrypted: sealedToken.data,
      detailsEncrypted: sealedDetails.data,
      keyId: sealedDetails.keyId,
      ...shareTimes(startsAt),
    });
    if (!saved) {
      throw new ORPCError("CONFLICT", { message: "id_conflict" });
    }
    return { kit: await kitOf(db, saved.share, now) };
  }),

  kit: os.dateSafety.kit.use(requireViewer).handler(async ({ context, input }) => {
    const db = context.database();
    const viewerId = context.viewer.userId;
    if ("shareId" in input) {
      return { kit: await kitOf(db, await requireOwnShare(db, input.shareId, viewerId), new Date()) };
    }
    const [latest] = await sharesOfDate(db, viewerId, input.messageId);
    return { kit: latest ? await kitOf(db, latest, new Date()) : null };
  }),

  checkIn: os.dateSafety.checkIn.use(requireViewer).handler(async ({ context, input }) => {
    const db = context.database();
    const now = new Date();
    const share = await requireOwnShare(db, input.shareId, context.viewer.userId);
    await answerCheckIn(db, { messageId: share.messageId, userId: share.userId, answer: input.answer, now });
    return { kit: await kitOf(db, share, now) };
  }),

  revoke: os.dateSafety.revoke.use(requireViewer).handler(async ({ context, input }) => {
    const db = context.database();
    const now = new Date();
    const share = await requireOwnShare(db, input.shareId, context.viewer.userId);
    await revokeShare(db, share.id, share.userId, now);
    return { kit: await kitOf(db, share, now) };
  }),

  /** Public page of the trusted person: no account, only the unguessable token. */
  shared: os.dateSafety.shared.handler(async ({ context, input }) => {
    const db = context.database();
    const share = await shareByTokenHash(db, hashToken(input.token));
    const info = share && shareState(share, new Date()) === "active" ? detailsOf(share) : null;
    if (!share || !info) {
      throw new ORPCError("NOT_FOUND");
    }
    const answered = (await sharesOfDate(db, share.userId, share.messageId)).find((s) => s.checkInAnswer);
    return {
      sharerFirstName: info.sharer,
      otherFirstName: info.other,
      place: info.place,
      startsAt: info.startsAt,
      mapUrl:
        info.latitude !== null && info.longitude !== null
          ? `https://www.openstreetmap.org/?mlat=${info.latitude}&mlon=${info.longitude}#map=17/${info.latitude}/${info.longitude}`
          : null,
      checkIn:
        answered?.checkInAnswer && answered.checkedInAt
          ? { answer: answered.checkInAnswer, at: answered.checkedInAt.toISOString() }
          : null,
      expiresAt: share.expiresAt.toISOString(),
    };
  }),
};
