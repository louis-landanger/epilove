import type { ChatMessage, MessageAttachment } from "@epilove/contracts";
import {
  canMessage,
  checkDateProposal,
  checkDateResponse,
  checkMessageChange,
  cleanMessage,
  DATE_STATUSES,
  explainCompatibility,
  isPotentiallyOffensive,
  isReaction,
  isSilent,
  isSticker,
  MESSAGING_RULES,
  pickIcebreakers,
  screenMessage,
} from "@epilove/core";
import { encryptText } from "@epilove/crypto";
import type { Database } from "@epilove/db";
import { listSpots, spotById } from "@epilove/db/repositories/campus-life";
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
  deleteMessageForEveryone,
  editMessageBody,
  insertMessage,
  markRead,
  messagesByIds,
  messagesOf,
  messagesSentSince,
  notifyMessageUpdated,
  notifyRead,
  reactionsOf,
  readMarkers,
  replaceMessageBody,
  type StoredMessage,
  saveChatSettings,
  setReaction,
} from "@epilove/db/repositories/messaging";
import { answerSheets, listActiveQuestions } from "@epilove/db/repositories/questionnaire";
import { personalChannel } from "@epilove/realtime";
import { ORPCError } from "@orpc/server";
import { z } from "zod";
import { os, requireViewer } from "../procedures";
import { optionLabel, questionText } from "../rencontre/compatibility";
import { gifById, giphyEnabled, searchGifs } from "../rencontre/giphy";
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

/** Non-text messages keep a small JSON payload in their encrypted body. */
const payloads = {
  sticker: z.object({ sticker: z.string() }),
  gif: z.object({
    gif: z.object({ url: z.string(), width: z.number(), height: z.number(), title: z.string() }),
  }),
  date: z.object({
    date: z.object({
      spotId: z.string().nullable(),
      place: z.string().nullable(),
      startsAt: z.string(),
      note: z.string(),
      status: z.enum(DATE_STATUSES),
      respondedAt: z.string().nullable().default(null),
    }),
  }),
};

type SpotRow = Awaited<ReturnType<typeof listSpots>>[number];

function parseDate(body: string) {
  try {
    const parsed = payloads.date.safeParse(JSON.parse(body));
    return parsed.success ? parsed.data.date : null;
  } catch {
    return null;
  }
}

function attachmentOf(
  kind: string,
  body: string,
  spots: ReadonlyMap<string, SpotRow>,
): MessageAttachment | null {
  if (kind === "date_proposal") {
    const date = parseDate(body);
    if (!date) {
      return null;
    }
    const spot = date.spotId ? spots.get(date.spotId) : undefined;
    return {
      type: "date",
      // Spot names in French for now: history requests carry no locale.
      spot: spot
        ? { id: spot.id, name: spot.nameFr, latitude: spot.latitude, longitude: spot.longitude }
        : null,
      place: date.place,
      startsAt: date.startsAt,
      note: date.note,
      status: date.status,
    };
  }
  let json: unknown;
  try {
    json = JSON.parse(body);
  } catch {
    return null;
  }
  if (kind === "sticker") {
    const parsed = payloads.sticker.safeParse(json);
    return parsed.success ? { type: "sticker", sticker: parsed.data.sticker } : null;
  }
  if (kind === "gif") {
    const parsed = payloads.gif.safeParse(json);
    return parsed.success ? { type: "gif", ...parsed.data.gif } : null;
  }
  return null;
}

const flagsOf = (moderation: unknown): string[] => {
  const flags = (moderation as { flags?: unknown } | null)?.flags;
  return Array.isArray(flags) ? flags.filter((f): f is string => typeof f === "string") : [];
};

type Conversation = Awaited<ReturnType<typeof requireConversation>>;

/**
 * Stores a message of any kind: anti-spam quota, recent client id (it
 * orders the conversation), encryption, idempotent insert, realtime events.
 */
