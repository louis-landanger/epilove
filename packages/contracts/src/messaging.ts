import { MODES } from "@epilove/core";
import { oc } from "@orpc/contract";
import { z } from "zod";
import { availabilityView } from "./matches";
import { contentLocale } from "./questionnaire";

const UUIDV7 = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

/** What a non-text message carries (CHAT-05 to CHAT-10). */
export const messageAttachment = z.discriminatedUnion("type", [
  z.object({ type: z.literal("sticker"), sticker: z.string() }),
  z.object({
    type: z.literal("gif"),
    url: z.string(),
    width: z.number().int(),
    height: z.number().int(),
    title: z.string(),
  }),
  z.object({
    type: z.literal("image"),
    /** Signed and expiring; null for a view-once photo (opened through `viewMedia`). */
    url: z.string().nullable(),
    width: z.number().int(),
    height: z.number().int(),
    viewOnce: z.boolean(),
    viewed: z.boolean(),
    /** Flagged by the image classifier (SAF-11): blurred until the recipient chooses to see it. */
    explicit: z.boolean(),
  }),
  z.object({
    type: z.literal("voice"),
    url: z.string().nullable(),
    durationMs: z.number().int(),
    /** Up to 64 bars between 0 and 1. */
    waveform: z.array(z.number()),
  }),
  z.object({
    type: z.literal("date"),
    spot: z
      .object({ id: z.uuid(), name: z.string(), latitude: z.number(), longitude: z.number() })
      .nullable(),
    place: z.string().nullable(),
    startsAt: z.iso.datetime(),
    note: z.string(),
    status: z.enum(["proposed", "accepted", "declined", "countered"]),
  }),
]);
export type MessageAttachment = z.infer<typeof messageAttachment>;

export const gifResult = z.object({
  id: z.string(),
  url: z.string(),
  width: z.number().int(),
  height: z.number().int(),
  title: z.string(),
});

export const chatMessage = z.object({
  id: z.uuid(),
  senderId: z.uuid().nullable(),
  kind: z.string(),
  /** Decrypted for the two members only. Empty once deleted. */
  text: z.string(),
  replyTo: z.object({ id: z.uuid(), senderId: z.uuid().nullable(), text: z.string() }).nullable(),
  reactions: z.array(z.object({ userId: z.uuid(), emoji: z.string() })),
  createdAt: z.iso.datetime(),
  editedAt: z.iso.datetime().nullable(),
  deleted: z.boolean(),
  /** Detected as potentially offensive (SAF-10): the recipient is offered a one-tap report. */
  flagged: z.boolean(),
  attachment: messageAttachment.nullable(),
});
export type ChatMessage = z.infer<typeof chatMessage>;

export const icebreaker = z.object({
  key: z.enum(["sharedInterest", "theirPrompt", "sharedAnswer", "campus"]),
  params: z.record(z.string(), z.union([z.string(), z.number()])),
});
export type IcebreakerView = z.infer<typeof icebreaker>;

export const chatSettings = z.object({ readReceipts: z.boolean(), onlineStatus: z.boolean() });

export const threadView = z.object({
  matchId: z.uuid(),
  mode: z.enum(MODES),
  createdAt: z.iso.datetime(),
  me: z.uuid(),
  other: z.object({
    userId: z.uuid(),
    firstName: z.string(),
    photoUrl: z.string().nullable(),
    school: z.object({ slug: z.string(), name: z.string() }),
  }),
  /** False once the match is closed (unmatch, block, ban): the history stays readable, writing does not. */
  canMessage: z.boolean(),
  /** Only when both members share read receipts (CHAT-02, reciprocal setting). */
  otherLastReadId: z.uuid().nullable(),
  /** Only when both members share their online status, and only between matches. */
  otherOnline: z.boolean().nullable(),
  /** The other member's "Dispo" status (IRL-05), while it lasts. */
  otherAvailable: availabilityView.nullable(),
  /** A blind match not revealed yet (DEC-10): messages sent by each, out of `needed`. */
  blind: z.object({ mine: z.number().int(), theirs: z.number().int(), needed: z.number().int() }).nullable(),
  icebreakers: z.array(icebreaker),
  /** Silent for a few days (CHAT-09): the screen suggests restarting with an icebreaker. */
  nudge: z.boolean(),
  messages: z.array(chatMessage),
  hasMore: z.boolean(),
});
export type ThreadView = z.infer<typeof threadView>;

