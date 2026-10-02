import type { ChatMessage } from "@epilove/contracts";
import {
  canMessage,
  cleanMessage,
  explainCompatibility,
  isReaction,
  MESSAGING_RULES,
  pickIcebreakers,
  screenMessage,
} from "@epilove/core";
import { encryptText } from "@epilove/crypto";
import type { Database } from "@epilove/db";
import { loadProfileContent } from "@epilove/db/repositories/discovery";
import { matchForMember } from "@epilove/db/repositories/matches";
import {
  campusDate,
  interestIdsOf,
  loadMembers,
  loadRelations,
  touchLastActive,
} from "@epilove/db/repositories/members";
import {
  chatSettingsOf,
  insertMessage,
  markRead,
  messagesByIds,
  messagesOf,
  messagesSentSince,
  notifyMessageUpdated,
  notifyRead,
  reactionsOf,
  readMarkers,
  type StoredMessage,
  saveChatSettings,
  setReaction,
} from "@epilove/db/repositories/messaging";
import { answerSheets, listActiveQuestions } from "@epilove/db/repositories/questionnaire";
import { personalChannel } from "@epilove/realtime";
import { ORPCError } from "@orpc/server";
import { os, requireViewer } from "../procedures";
import { optionLabel, questionText } from "../rencontre/compatibility";
import { signedPhotoUrl } from "../rencontre/media";
import { decryptBody, messageKeyRing } from "../rencontre/messages";
import { realtimePublisher } from "../rencontre/realtime";

/**
 * Loads a conversation the viewer may write in. Anything else (not a
 * participant, unmatched, blocked, hidden, banned…) is a NOT_FOUND: a refusal
 * never tells why.
 */
async function requireConversation(db: Database, viewerId: string, matchId: string, now = new Date()) {
  const found = await matchForMember(db, matchId, viewerId);
  if (!found) {
    throw new ORPCError("NOT_FOUND");
  }
  const members = await loadMembers(db, [viewerId, found.otherId]);
  const viewer = members.get(viewerId);
  const other = members.get(found.otherId);
  if (!viewer || !other) {
    throw new ORPCError("NOT_FOUND");
  }
  const relations = await loadRelations(db, viewerId, [found.otherId]);
  const decision = canMessage(viewer.member, other.member, { today: campusDate(now), relations });
  if (!decision.allowed || found.status !== "active") {
    throw new ORPCError("NOT_FOUND");
  }
  return { match: found, viewer, other };
}

async function toChatMessages(db: Database, rows: readonly StoredMessage[]): Promise<ChatMessage[]> {
  const replyIds = [...new Set(rows.flatMap((m) => (m.replyTo ? [m.replyTo] : [])))];
  const known = new Map(rows.map((m) => [m.id, m]));
  const missing = replyIds.filter((id) => !known.has(id));
  for (const m of await messagesByIds(db, missing)) {
    known.set(m.id, m);
  }
  const reactions = await reactionsOf(
    db,
    rows.map((m) => m.id),
  );
  const text = (m: StoredMessage) => (m.deletedAt ? "" : decryptBody(m.bodyEncrypted, m.keyId));
  return rows.map((m) => {
    const reply = m.replyTo ? known.get(m.replyTo) : undefined;
    return {
      id: m.id,
      senderId: m.senderId,
      kind: m.kind,
      text: text(m),
      replyTo:
        reply && reply.matchId === m.matchId
          ? { id: reply.id, senderId: reply.senderId, text: text(reply) }
          : null,
      reactions: reactions
        .filter((r) => r.messageId === m.id)
        .map((r) => ({ userId: r.userId, emoji: r.emoji })),
      createdAt: m.createdAt.toISOString(),
      editedAt: m.editedAt?.toISOString() ?? null,
      deleted: m.deletedAt !== null,
    };
  });
}

