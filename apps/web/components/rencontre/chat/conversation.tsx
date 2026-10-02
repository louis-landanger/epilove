"use client";

import type { ChatMessage, IcebreakerView, ThreadView } from "@epilove/contracts";
import { MESSAGING_RULES, needsSendWarning, type StickerId, screenMessage, uuidv7 } from "@epilove/core";
import { ORPCError } from "@orpc/client";
import { AnimatePresence, motion } from "motion/react";
import { useRouter } from "next/navigation";
import { useFormatter, useTranslations } from "next-intl";
import { Fragment, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { api } from "@/lib/rencontre/api.client";
import { useConnectionState, useRealtime } from "@/lib/rencontre/realtime";
import { dequeueMessage, queuedMessages, queueMessage } from "@/lib/rencontre/send-queue";
import { useOnline } from "@/lib/rencontre/use-online";
import { ReportSheet, SafetyMenu } from "../safety/safety-menu";
import { Sheet } from "../ui/sheet";
import { Avatar } from "./avatar";
import { DateCard } from "./date-card";
import { type DateDraft, DateSheet } from "./date-sheet";
import {
  ImageBubble,
  MAX_VOICE_MS,
  PhotoSheet,
  type PreparedPhoto,
  preparePhoto,
  type RecordedVoice,
  useVoiceRecorder,
  VoiceComposer,
  VoicePlayer,
} from "./media";
import { type PickedGif, StickerPicker } from "./sticker-picker";
import { StickerArt } from "./stickers";

type PendingStatus = "sending" | "queued" | "failed";
interface PendingMessage {
  readonly id: string;
  readonly text: string;
  readonly replyTo: string | null;
  readonly createdAt: string;
  readonly status: PendingStatus;
}

const TYPING_THROTTLE_MS = 3000;
const TYPING_DISPLAY_MS = 5000;

function mergeMessages(current: readonly ChatMessage[], incoming: readonly ChatMessage[]): ChatMessage[] {
  const byId = new Map(current.map((m) => [m.id, m]));
  for (const message of incoming) {
    byId.set(message.id, message);
  }
  return [...byId.values()].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

const newMessageId = () => uuidv7(Date.now(), crypto.getRandomValues(new Uint8Array(10)));

/**
 * A conversation (CHAT-02, moment signature #6): optimistic sending with
 * client ids, offline queue, catch-up after reconnection, read receipts,
 * typing indicator, replies, reactions and icebreakers (CHAT-03).
 */
export function Conversation({ thread }: { thread: ThreadView }) {
  const t = useTranslations("chat");
  const router = useRouter();
  const online = useOnline();
  const connection = useConnectionState();
  const [messages, setMessages] = useState(thread.messages);
  const [pending, setPending] = useState<PendingMessage[]>([]);
  const [hasMore, setHasMore] = useState(thread.hasMore);
  const [otherLastReadId, setOtherLastReadId] = useState(thread.otherLastReadId);
  const [typingUntil, setTypingUntil] = useState(0);
  const [closed, setClosed] = useState(!thread.canMessage);
  const [replyTo, setReplyTo] = useState<ChatMessage | null>(null);
  const [draft, setDraft] = useState("");
  const [notice, setNotice] = useState<string | null>(null);
  const [showIcebreakers, setShowIcebreakers] = useState(thread.messages.length === 0);
  const [reporting, setReporting] = useState<string | null>(null);
  const [editing, setEditing] = useState<ChatMessage | null>(null);
  /** A message waiting for "send anyway" (SAF-09). */
  const [warning, setWarning] = useState<string | null>(null);
  /** Date proposal sheet (CHAT-10), possibly answering another proposal. */
  const [dateSheet, setDateSheet] = useState<{ counterTo: string | null } | null>(null);
  /** A photo waiting in its preview (CHAT-06), and the upload in progress. */
  const [photo, setPhoto] = useState<PreparedPhoto | null>(null);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const [mediaBusy, setMediaBusy] = useState(false);
  /** Kept across retries of the same upload, so that it stays idempotent. */
  const mediaId = useRef<string | null>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const nearBottom = useRef(true);
  const lastTyping = useRef(0);
  const lastMarked = useRef<string | null>(null);
  const composer = useRef<HTMLTextAreaElement>(null);
  const me = thread.me;

  const say = useCallback((message: string) => {
    setNotice(message);
    window.setTimeout(() => setNotice((current) => (current === message ? null : current)), 5000);
  }, []);

  const lastConfirmedId = messages.at(-1)?.id;

  const catchUp = useCallback(async () => {
    try {
      const page = lastConfirmedId
        ? await api.messaging.history({ matchId: thread.matchId, after: lastConfirmedId, limit: 100 })
        : await api.messaging.history({ matchId: thread.matchId, limit: 40 });
      setMessages((current) => mergeMessages(current, page.messages));
      setPending((current) => current.filter((p) => !page.messages.some((m) => m.id === p.id)));
    } catch (error) {
      if (error instanceof ORPCError && error.code === "NOT_FOUND") {
        setClosed(true);
      }
    }
  }, [lastConfirmedId, thread.matchId]);

  const refreshRecent = useCallback(async () => {
    try {
      const page = await api.messaging.history({ matchId: thread.matchId, limit: 40 });
      setMessages((current) => mergeMessages(current, page.messages));
    } catch {
      // Reactions will show up on the next refresh.
    }
  }, [thread.matchId]);

  useRealtime((signal) => {
    if (signal.type === "resync") {
      void catchUp();
      return;
    }
    if (!("matchId" in signal) || signal.matchId !== thread.matchId) {
      return;
    }
    switch (signal.type) {
      case "message.created":
        void catchUp();
        setTypingUntil(0);
        break;
      case "message.updated":
        void refreshRecent();
        break;
      case "message.read":
        setOtherLastReadId((current) =>
          current && current > signal.lastReadMessageId ? current : signal.lastReadMessageId,
        );
        break;
      case "typing":
        setTypingUntil(Date.now() + TYPING_DISPLAY_MS);
        break;
      case "match.closed":
        setClosed(true);
        break;
    }
  });

  // Typing indicator expiry.
  const typing = typingUntil > Date.now();
  useEffect(() => {
    if (!typing) {
      return;
    }
    const timeout = window.setTimeout(() => setTypingUntil(0), typingUntil - Date.now());
    return () => window.clearTimeout(timeout);
  }, [typing, typingUntil]);

  const deliver = useCallback(
    async (message: PendingMessage) => {
      setPending((current) => current.map((p) => (p.id === message.id ? { ...p, status: "sending" } : p)));
      try {
        const result = await api.messaging.send({
          id: message.id,
          matchId: thread.matchId,
          text: message.text,
          replyTo: message.replyTo,
        });
        await dequeueMessage(message.id);
        setMessages((current) => mergeMessages(current, [result.message]));
        setPending((current) => current.filter((p) => p.id !== message.id));
        if (result.flags.includes("contact_handle")) {
          say(t("flags.contact_handle"));
        }
      } catch (error) {
        if (error instanceof ORPCError) {
          // The server answered: retrying the same content would fail again.
          await dequeueMessage(message.id);
          setPending((current) => current.map((p) => (p.id === message.id ? { ...p, status: "failed" } : p)));
          if (error.code === "NOT_FOUND") {
            setClosed(true);
          } else {
            say(error.message === "rate_limited" ? t("errors.rate_limited") : t("errors.generic"));
          }
        } else {
          // Network failure: keep it queued, it leaves when the connection is back.
          setPending((current) => current.map((p) => (p.id === message.id ? { ...p, status: "queued" } : p)));
        }
      }
    },
    [thread.matchId, say, t],
  );

  // Messages written offline (this session or a previous one) leave as soon as possible.
  const flushQueue = useCallback(async () => {
    const queued = await queuedMessages(thread.matchId).catch(() => []);
    if (queued.length === 0) {
      return;
    }
    setPending((current) => {
      const known = new Set(current.map((p) => p.id));
      return [
        ...current,
        ...queued.filter((q) => !known.has(q.id)).map((q) => ({ ...q, status: "queued" as const })),
      ];
    });
    if (navigator.onLine) {
      for (const message of queued) {
        await deliver({ ...message, status: "queued" });
      }
    }
  }, [thread.matchId, deliver]);

  useEffect(() => {
    void flushQueue();
  }, [flushQueue]);
  // Only when the network or the realtime connection comes back (refs avoid re-running on every message).
  const recover = useRef({ flushQueue, catchUp });
  recover.current = { flushQueue, catchUp };
  useEffect(() => {
    if (online && connection === "connected") {
      void recover.current.flushQueue();
      void recover.current.catchUp();
    }
  }, [online, connection]);

  const saveEdit = async (target: ChatMessage, text: string) => {
    try {
      const result = await api.messaging.edit({ matchId: thread.matchId, messageId: target.id, text });
      setMessages((current) => mergeMessages(current, [result.message]));
      setEditing(null);
      setDraft("");
    } catch (error) {
      say(
        error instanceof ORPCError && error.message === "too_late"
          ? t("errors.too_late")
          : t("errors.generic"),
      );
      setEditing(null);
      setDraft("");
    }
  };

  const removeForEveryone = async (target: ChatMessage) => {
    try {
      const result = await api.messaging.remove({ matchId: thread.matchId, messageId: target.id });
      setMessages((current) => mergeMessages(current, [result.message]));
    } catch (error) {
      say(
        error instanceof ORPCError && error.message === "too_late"
          ? t("errors.too_late")
          : t("errors.generic"),
      );
    }
  };

  const sendAttachment = async (
    attachment: { type: "sticker"; sticker: StickerId } | { type: "gif"; gif: PickedGif },
  ) => {
    if (closed) {
      return;
    }
    const base = { id: newMessageId(), matchId: thread.matchId, replyTo: replyTo?.id ?? null };
    setReplyTo(null);
    nearBottom.current = true;
    try {
      const result =
        attachment.type === "sticker"
          ? await api.messaging.sendSticker({ ...base, sticker: attachment.sticker })
          : await api.messaging.sendGif({ ...base, gifId: attachment.gif.id });
      setMessages((current) => mergeMessages(current, [result.message]));
    } catch (error) {
      say(
        error instanceof ORPCError && error.message === "rate_limited"
          ? t("errors.rate_limited")
          : t("errors.generic"),
      );
    }
  };

  const mediaError = (error: unknown) => {
    if (error instanceof ORPCError) {
      if (error.message === "rate_limited") {
        return t("errors.rate_limited");
      }
      if (error.message === "unsupported_media" || error.message === "already_viewed") {
        return t(`media.errors.${error.message}`);
      }
      if (error.code === "NOT_FOUND") {
        setClosed(true);
      }
    }
    return t("errors.generic");
  };

  const pickPhoto = async (file: File) => {
    try {
      mediaId.current = null;
      setPhotoError(null);
      setPhoto(await preparePhoto(file));
    } catch {
      say(t("media.errors.unsupported_media"));
    }
  };

  const closePhoto = () => {
    if (photo) {
      URL.revokeObjectURL(photo.previewUrl);
    }
    setPhoto(null);
    mediaId.current = null;
  };

  const sendPhoto = async (viewOnce: boolean) => {
    if (!photo || closed) {
      return;
    }
    mediaId.current ??= newMessageId();
    setMediaBusy(true);
    setPhotoError(null);
    try {
      const result = await api.messaging.sendImage({
        id: mediaId.current,
        matchId: thread.matchId,
        file: photo.file,
        width: photo.width,
        height: photo.height,
        viewOnce,
        replyTo: replyTo?.id ?? null,
      });
      nearBottom.current = true;
      setReplyTo(null);
      setShowIcebreakers(false);
      setMessages((current) => mergeMessages(current, [result.message]));
      closePhoto();
    } catch (error) {
      setPhotoError(mediaError(error));
    } finally {
      setMediaBusy(false);
    }
  };

  const sendVoice = async (voice: RecordedVoice) => {
    if (closed) {
      return false;
    }
    mediaId.current ??= newMessageId();
    setMediaBusy(true);
    try {
      const result = await api.messaging.sendVoice({
        id: mediaId.current,
        matchId: thread.matchId,
        file: voice.file,
        durationMs: Math.min(MAX_VOICE_MS, Math.max(300, Math.round(voice.durationMs))),
        waveform: voice.waveform,
        replyTo: replyTo?.id ?? null,
      });
      mediaId.current = null;
      nearBottom.current = true;
      setReplyTo(null);
      setShowIcebreakers(false);
      setMessages((current) => mergeMessages(current, [result.message]));
      return true;
    } catch (error) {
      say(mediaError(error));
      return false;
    } finally {
      setMediaBusy(false);
    }
  };

  /** Opens a view-once photo, once (CHAT-06): a link valid for a minute. */
  const openViewOnce = async (target: ChatMessage) => {
    try {
      const result = await api.messaging.viewMedia({ matchId: thread.matchId, messageId: target.id });
      return result.url;
    } catch (error) {
      say(mediaError(error));
      void refreshRecent();
      return null;
    }
  };

  const proposeDate = async (draft: DateDraft) => {
    const result = await api.messaging.proposeDate({
      id: newMessageId(),
      matchId: thread.matchId,
      ...draft,
      counterTo: dateSheet?.counterTo ?? null,
    });
    nearBottom.current = true;
    setMessages((current) => mergeMessages(current, [result.message]));
    setDateSheet(null);
    void catchUp();
  };

  const respondDate = async (target: ChatMessage, response: "accept" | "decline") => {
    try {
      const result = await api.messaging.respondDate({
        matchId: thread.matchId,
        messageId: target.id,
        response,
      });
      setMessages((current) => mergeMessages(current, [result.message]));
    } catch {
      say(t("errors.generic"));
    }
  };

  const send = async (text: string, confirmed = false) => {
    const clean = text.trim();
    if (!clean || closed) {
      return;
    }
    // "Tu es sûr·e de vouloir envoyer ça ?" (SAF-09): asked once, never blocking.
    if (!confirmed && needsSendWarning(screenMessage(clean))) {
      setWarning(clean);
      return;
    }
    if (editing) {
      await saveEdit(editing, clean);
      return;
    }
    const message: PendingMessage = {
      id: newMessageId(),
      text: clean.slice(0, MESSAGING_RULES.maxLength),
      replyTo: replyTo?.id ?? null,
      createdAt: new Date().toISOString(),
      status: online ? "sending" : "queued",
    };
    setDraft("");
    setReplyTo(null);
    setShowIcebreakers(false);
    nearBottom.current = true;
    setPending((current) => [...current, message]);
    await queueMessage({ ...message, matchId: thread.matchId }).catch(() => undefined);
    if (online) {
      await deliver(message);
    }
  };

  // Read receipts: mark the latest message from the other member as read while the tab is visible.
  useEffect(() => {
    const latestFromOther = [...messages].reverse().find((m) => m.senderId !== me)?.id;
    if (
      !latestFromOther ||
      latestFromOther === lastMarked.current ||
      document.visibilityState !== "visible"
    ) {
      return;
    }
    lastMarked.current = latestFromOther;
    void api.messaging.read({ matchId: thread.matchId, messageId: latestFromOther }).catch(() => undefined);
  }, [messages, me, thread.matchId]);

  const onDraftChange = (value: string) => {
    setDraft(value);
    const now = Date.now();
    if (value && now - lastTyping.current > TYPING_THROTTLE_MS && !closed) {
      lastTyping.current = now;
      void api.messaging.typing({ matchId: thread.matchId }).catch(() => undefined);
    }
  };

  const react = async (message: ChatMessage, emoji: string) => {
    const mine = message.reactions.find((r) => r.userId === me);
    const next = mine?.emoji === emoji ? null : emoji;
    setMessages((current) =>
      current.map((m) =>
        m.id === message.id
          ? {
              ...m,
              reactions: [
                ...m.reactions.filter((r) => r.userId !== me),
                ...(next ? [{ userId: me, emoji: next }] : []),
              ],
            }
          : m,
      ),
    );
    try {
      await api.messaging.react({ matchId: thread.matchId, messageId: message.id, emoji: next });
    } catch {
      void refreshRecent();
    }
  };

  const loadOlder = useCallback(async () => {
    const first = messages[0];
    if (!first || !hasMore) {
      return;
    }
    const element = scroller.current;
    const previousHeight = element?.scrollHeight ?? 0;
    const page = await api.messaging.history({ matchId: thread.matchId, before: first.id, limit: 40 });
    setHasMore(page.hasMore);
    nearBottom.current = false;
    setMessages((current) => mergeMessages(current, page.messages));
    requestAnimationFrame(() => {
      if (element) {
        element.scrollTop += element.scrollHeight - previousHeight;
      }
    });
  }, [messages, hasMore, thread.matchId]);

  // Stick to the bottom when new messages arrive, unless the member scrolled up to read.
  // biome-ignore lint/correctness/useExhaustiveDependencies: scroll whenever the content changes.
  useLayoutEffect(() => {
    const element = scroller.current;
    if (element && nearBottom.current) {
      element.scrollTop = element.scrollHeight;
    }
  }, [messages, pending, typing]);

  const items = useMemo(
    () => [
      ...messages.map((m) => ({ kind: "sent" as const, message: m })),
      ...pending
        .filter((p) => !messages.some((m) => m.id === p.id))
        .map((p) => ({ kind: "pending" as const, pending: p })),
    ],
    [messages, pending],
  );
  const byId = useMemo(() => new Map(messages.map((m) => [m.id, m])), [messages]);
  const lastMine = [...messages].reverse().find((m) => m.senderId === me);

  return (
    <section aria-labelledby="conversation-title" className="flex h-dvh min-w-0 flex-1 flex-col">
      <header className="flex items-center gap-3 border-paper/10 border-b px-4 py-3">
        <a href="/messages" className="grid size-10 place-items-center rounded-full lg:hidden">
          <span className="sr-only">{t("back")}</span>
          <svg
            viewBox="0 0 24 24"
            className="size-5"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            aria-hidden="true"
          >
            <path d="M15 18 9 12l6-6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </a>
        <a
          href={`/membres/${thread.other.userId}`}
          className="flex min-w-0 items-center gap-3"
          aria-label={t("openProfile", { name: thread.other.firstName })}
        >
          <Avatar
            photoUrl={thread.other.photoUrl}
            schoolSlug={thread.other.school.slug}
            size="sm"
            online={thread.otherOnline === true}
          />
          <span className="flex min-w-0 flex-col">
            <span id="conversation-title" className="truncate font-semibold">
              {thread.other.firstName}
            </span>
            {thread.otherOnline && <span className="text-volt text-xs">{t("online")}</span>}
          </span>
        </a>
        <div className="ml-auto">
          <SafetyMenu
            userId={thread.other.userId}
            name={thread.other.firstName}
            matchId={thread.matchId}
            context="profile"
            onDone={(action) => {
              if (action !== "reported") {
                router.replace("/messages");
              }
            }}
          />
        </div>
      </header>

      {(!online || connection === "disconnected") && (
        <p role="status" className="bg-plasma/15 px-4 py-2 text-center text-sm">
          {online ? t("reconnecting") : t("offline")}
        </p>
      )}

      <div
        ref={scroller}
        onScroll={(event) => {
          const element = event.currentTarget;
          nearBottom.current = element.scrollHeight - element.scrollTop - element.clientHeight < 120;
        }}
        className="flex-1 overflow-y-auto px-4 py-4"
      >
        {hasMore && (
          <div className="mb-4 flex justify-center">
            <button
              type="button"
              onClick={loadOlder}
              className="rounded-full border border-paper/15 px-4 py-2 text-sm"
            >
              {t("loadOlder")}
            </button>
          </div>
        )}
        {!hasMore && <MatchHeader thread={thread} />}

        <ol aria-label={t("title")} className="flex flex-col gap-1.5">
          {items.map((item, index) => {
            const createdAt = item.kind === "sent" ? item.message.createdAt : item.pending.createdAt;
            const previous = items[index - 1];
            const previousDate =
              previous &&
              (previous.kind === "sent" ? previous.message.createdAt : previous.pending.createdAt);
            const newDay = !previousDate || previousDate.slice(0, 10) !== createdAt.slice(0, 10);
            return (
              <Fragment key={item.kind === "sent" ? item.message.id : item.pending.id}>
                {newDay && <DaySeparator iso={createdAt} />}
                {item.kind === "sent" ? (
                  <Bubble
                    message={item.message}
                    mine={item.message.senderId === me}
                    me={me}
                    reply={item.message.replyTo}
                    seen={
                      item.message.id === lastMine?.id &&
                      otherLastReadId !== null &&
                      otherLastReadId >= item.message.id
                    }
                    onReply={() => {
                      setReplyTo(item.message);
                      composer.current?.focus();
                    }}
                    onReact={(emoji) => react(item.message, emoji)}
                    onReport={() => setReporting(item.message.id)}
                    changeable={
                      item.message.senderId === me &&
                      !item.message.deleted &&
                      Date.now() - Date.parse(item.message.createdAt) <
                        MESSAGING_RULES.deleteWindowMinutes * 60_000
                    }
                    onEdit={() => {
                      setReplyTo(null);
                      setEditing(item.message);
                      setDraft(item.message.text);
                      composer.current?.focus();
                    }}
                    onDelete={() => void removeForEveryone(item.message)}
                    onRespondDate={(response) => void respondDate(item.message, response)}
                    onCounterDate={() => setDateSheet({ counterTo: item.message.id })}
                    onOpenMedia={() => openViewOnce(item.message)}
                  />
                ) : (
                  <PendingBubble
                    pending={item.pending}
                    reply={item.pending.replyTo ? (byId.get(item.pending.replyTo) ?? null) : null}
                    onRetry={() => deliver(item.pending)}
                  />
                )}
              </Fragment>
            );
          })}
        </ol>
        <AnimatePresence>
          {typing && (
            <motion.div
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="mt-2"
            >
              <TypingIndicator label={t("typing", { name: thread.other.firstName })} />
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <div aria-live="polite" className="px-4">
        {notice && <p className="mb-2 rounded-2xl bg-paper/10 px-4 py-2 text-sm">{notice}</p>}
      </div>

      <ReportSheet
        open={reporting !== null}
        userId={thread.other.userId}
        name={thread.other.firstName}
        context="message"
        contextRef={reporting ?? undefined}
        onClose={() => setReporting(null)}
        onDone={() => {
          setReporting(null);
          say(t("reported"));
        }}
      />

      <PhotoSheet
        photo={photo}
        name={thread.other.firstName}
        busy={mediaBusy}
        error={photoError}
        onCancel={closePhoto}
        onSend={(viewOnce) => void sendPhoto(viewOnce)}
      />

      <DateSheet
        open={dateSheet !== null}
        counter={dateSheet?.counterTo != null}
        onClose={() => setDateSheet(null)}
        onSubmit={proposeDate}
      />

      <Sheet open={warning !== null} onClose={() => setWarning(null)} labelledBy="send-warning">
        <h2 id="send-warning" className="font-display font-semibold text-xl">
          {t("warning.title")}
        </h2>
        <p className="text-paper/75">{t("warning.lead")}</p>
        <div className="flex flex-wrap gap-3">
          {/* The native dialog focuses this first button: rephrasing is the default. */}
          <button
            type="button"
            onClick={() => {
              setWarning(null);
              composer.current?.focus();
            }}
            className="rounded-full bg-paper px-5 py-3 font-semibold text-ink"
          >
            {t("warning.edit")}
          </button>
          <button
            type="button"
            onClick={() => {
              const text = warning ?? "";
              setWarning(null);
              void send(text, true);
            }}
            className="rounded-full border border-paper/25 px-5 py-3 font-semibold"
          >
            {t("warning.sendAnyway")}
          </button>
        </div>
      </Sheet>

      {!closed &&
        thread.nudge &&
        !showIcebreakers &&
        messages.length > 0 &&
        messages.at(-1)?.id === thread.messages.at(-1)?.id && (
          <div className="mx-4 mb-2 flex flex-wrap items-center gap-2 rounded-2xl bg-volt/10 px-4 py-2 text-sm">
            <span className="mr-auto">{t("nudge.lead", { name: thread.other.firstName })}</span>
            <button
              type="button"
              onClick={() => setShowIcebreakers(true)}
              className="font-semibold underline underline-offset-4"
            >
              {t("nudge.action")}
            </button>
          </div>
        )}
      {closed ? (
        <p className="border-paper/10 border-t px-4 py-5 text-center text-paper/70">{t("composer.closed")}</p>
      ) : (
        <Composer
          name={thread.other.firstName}
          draft={draft}
          onDraftChange={onDraftChange}
          onSend={() => send(draft)}
          replyTo={replyTo}
          replyName={replyTo?.senderId === me ? null : thread.other.firstName}
          onCancelReply={() => setReplyTo(null)}
          onSticker={(sticker) => void sendAttachment({ type: "sticker", sticker })}
          onProposeDate={() => setDateSheet({ counterTo: null })}
          onGif={(gif) => void sendAttachment({ type: "gif", gif })}
          onPhoto={(file) => void pickPhoto(file)}
          onVoice={sendVoice}
          onVoiceError={(key) =>
            say(key === "microphone" ? t("media.errors.microphone") : t("media.maxDuration"))
          }
          mediaBusy={mediaBusy}
          editing={editing !== null}
          onCancelEdit={() => {
            setEditing(null);
            setDraft("");
          }}
          icebreakers={thread.icebreakers}
          showIcebreakers={showIcebreakers}
          onToggleIcebreakers={() => setShowIcebreakers((v) => !v)}
          onPickIcebreaker={(text) => {
            setDraft(text);
            setShowIcebreakers(false);
            composer.current?.focus();
          }}
          textareaRef={composer}
        />
      )}
    </section>
  );
}

function MatchHeader({ thread }: { thread: ThreadView }) {
  const t = useTranslations("chat");
  const format = useFormatter();
  return (
    <div className="mb-6 flex flex-col items-center gap-2 text-center">
      <Avatar photoUrl={thread.other.photoUrl} schoolSlug={thread.other.school.slug} size="lg" />
      <p className="text-paper/60 text-sm">
        {t("matchedOn", {
          date: format.dateTime(new Date(thread.createdAt), { day: "numeric", month: "long" }),
        })}
      </p>
    </div>
  );
}

function DaySeparator({ iso }: { iso: string }) {
  const t = useTranslations("chat");
  const format = useFormatter();
  const date = new Date(iso);
  const today = new Date();
  const yesterday = new Date(today.getTime() - 86_400_000);
  const same = (a: Date, b: Date) => a.toDateString() === b.toDateString();
  const label = same(date, today)
    ? t("today")
    : same(date, yesterday)
      ? t("yesterday")
      : format.dateTime(date, { weekday: "long", day: "numeric", month: "long" });
  return (
    <li className="my-3 text-center font-mono text-paper/60 text-xs uppercase tracking-wider">
      <time dateTime={iso} suppressHydrationWarning>
        {label}
      </time>
    </li>
  );
}

function Bubble({
  message,
  mine,
  me,
  reply,
  seen,
  onReply,
  onReact,
  onReport,
  changeable,
  onEdit,
  onDelete,
  onRespondDate,
  onCounterDate,
  onOpenMedia,
}: {
  message: ChatMessage;
  mine: boolean;
  me: string;
  reply: ChatMessage["replyTo"];
  seen: boolean;
  onReply: () => void;
  onReact: (emoji: string) => void;
  onReport: () => void;
  /** Own message still within the edit and delete window (CHAT-08). */
  changeable: boolean;
  onEdit: () => void;
  onDelete: () => void;
  onRespondDate: (response: "accept" | "decline") => void;
  onCounterDate: () => void;
  onOpenMedia: () => Promise<string | null>;
}) {
  const t = useTranslations("chat");
  const format = useFormatter();
  const [menu, setMenu] = useState(false);
  const [burst, setBurst] = useState(0);
  // Long press opens the message menu on touch screens (the "…" button is for mouse and keyboard).
  const longPress = useRef(0);
  const counts = new Map<string, number>();
  for (const r of message.reactions) {
    counts.set(r.emoji, (counts.get(r.emoji) ?? 0) + 1);
  }
  const myReaction = message.reactions.find((r) => r.userId === me)?.emoji;

  return (
    <motion.li
      layout="position"
      initial={{ opacity: 0, y: 10, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ type: "spring", stiffness: 420, damping: 30 }}
      className={`group flex flex-col ${mine ? "items-end" : "items-start"}`}
    >
      <div className={`flex max-w-[85%] items-end gap-1 ${mine ? "flex-row-reverse" : ""}`}>
        {/* biome-ignore lint/a11y/noStaticElementInteractions: double-tap and long press are shortcuts; the same actions are in the keyboard-accessible message menu. */}
        <div
          onContextMenu={(event) => {
            event.preventDefault();
            setMenu(true);
          }}
          onPointerDown={(event) => {
            if (event.pointerType === "touch") {
              longPress.current = window.setTimeout(() => setMenu(true), 450);
            }
          }}
          onPointerUp={() => window.clearTimeout(longPress.current)}
          onPointerLeave={() => window.clearTimeout(longPress.current)}
          onDoubleClick={() => {
            if (!message.deleted) {
              onReact("❤️");
              setBurst((b) => b + 1);
            }
          }}
          className={`relative rounded-3xl ${
            message.deleted
              ? "border border-paper/15 px-4 py-2.5 text-paper/60 italic"
              : message.attachment
                ? "p-0"
                : mine
                  ? "rounded-br-lg bg-plasma px-4 py-2.5 text-ink"
                  : "rounded-bl-lg bg-paper/10 px-4 py-2.5 text-paper"
          }`}
        >
          {reply && (
            <p
              className={`mb-1.5 line-clamp-2 border-l-2 pl-2 text-sm ${
                mine ? "border-ink/40 text-ink/70" : "border-paper/40 text-paper/60"
              }`}
            >
              {reply.text}
            </p>
          )}
          {message.deleted ? (
            <p>{t("status.deleted")}</p>
          ) : message.attachment?.type === "sticker" ? (
            <div className="size-28">
              <StickerArt
                id={message.attachment.sticker as StickerId}
                label={t(`stickers.names.${message.attachment.sticker}` as "stickers.names.bond")}
              />
            </div>
          ) : message.attachment?.type === "date" ? (
            <DateCard
              messageId={message.id}
              date={message.attachment}
              mine={mine}
              onRespond={onRespondDate}
              onCounter={onCounterDate}
            />
          ) : message.attachment?.type === "image" ? (
            <ImageBubble image={message.attachment} mine={mine} onOpen={onOpenMedia} onReport={onReport} />
          ) : message.attachment?.type === "voice" ? (
            <VoicePlayer voice={message.attachment} mine={mine} />
          ) : message.attachment?.type === "gif" ? (
            // biome-ignore lint/performance/noImgElement: GIPHY serves the GIF.
            <img
              src={message.attachment.url}
              alt={message.attachment.title}
              width={message.attachment.width}
              height={message.attachment.height}
              className="max-w-60 rounded-3xl"
            />
          ) : (
            <p className="whitespace-pre-wrap break-words">{message.text}</p>
          )}
          <AnimatePresence>
            {burst > 0 && (
              <motion.span
                key={burst}
                aria-hidden="true"
                className="pointer-events-none absolute inset-0 grid place-items-center text-3xl"
                initial={{ scale: 0.3, opacity: 1 }}
                animate={{ scale: 2.2, opacity: 0 }}
                transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
                onAnimationComplete={() => setBurst(0)}
              >
                ❤️
              </motion.span>
            )}
          </AnimatePresence>
        </div>
        {!message.deleted && (
          <div className="relative">
            <button
              type="button"
              aria-label={t("actions.menu")}
              aria-expanded={menu}
              onClick={() => setMenu((v) => !v)}
              className="grid size-8 place-items-center rounded-full text-paper/60 opacity-0 transition-opacity hover:text-paper focus-visible:opacity-100 group-hover:opacity-100 aria-expanded:opacity-100"
            >
              <svg viewBox="0 0 24 24" className="size-4" fill="currentColor" aria-hidden="true">
                <circle cx="5" cy="12" r="2" />
                <circle cx="12" cy="12" r="2" />
                <circle cx="19" cy="12" r="2" />
              </svg>
            </button>
            {menu && (
              <div
                className={`absolute bottom-full z-10 mb-1 flex flex-col gap-1 rounded-2xl border border-paper/15 bg-ink p-2 shadow-xl ${
                  mine ? "right-0" : "left-0"
                }`}
              >
                <div className="flex gap-1">
                  {MESSAGING_RULES.reactions.map((emoji) => (
                    <button
                      key={emoji}
                      type="button"
                      aria-label={t("actions.reactionLabel", { emoji })}
                      aria-pressed={myReaction === emoji}
                      onClick={() => {
                        onReact(emoji);
                        setMenu(false);
                      }}
                      className={`grid size-9 place-items-center rounded-full text-lg hover:bg-paper/10 ${
                        myReaction === emoji ? "bg-paper/15" : ""
                      }`}
                    >
                      {emoji}
                    </button>
                  ))}
                </div>
                <button
                  type="button"
                  onClick={() => {
                    onReply();
                    setMenu(false);
                  }}
                  className="rounded-xl px-3 py-2 text-left text-sm hover:bg-paper/10"
                >
                  {t("actions.reply")}
                </button>
                {changeable && message.kind === "text" && (
                  <button
                    type="button"
                    onClick={() => {
                      onEdit();
                      setMenu(false);
                    }}
                    className="rounded-xl px-3 py-2 text-left text-sm hover:bg-paper/10"
                  >
                    {t("actions.edit")}
                  </button>
                )}
                {changeable && (
                  <button
                    type="button"
                    onClick={() => {
                      onDelete();
                      setMenu(false);
                    }}
                    className="rounded-xl px-3 py-2 text-left text-sm hover:bg-paper/10"
                  >
                    {t("actions.delete")}
                  </button>
                )}
                {!mine && (
                  <button
                    type="button"
                    onClick={() => {
                      onReport();
                      setMenu(false);
                    }}
                    className="rounded-xl px-3 py-2 text-left text-plasma text-sm hover:bg-paper/10"
                  >
                    {t("actions.report")}
                  </button>
                )}
              </div>
            )}
          </div>
        )}
      </div>
      {counts.size > 0 && (
        <div className={`-mt-1 flex gap-1 ${mine ? "mr-2" : "ml-2"}`}>
          {[...counts.entries()].map(([emoji, count]) => (
            <button
              key={emoji}
              type="button"
              onClick={() => onReact(emoji)}
              aria-label={t("actions.reactionLabel", { emoji })}
              aria-pressed={myReaction === emoji}
              className={`rounded-full border px-1.5 py-0.5 text-xs ${
                myReaction === emoji ? "border-volt bg-volt/10" : "border-paper/15 bg-ink"
              }`}
            >
              {emoji}
              {count > 1 && <span className="ml-0.5 font-mono">{count}</span>}
            </button>
          ))}
        </div>
      )}
      {message.editedAt && !message.deleted && (
        <span className="px-2 text-paper/60 text-xs">{t("status.edited")}</span>
      )}
      <span className="mt-0.5 hidden px-2 font-mono text-[10px] text-paper/60 group-focus-within:block group-hover:block">
        {format.dateTime(new Date(message.createdAt), { hour: "2-digit", minute: "2-digit" })}
      </span>
      {!mine && message.flagged && (
        <button
          type="button"
          onClick={onReport}
          className="mt-1 ml-2 rounded-full border border-plasma/40 px-3 py-1 text-paper/80 text-xs hover:border-plasma"
        >
          {t("flagged")}
        </button>
      )}
      {seen && <span className="px-2 text-paper/60 text-xs">{t("status.seen")}</span>}
    </motion.li>
  );
}

function PendingBubble({
  pending,
  reply,
  onRetry,
}: {
  pending: PendingMessage;
  reply: ChatMessage | null;
  onRetry: () => void;
}) {
  const t = useTranslations("chat");
  return (
    <li className="flex flex-col items-end">
      <button
        type="button"
        disabled={pending.status === "sending"}
        onClick={onRetry}
        className={`max-w-[85%] rounded-3xl rounded-br-lg bg-plasma px-4 py-2.5 text-left text-ink ${
          pending.status === "failed" ? "opacity-60 ring-2 ring-paper/50" : "opacity-70"
        }`}
      >
        {reply && (
          <p className="mb-1.5 line-clamp-2 border-ink/40 border-l-2 pl-2 text-ink/70 text-sm">
            {reply.text}
          </p>
        )}
        <p className="whitespace-pre-wrap break-words">{pending.text}</p>
      </button>
      <span className="px-2 text-paper/60 text-xs">{t(`status.${pending.status}`)}</span>
    </li>
  );
}

/** "is typing" as two electrons orbiting a nucleus (docs/02, moment signature #6). */
function TypingIndicator({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-3">
      <span aria-hidden="true" className="relative block size-9 rounded-3xl rounded-bl-lg bg-paper/10">
        <span className="absolute top-1/2 left-1/2 size-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-paper/70" />
        <span className="absolute inset-1.5 animate-[orbit_1.1s_linear_infinite]">
          <span className="absolute top-0 left-1/2 size-1 -translate-x-1/2 rounded-full bg-volt" />
        </span>
        <span className="absolute inset-2.5 animate-[orbit_0.8s_linear_infinite_reverse]">
          <span className="absolute bottom-0 left-1/2 size-1 -translate-x-1/2 rounded-full bg-plasma" />
        </span>
      </span>
      <span className="text-paper/60 text-sm">{label}</span>
    </div>
  );
}

function Composer({
  name,
  draft,
  onDraftChange,
  onSend,
  replyTo,
  replyName,
  onCancelReply,
  editing,
  onCancelEdit,
  onSticker,
  onGif,
  onProposeDate,
  onPhoto,
  onVoice,
  onVoiceError,
  mediaBusy,
  icebreakers,
  showIcebreakers,
  onToggleIcebreakers,
  onPickIcebreaker,
  textareaRef,
}: {
  name: string;
  draft: string;
  onDraftChange: (value: string) => void;
  onSend: () => void;
  replyTo: ChatMessage | null;
  replyName: string | null;
  onCancelReply: () => void;
  editing: boolean;
  onCancelEdit: () => void;
  onSticker: (sticker: StickerId) => void;
  onGif: (gif: PickedGif) => void;
  onProposeDate: () => void;
  onPhoto: (file: File) => void;
  onVoice: (voice: RecordedVoice) => Promise<boolean>;
  onVoiceError: (key: "microphone" | "maxDuration") => void;
  mediaBusy: boolean;
  icebreakers: IcebreakerView[];
  showIcebreakers: boolean;
  onToggleIcebreakers: () => void;
  onPickIcebreaker: (text: string) => void;
  textareaRef: React.RefObject<HTMLTextAreaElement | null>;
}) {
  const t = useTranslations("chat");
  const [picker, setPicker] = useState(false);
  /** On phones, the tools fold behind "+" so that the text field keeps its width. */
  const [tools, setTools] = useState(false);
  const recorder = useVoiceRecorder(onVoiceError);
  const photoInput = useRef<HTMLInputElement>(null);
  const icebreakerText = (i: IcebreakerView) =>
    i.key === "campus"
      ? t(`icebreakers.campus.${String(i.params.index)}` as "icebreakers.campus.0")
      : t(`icebreakers.${i.key}`, i.params as Record<string, string>);

  return (
    <div className="border-paper/10 border-t px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
      {showIcebreakers && icebreakers.length > 0 && (
        <div className="mb-3 flex flex-col gap-2">
          <p className="text-paper/60 text-xs">{t("icebreakers.title")}</p>
          <ul className="flex flex-col gap-2">
            {icebreakers.map((i) => {
              const text = icebreakerText(i);
              return (
                <li key={text}>
                  <button
                    type="button"
                    onClick={() => onPickIcebreaker(text)}
                    className="w-full rounded-2xl border border-volt/30 px-3 py-2 text-left text-sm hover:bg-volt/10"
                  >
                    {text}
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}
      {picker && !editing && (
        <StickerPicker
          onSticker={(sticker) => {
            setPicker(false);
            onSticker(sticker);
          }}
          onGif={(gif) => {
            setPicker(false);
            onGif(gif);
          }}
        />
      )}
      {editing && (
        <div className="mb-2 flex items-center gap-2 rounded-2xl bg-volt/10 px-3 py-2 text-sm">
          <span className="min-w-0 flex-1">{t("composer.editing")}</span>
          <button
            type="button"
            onClick={onCancelEdit}
            className="text-paper/70 underline-offset-4 hover:underline"
          >
            {t("composer.cancelEdit")}
          </button>
        </div>
      )}
      {replyTo && (
        <div className="mb-2 flex items-center gap-2 rounded-2xl bg-paper/5 px-3 py-2 text-sm">
          <span className="min-w-0 flex-1 truncate">
            <span className="text-paper/60">
              {replyName ? t("composer.replyingTo", { name: replyName }) : t("composer.replyingToSelf")} ·{" "}
            </span>
            {replyTo.text}
          </span>
          <button
            type="button"
            onClick={onCancelReply}
            aria-label={t("composer.cancelReply")}
            className="text-paper/60"
          >
            ✕
          </button>
        </div>
      )}
      {recorder.state !== "idle" ? (
        <VoiceComposer
          recorder={recorder}
          busy={mediaBusy}
          onSend={async (voice) => {
            if (await onVoice(voice)) {
              recorder.reset();
            }
          }}
        />
      ) : (
        <form
          className="flex flex-wrap items-end gap-2 sm:flex-nowrap"
          onSubmit={(event) => {
            event.preventDefault();
            onSend();
          }}
        >
          <button
            type="button"
            onClick={() => setTools((v) => !v)}
            aria-label={t("composer.tools")}
            aria-expanded={tools}
            aria-controls="composer-tools"
            className="grid size-11 shrink-0 place-items-center rounded-full border border-paper/15 text-paper sm:hidden"
          >
            <svg
              viewBox="0 0 24 24"
              className={`size-5 transition-transform ${tools ? "rotate-45" : ""}`}
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              aria-hidden="true"
            >
              <path d="M12 5v14M5 12h14" strokeLinecap="round" />
            </svg>
          </button>
          <div
            id="composer-tools"
            className={`${tools ? "order-first flex basis-full" : "hidden"} gap-2 sm:order-none sm:flex sm:basis-auto`}
          >
            <button
              type="button"
              onClick={onToggleIcebreakers}
              aria-label={t("icebreakers.title")}
              aria-pressed={showIcebreakers}
              className="grid size-11 shrink-0 place-items-center rounded-full border border-paper/15 text-volt"
            >
              <svg
                viewBox="0 0 24 24"
                className="size-5"
                fill="none"
                stroke="currentColor"
                strokeWidth={1.8}
                aria-hidden="true"
              >
                <path
                  d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M5.6 18.4l2.1-2.1M16.3 7.7l2.1-2.1"
                  strokeLinecap="round"
                />
              </svg>
            </button>
            <button
              type="button"
              onClick={() => setPicker((v) => !v)}
              aria-label={t("stickers.title")}
              aria-pressed={picker}
              disabled={editing}
              className="grid size-11 shrink-0 place-items-center rounded-full border border-paper/15 text-plasma disabled:opacity-40"
            >
              <svg
                viewBox="0 0 24 24"
                className="size-5"
                fill="none"
                stroke="currentColor"
                strokeWidth={1.8}
                aria-hidden="true"
              >
                <path
                  d="M14 3H6a3 3 0 0 0-3 3v12a3 3 0 0 0 3 3h7l8-8V6a3 3 0 0 0-3-3h-4Z"
                  strokeLinejoin="round"
                />
                <path d="M13 21v-5a3 3 0 0 1 3-3h5" strokeLinejoin="round" />
                <path d="M8.5 9.5h.01M14.5 9.5h.01M8.5 14c1.5 1.2 3.5 1.2 5 0" strokeLinecap="round" />
              </svg>
            </button>
            <button
              type="button"
              onClick={onProposeDate}
              aria-label={t("date.open")}
              disabled={editing}
              className="grid size-11 shrink-0 place-items-center rounded-full border border-paper/15 text-volt disabled:opacity-40"
            >
              <svg
                viewBox="0 0 24 24"
                className="size-5"
                fill="none"
                stroke="currentColor"
                strokeWidth={1.8}
                aria-hidden="true"
              >
                <rect x="3.5" y="5" width="17" height="15" rx="3" />
                <path d="M3.5 10h17M8 3v4M16 3v4" strokeLinecap="round" />
                <path
                  d="M12 13.2c-.9-1-2.6-.6-2.6.8 0 1.3 2.6 2.8 2.6 2.8s2.6-1.5 2.6-2.8c0-1.4-1.7-1.8-2.6-.8Z"
                  fill="currentColor"
                  stroke="none"
                />
              </svg>
            </button>
            <button
              type="button"
              onClick={() => photoInput.current?.click()}
              aria-label={t("media.photo")}
              disabled={editing || mediaBusy}
              className="grid size-11 shrink-0 place-items-center rounded-full border border-paper/15 text-paper disabled:opacity-40"
            >
              <svg
                viewBox="0 0 24 24"
                className="size-5"
                fill="none"
                stroke="currentColor"
                strokeWidth={1.8}
                aria-hidden="true"
              >
                <rect x="3" y="5" width="18" height="14" rx="3" />
                <circle cx="9" cy="10" r="1.6" />
                <path d="m4 17 5-4.5 3.5 3L16 12l4 4" strokeLinejoin="round" />
              </svg>
            </button>
            <input
              ref={photoInput}
              type="file"
              accept="image/*"
              tabIndex={-1}
              aria-hidden="true"
              className="hidden"
              onChange={(event) => {
                const file = event.target.files?.[0];
                event.target.value = "";
                if (file) {
                  onPhoto(file);
                }
              }}
            />
          </div>
          <label className="sr-only" htmlFor="composer">
            {t("composer.label", { name })}
          </label>
          <textarea
            ref={textareaRef}
            id="composer"
            rows={1}
            value={draft}
            maxLength={MESSAGING_RULES.maxLength}
            placeholder={t("composer.placeholder")}
            onChange={(event) => {
              onDraftChange(event.target.value);
              event.target.style.height = "auto";
              event.target.style.height = `${Math.min(event.target.scrollHeight, 140)}px`;
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
                event.preventDefault();
                onSend();
              }
            }}
            className="max-h-36 min-h-11 min-w-0 flex-1 resize-none rounded-3xl border border-paper/20 bg-transparent px-4 py-2.5 placeholder:text-paper/50 focus:border-volt focus:outline-none"
          />
          {!draft.trim() && !editing ? (
            <button
              type="button"
              onClick={() => void recorder.start()}
              disabled={mediaBusy}
              aria-label={t("media.record")}
              className="grid size-11 shrink-0 place-items-center rounded-full bg-plasma text-ink disabled:opacity-40"
            >
              <svg
                viewBox="0 0 24 24"
                className="size-5"
                fill="none"
                stroke="currentColor"
                strokeWidth={2}
                aria-hidden="true"
              >
                <rect x="9" y="3" width="6" height="11" rx="3" />
                <path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21" strokeLinecap="round" />
              </svg>
            </button>
          ) : (
            <button
              type="submit"
              disabled={!draft.trim()}
              aria-label={editing ? t("composer.save") : t("composer.send")}
              className="grid size-11 shrink-0 place-items-center rounded-full bg-plasma text-ink disabled:opacity-40"
            >
              <svg viewBox="0 0 24 24" className="size-5" fill="currentColor" aria-hidden="true">
                <path d="M3.4 20.4 21 12 3.4 3.6l-.1 6.5L15 12l-11.7 1.9z" />
              </svg>
            </button>
          )}
        </form>
      )}
    </div>
  );
}
