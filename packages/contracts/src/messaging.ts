import { MODES } from "@epilove/core";
import { oc } from "@orpc/contract";
import { z } from "zod";
import { contentLocale } from "./questionnaire";

const UUIDV7 = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

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
  icebreakers: z.array(icebreaker),
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