export const messaging = {
  thread: os.messaging.thread.use(requireViewer).handler(async ({ context, input }) => {
    const db = context.database();
    const now = new Date();
    const { match, viewer, other } = await requireConversation(db, context.viewer.userId, input.matchId, now);
    await touchLastActive(db, viewer.member.id, now);

    const [page, settings, markers, content, interests, sheets, questions] = await Promise.all([
      messagesOf(db, match.id, { limit: 40 }),
      chatSettingsOf(db, [viewer.member.id, other.member.id]),
      readMarkers(db, match.id),
      loadProfileContent(db, [other.member.id]),
      interestIdsOf(db, [viewer.member.id, other.member.id]),
      answerSheets(db, [viewer.member.id, other.member.id]),
      listActiveQuestions(db),
    ]);
    const mine = settings.get(viewer.member.id);
    const theirs = settings.get(other.member.id);
    const otherContent = content.get(other.member.id);
    const myInterests = interests.get(viewer.member.id) ?? new Set<string>();
    const shared = (otherContent?.interests ?? []).filter((i) => myInterests.has(i.id));
    const byId = new Map(questions.map((q) => [q.id, q]));
    const agreements = explainCompatibility(
      sheets.get(viewer.member.id) ?? new Map(),
      sheets.get(other.member.id) ?? new Map(),
      { maxAgreements: 3 },
    ).agreements.flatMap((a) => {
      const question = byId.get(a.questionId);
      return question
        ? [
            {
              question: questionText(question, input.locale),
              answer: optionLabel(question, a.answer, input.locale),
            },
          ]
        : [];
    });
    const photo = otherContent?.photos[0];
    const bothShareOnline = Boolean(mine?.onlineStatus && theirs?.onlineStatus);

    return {
      matchId: match.id,
      mode: match.mode,
      createdAt: match.createdAt.toISOString(),
      me: viewer.member.id,
      other: {
        userId: other.member.id,
        firstName: other.firstName,
        photoUrl: photo ? signedPhotoUrl(photo.storageKey, "thumb") : null,
        school: { slug: other.member.schoolSlug, name: other.schoolName },
      },
      canMessage: true,
      otherLastReadId:
        mine?.readReceipts && theirs?.readReceipts ? (markers.get(other.member.id) ?? null) : null,
      otherOnline: bothShareOnline
        ? await realtimePublisher().isOnline(personalChannel(other.member.id))
        : null,
      icebreakers: pickIcebreakers({
        sharedInterests: shared.map((i) => (input.locale === "en" ? i.labelEn : i.labelFr)),
        theirPrompts: (otherContent?.prompts ?? []).map((p) =>
          input.locale === "en" ? p.questionEn : p.questionFr,
        ),
        sharedAnswers: agreements,
        seed: match.id,
      }).map((i) => ({ key: i.key, params: { ...i.params } })),
      messages: await toChatMessages(db, page.messages),
      hasMore: page.hasMore,
    };
  }),

  history: os.messaging.history.use(requireViewer).handler(async ({ context, input }) => {
    const db = context.database();
    const { match } = await requireConversation(db, context.viewer.userId, input.matchId);
    const page = await messagesOf(db, match.id, {
      before: input.before,
      after: input.after,
      limit: input.limit,
    });
    return { messages: await toChatMessages(db, page.messages), hasMore: page.hasMore };
  }),

  send: os.messaging.send.use(requireViewer).handler(async ({ context, input }) => {
    const db = context.database();
    const now = new Date();
    const { match, viewer, other } = await requireConversation(db, context.viewer.userId, input.matchId, now);
    const text = cleanMessage(input.text);
    if (text.length === 0 || text.length > MESSAGING_RULES.maxLength) {
      throw new ORPCError("BAD_REQUEST", { message: "empty_message" });
    }
    if (
      (await messagesSentSince(db, viewer.member.id, new Date(now.getTime() - 60_000))) >=
      MESSAGING_RULES.perMinute
    ) {
      throw new ORPCError("TOO_MANY_REQUESTS", { message: "rate_limited" });
    }
    // The client-generated id must be recent: it orders the conversation.
    const idTime = Number.parseInt(input.id.replaceAll("-", "").slice(0, 12), 16);
    if (Math.abs(idTime - now.getTime()) > 5 * 60_000) {
      throw new ORPCError("BAD_REQUEST", { message: "invalid_id" });
    }
    const flags = screenMessage(text);
    const result = await insertMessage(db, {
      id: input.id,
      matchId: match.id,
      senderId: viewer.member.id,
      recipientId: other.member.id,
      body: encryptText(messageKeyRing(), text),
      replyTo: input.replyTo,
      moderation: flags.length > 0 ? { flags } : null,
      now,
    });
    if (!result.ok) {
      throw new ORPCError(result.reason === "id_conflict" ? "CONFLICT" : "BAD_REQUEST", {
        message: result.reason,
      });
    }
    await touchLastActive(db, viewer.member.id, now);
    const [message] = await toChatMessages(db, [result.message]);
    if (!message) {
      throw new ORPCError("INTERNAL_SERVER_ERROR");
    }
    return { message, flags };
  }),

  read: os.messaging.read.use(requireViewer).handler(async ({ context, input }) => {
    const db = context.database();
    const { match, viewer, other } = await requireConversation(db, context.viewer.userId, input.matchId);
    const moved = await markRead(db, match.id, viewer.member.id, input.messageId);
    if (moved) {
      const settings = await chatSettingsOf(db, [viewer.member.id, other.member.id]);
      if (settings.get(viewer.member.id)?.readReceipts && settings.get(other.member.id)?.readReceipts) {
        await notifyRead(db, other.member.id, match.id, input.messageId);
      }
    }
    return { ok: true as const };
  }),

  react: os.messaging.react.use(requireViewer).handler(async ({ context, input }) => {
    const db = context.database();
    const { match, viewer, other } = await requireConversation(db, context.viewer.userId, input.matchId);
    if (input.emoji !== null && !isReaction(input.emoji)) {
      throw new ORPCError("BAD_REQUEST", { message: "invalid_reaction" });
    }
    const [target] = await messagesByIds(db, [input.messageId]);
    if (!target || target.matchId !== match.id || target.deletedAt) {
      throw new ORPCError("NOT_FOUND");
    }
    await setReaction(db, input.messageId, viewer.member.id, input.emoji);
    await notifyMessageUpdated(db, [viewer.member.id, other.member.id], match.id, input.messageId);
    return { ok: true as const };
  }),

  typing: os.messaging.typing.use(requireViewer).handler(async ({ context, input }) => {
    const db = context.database();
    const { match, other } = await requireConversation(db, context.viewer.userId, input.matchId);
    // Best effort: a lost "is typing" event is harmless.
    await realtimePublisher()
      .publish(personalChannel(other.member.id), { type: "typing", matchId: match.id })
      .catch(() => undefined);
    return { ok: true as const };
  }),

  settings: os.messaging.settings.use(requireViewer).handler(async ({ context }) => {
    const db = context.database();
    const settings = await chatSettingsOf(db, [context.viewer.userId]);
    return settings.get(context.viewer.userId) ?? { readReceipts: true, onlineStatus: true };
  }),

  saveSettings: os.messaging.saveSettings.use(requireViewer).handler(async ({ context, input }) => {
    await saveChatSettings(context.database(), context.viewer.userId, input);
    return input;
  }),
};