export const messagingContract = {
  /** A conversation with its latest messages (CHAT-02) and starters (CHAT-03). */
  thread: oc.input(z.object({ matchId: z.uuid(), locale: contentLocale })).output(threadView),
  /** Older messages (`before`) or messages missed during a disconnection (`after`). */
  history: oc
    .input(
      z.object({
        matchId: z.uuid(),
        before: z.uuid().optional(),
        after: z.uuid().optional(),
        limit: z.number().int().min(1).max(100).default(40),
      }),
    )
    .output(z.object({ messages: z.array(chatMessage), hasMore: z.boolean() })),
  /** Sends a text message. The client generates the UUIDv7 id: retries are idempotent. */
  send: oc
    .input(
      z.object({
        id: z.string().regex(UUIDV7),
        matchId: z.uuid(),
        text: z.string().min(1).max(2000),
        replyTo: z.uuid().nullable().default(null),
      }),
    )
    .output(z.object({ message: chatMessage, flags: z.array(z.string()) })),
  /** Sends a house sticker (CHAT-05). Idempotent like `send`. */
  sendSticker: oc
    .input(
      z.object({
        id: z.string().regex(UUIDV7),
        matchId: z.uuid(),
        sticker: z.string().max(40),
        replyTo: z.uuid().nullable().default(null),
      }),
    )
    .output(z.object({ message: chatMessage })),
  /**
   * GIF search through GIPHY (CHAT-05), off unless the server has a GIPHY
   * key. Only the search terms are sent to GIPHY, never who is searching.
   */
  gifs: oc
    .input(z.object({ query: z.string().max(50) }))
    .output(z.object({ enabled: z.boolean(), gifs: z.array(gifResult) })),
  sendGif: oc
    .input(
      z.object({
        id: z.string().regex(UUIDV7),
        matchId: z.uuid(),
        gifId: z.string().regex(/^[A-Za-z0-9]{1,64}$/),
        replyTo: z.uuid().nullable().default(null),
      }),
    )
    .output(z.object({ message: chatMessage })),
  /**
   * Proposes a date (CHAT-10): a Spot or a free place, a time, a word.
   * `counterTo` answers another proposal with a new one ("autre chose").
   */
  proposeDate: oc
    .input(
      z.object({
        id: z.string().regex(UUIDV7),
        matchId: z.uuid(),
        spotId: z.uuid().nullable(),
        place: z.string().max(120).nullable(),
        startsAt: z.iso.datetime(),
        note: z.string().max(200).default(""),
        counterTo: z.uuid().nullable().default(null),
      }),
    )
    .output(z.object({ message: chatMessage })),
  /** Accepts or declines the other member's proposal (CHAT-10). */
  respondDate: oc
    .input(z.object({ matchId: z.uuid(), messageId: z.uuid(), response: z.enum(["accept", "decline"]) }))
    .output(z.object({ message: chatMessage })),
  /**
   * Sends a photo (CHAT-06): JPEG, PNG or WebP up to 8 MB, metadata removed
   * before storage, optionally view-once.
   */
  sendImage: oc
    .input(
      z.object({
        id: z.string().regex(UUIDV7),
        matchId: z.uuid(),
        file: z.file().max(8_000_000),
        width: z.number().int().min(1).max(10_000),
        height: z.number().int().min(1).max(10_000),
        viewOnce: z.boolean().default(false),
        replyTo: z.uuid().nullable().default(null),
      }),
    )
    .output(z.object({ message: chatMessage })),
  /** Sends a voice message (CHAT-07): up to 2 minutes, with its waveform. */
  sendVoice: oc
    .input(
      z.object({
        id: z.string().regex(UUIDV7),
        matchId: z.uuid(),
        file: z.file().max(2_500_000),
        durationMs: z.number().int().min(300).max(120_000),
        waveform: z.array(z.number().min(0).max(1)).max(64),
        replyTo: z.uuid().nullable().default(null),
      }),
    )
    .output(z.object({ message: chatMessage })),
  /** Opens a view-once photo, once, for the recipient: a URL valid for one minute. */
  viewMedia: oc
    .input(z.object({ matchId: z.uuid(), messageId: z.uuid() }))
    .output(z.object({ url: z.string(), expiresAt: z.iso.datetime() })),
  /** Edits one's own text message within 10 minutes (CHAT-08); shown as "modifié". */
  edit: oc
    .input(z.object({ matchId: z.uuid(), messageId: z.uuid(), text: z.string().min(1).max(2000) }))
    .output(z.object({ message: chatMessage, flags: z.array(z.string()) })),
  /** Deletes one's own message for everyone within 10 minutes (CHAT-08). */
  remove: oc
    .input(z.object({ matchId: z.uuid(), messageId: z.uuid() }))
    .output(z.object({ message: chatMessage })),
  /** Moves the read marker forward. */
  read: oc
    .input(z.object({ matchId: z.uuid(), messageId: z.uuid() }))
    .output(z.object({ ok: z.literal(true) })),
  /** Sets (or removes, with null) the viewer's reaction on a message. */
  react: oc
    .input(z.object({ matchId: z.uuid(), messageId: z.uuid(), emoji: z.string().max(8).nullable() }))
    .output(z.object({ ok: z.literal(true) })),
  /** "is typing…" indicator, relayed to the other member only. Rate-limited by the client. */
  typing: oc.input(z.object({ matchId: z.uuid() })).output(z.object({ ok: z.literal(true) })),
  settings: oc.output(chatSettings),
  saveSettings: oc.input(chatSettings).output(chatSettings),
};