async function deliverMessage(
  db: Database,
  conversation: Conversation,
  input: {
    id: string;
    kind: "text" | "sticker" | "gif" | "date_proposal";
    plaintext: string;
    replyTo: string | null;
    flags: readonly string[];
    now: Date;
  },
): Promise<ChatMessage> {
  const { match, viewer, other } = conversation;
  const { now } = input;
  if (
    (await messagesSentSince(db, viewer.member.id, new Date(now.getTime() - 60_000))) >=
    MESSAGING_RULES.perMinute
  ) {
    throw new ORPCError("TOO_MANY_REQUESTS", { message: "rate_limited" });
  }
  const idTime = Number.parseInt(input.id.replaceAll("-", "").slice(0, 12), 16);
  if (Math.abs(idTime - now.getTime()) > 5 * 60_000) {
    throw new ORPCError("BAD_REQUEST", { message: "invalid_id" });
  }
  const result = await insertMessage(db, {
    id: input.id,
    matchId: match.id,
    kind: input.kind,
    senderId: viewer.member.id,
    recipientId: other.member.id,
    body: encryptText(messageKeyRing(), input.plaintext),
    replyTo: input.replyTo,
    moderation: input.flags.length > 0 ? { flags: [...input.flags] } : null,
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
  return message;
}

/** A date proposal of this conversation, with its decrypted payload (CHAT-10). */
async function requireDateProposal(db: Database, matchId: string, messageId: string) {
  const [message] = await messagesByIds(db, [messageId]);
  if (!message || message.matchId !== matchId || message.kind !== "date_proposal" || message.deletedAt) {
    throw new ORPCError("NOT_FOUND");
  }
  const date = parseDate(decryptBody(message.bodyEncrypted, message.keyId));
  if (!date) {
    throw new ORPCError("NOT_FOUND");
  }
  return {
    message,
    date,
    proposal: { proposerId: message.senderId, status: date.status, startsAt: new Date(date.startsAt) },
  };
}

async function updateDateStatus(
  db: Database,
  original: Awaited<ReturnType<typeof requireDateProposal>>,
  status: (typeof DATE_STATUSES)[number],
  now: Date,
): Promise<StoredMessage> {
  const updated = await replaceMessageBody(
    db,
    original.message.id,
    encryptText(
      messageKeyRing(),
      JSON.stringify({ date: { ...original.date, status, respondedAt: now.toISOString() } }),
    ),
  );
  if (!updated) {
    throw new ORPCError("NOT_FOUND");
  }
  return updated;
}

/** A message of this conversation that the viewer may still edit or delete (CHAT-08). */
async function requireOwnChange(
  db: Database,
  matchId: string,
  messageId: string,
  viewerId: string,
  now: Date,
  change: "edit" | "delete",
) {
  const [target] = await messagesByIds(db, [messageId]);
  if (!target || target.matchId !== matchId) {
    throw new ORPCError("NOT_FOUND");
  }
  const check = checkMessageChange(
    {
      senderId: target.senderId,
      createdAt: target.createdAt,
      deleted: target.deletedAt !== null,
      kind: target.kind,
    },
    viewerId,
    now,
    change,
  );
  if (!check.ok) {
    throw new ORPCError(check.reason === "not_sender" ? "FORBIDDEN" : "CONFLICT", { message: check.reason });
  }
  return target;
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
  const body = (m: StoredMessage) => (m.deletedAt ? "" : decryptBody(m.bodyEncrypted, m.keyId));
  const text = (m: StoredMessage) => (m.kind === "text" ? body(m) : "");
  const spots = rows.some((m) => m.kind === "date_proposal")
    ? new Map((await listSpots(db)).map((spot) => [spot.id, spot]))
    : new Map<string, SpotRow>();
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
      flagged: m.deletedAt === null && isPotentiallyOffensive(flagsOf(m.moderation)),
      attachment: m.deletedAt || m.kind === "text" ? null : attachmentOf(m.kind, body(m), spots),
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
      nudge: isSilent(match.lastMessageAt ?? match.createdAt, now),
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
    const conversation = await requireConversation(db, context.viewer.userId, input.matchId, now);
    const text = cleanMessage(input.text);
    if (text.length === 0 || text.length > MESSAGING_RULES.maxLength) {
      throw new ORPCError("BAD_REQUEST", { message: "empty_message" });
    }
    const flags = screenMessage(text);
    const message = await deliverMessage(db, conversation, {
      id: input.id,
      kind: "text",
      plaintext: text,
      replyTo: input.replyTo,
      flags,
      now,
    });
    return { message, flags };
  }),

  sendSticker: os.messaging.sendSticker.use(requireViewer).handler(async ({ context, input }) => {
    const db = context.database();
    const now = new Date();
    if (!isSticker(input.sticker)) {
      throw new ORPCError("BAD_REQUEST", { message: "unknown_sticker" });
    }
    const conversation = await requireConversation(db, context.viewer.userId, input.matchId, now);
    const message = await deliverMessage(db, conversation, {
      id: input.id,
      kind: "sticker",
      plaintext: JSON.stringify({ sticker: input.sticker }),
      replyTo: input.replyTo,
      flags: [],
      now,
    });
    return { message };
  }),

  gifs: os.messaging.gifs.use(requireViewer).handler(async ({ input }) => {
    if (!giphyEnabled()) {
      return { enabled: false, gifs: [] };
    }
    const query = input.query.trim();
    try {
      return { enabled: true, gifs: query ? await searchGifs(query) : [] };
    } catch {
      throw new ORPCError("SERVICE_UNAVAILABLE", { message: "gifs_unavailable" });
    }
  }),

  sendGif: os.messaging.sendGif.use(requireViewer).handler(async ({ context, input }) => {
    const db = context.database();
    const now = new Date();
    if (!giphyEnabled()) {
      throw new ORPCError("NOT_FOUND", { message: "gifs_disabled" });
    }
    const conversation = await requireConversation(db, context.viewer.userId, input.matchId, now);
    const gif = await gifById(input.gifId).catch(() => null);
    if (!gif) {
      throw new ORPCError("BAD_REQUEST", { message: "unknown_gif" });
    }
    const message = await deliverMessage(db, conversation, {
      id: input.id,
      kind: "gif",
      plaintext: JSON.stringify({
        gif: { url: gif.url, width: gif.width, height: gif.height, title: gif.title },
      }),
      replyTo: input.replyTo,
      flags: [],
      now,
    });
    return { message };
  }),

  proposeDate: os.messaging.proposeDate.use(requireViewer).handler(async ({ context, input }) => {
    const db = context.database();
    const now = new Date();
    const conversation = await requireConversation(db, context.viewer.userId, input.matchId, now);
    const startsAt = new Date(input.startsAt);
    const place = input.place?.trim() || null;
    const check = checkDateProposal({ startsAt, spotId: input.spotId, place }, now);
    if (!check.ok) {
      throw new ORPCError("BAD_REQUEST", { message: check.reason });
    }
    if (input.spotId && !(await spotById(db, input.spotId))?.active) {
      throw new ORPCError("BAD_REQUEST", { message: "unknown_spot" });
    }
    const note = cleanMessage(input.note);
    if (input.counterTo) {
      // "Proposer autre chose": the answered proposal becomes "countered".
      const original = await requireDateProposal(db, conversation.match.id, input.counterTo);
      const response = checkDateResponse(original.proposal, conversation.viewer.member.id, now);
      if (!response.ok) {
        throw new ORPCError("CONFLICT", { message: response.reason });
      }
      await updateDateStatus(db, original, "countered", now);
      await notifyMessageUpdated(
        db,
        [conversation.viewer.member.id, conversation.other.member.id],
        conversation.match.id,
        original.message.id,
      );
    }
    const message = await deliverMessage(db, conversation, {
      id: input.id,
      kind: "date_proposal",
      plaintext: JSON.stringify({
        date: {
          spotId: input.spotId,
          place,
          startsAt: startsAt.toISOString(),
          note,
          status: "proposed",
          respondedAt: null,
        },
      }),
      replyTo: input.counterTo,
      flags: note ? screenMessage(note) : [],
      now,
    });
    return { message };
  }),

  respondDate: os.messaging.respondDate.use(requireViewer).handler(async ({ context, input }) => {
    const db = context.database();
    const now = new Date();
    const { match, viewer, other } = await requireConversation(db, context.viewer.userId, input.matchId, now);
    const original = await requireDateProposal(db, match.id, input.messageId);
    const response = checkDateResponse(original.proposal, viewer.member.id, now);
    if (!response.ok) {
      throw new ORPCError("CONFLICT", { message: response.reason });
    }
    const updated = await updateDateStatus(
      db,
      original,
      input.response === "accept" ? "accepted" : "declined",
      now,
    );
    await notifyMessageUpdated(db, [viewer.member.id, other.member.id], match.id, original.message.id);
    const [message] = await toChatMessages(db, [updated]);
    if (!message) {
      throw new ORPCError("INTERNAL_SERVER_ERROR");
    }
    return { message };
  }),

  edit: os.messaging.edit.use(requireViewer).handler(async ({ context, input }) => {
    const db = context.database();
    const now = new Date();
    const { match, viewer, other } = await requireConversation(db, context.viewer.userId, input.matchId, now);
    const target = await requireOwnChange(db, match.id, input.messageId, viewer.member.id, now, "edit");
    const text = cleanMessage(input.text);
    if (text.length === 0 || text.length > MESSAGING_RULES.maxLength) {
      throw new ORPCError("BAD_REQUEST", { message: "empty_message" });
    }
    const flags = screenMessage(text);
    const updated = await editMessageBody(db, {
      id: target.id,
      senderId: viewer.member.id,
      body: encryptText(messageKeyRing(), text),
      moderation: flags.length > 0 ? { flags } : null,
      now,
      windowMinutes: MESSAGING_RULES.deleteWindowMinutes,
    });
    if (!updated) {
      throw new ORPCError("CONFLICT", { message: "too_late" });
    }
    await notifyMessageUpdated(db, [viewer.member.id, other.member.id], match.id, updated.id);
    const [message] = await toChatMessages(db, [updated]);
    if (!message) {
      throw new ORPCError("INTERNAL_SERVER_ERROR");
    }
    return { message, flags };
  }),

  remove: os.messaging.remove.use(requireViewer).handler(async ({ context, input }) => {
    const db = context.database();
    const now = new Date();
    const { match, viewer, other } = await requireConversation(db, context.viewer.userId, input.matchId, now);
    const target = await requireOwnChange(db, match.id, input.messageId, viewer.member.id, now, "delete");
    const deleted = await deleteMessageForEveryone(db, {
      id: target.id,
      senderId: viewer.member.id,
      now,
      windowMinutes: MESSAGING_RULES.deleteWindowMinutes,
    });
    if (!deleted) {
      throw new ORPCError("CONFLICT", { message: "too_late" });
    }
    await notifyMessageUpdated(db, [viewer.member.id, other.member.id], match.id, deleted.id);
    const [message] = await toChatMessages(db, [deleted]);
    if (!message) {
      throw new ORPCError("INTERNAL_SERVER_ERROR");
    }
    return { message };
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
