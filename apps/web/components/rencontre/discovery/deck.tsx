"use client";

import type { MemberCard as MemberCardData, QuotaView } from "@epilove/contracts";
import { ORPCError } from "@orpc/client";
import { AnimatePresence, animate, motion, type PanInfo, useMotionValue, useTransform } from "motion/react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { api } from "@/lib/rencontre/api.client";
import { useOnline } from "@/lib/rencontre/use-online";
import { Liaison } from "../matches/liaison";
import { type LikeRequest, LikeSheet } from "./like-sheet";
import { type LikedContent, MemberCard } from "./member-card";

type Kind = "like" | "superlike" | "pass";
type EmptyReason = "exhausted" | "profile_incomplete" | "paused" | "restricted";

export interface DeckInitial {
  readonly cards: MemberCardData[];
  readonly quota: QuotaView;
  readonly empty: EmptyReason | null;
}

const THROW_DISTANCE = 120;
const THROW_VELOCITY = 650;
const EXIT: Record<Kind, { x: number; y: number; rotate: number }> = {
  like: { x: 1, y: 0, rotate: 24 },
  pass: { x: -1, y: 0, rotate: -24 },
  superlike: { x: 0, y: -1, rotate: 0 },
};

function errorCode(error: unknown): string {
  return error instanceof ORPCError && typeof error.message === "string" ? error.message : "generic";
}

/**
 * Discovery deck (DEC-01, moment signature #3). Cards are physical: they tilt
 * with the drag velocity and are thrown away; stamps fade in as you drag.
 * Every action also has a button and a key (← pass, → like, ↑ crush,
 * Enter profile, h / l like vim).
 */
export function Deck({
  initial,
  me,
  filtersActive,
  onOpenFilters,
  onQuota,
}: {
  initial: DeckInitial;
  me: MemberCardData | null;
  filtersActive: boolean;
  onOpenFilters: () => void;
  onQuota?: (quota: QuotaView) => void;
}) {
  const t = useTranslations("discovery");
  const router = useRouter();
  const online = useOnline();
  const [cards, setCards] = useState(initial.cards);
  const [quota, setQuota] = useState(initial.quota);
  const [empty, setEmpty] = useState<EmptyReason | null>(initial.empty);
  const [exit, setExit] = useState<Kind>("pass");
  const [likeRequest, setLikeRequest] = useState<(LikeRequest & { card: MemberCardData }) | null>(null);
  const [sending, setSending] = useState(false);
  const [sheetError, setSheetError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [liaison, setLiaison] = useState<{ card: MemberCardData; matchId: string } | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [, startTransition] = useTransition();
  const decided = useRef<string[]>([]);

  const top = cards[0];

  useEffect(() => {
    onQuota?.(quota);
  }, [quota, onQuota]);

  const showToast = useCallback((message: string) => {
    setToast(message);
    window.setTimeout(() => setToast((current) => (current === message ? null : current)), 4000);
  }, []);

  // Keep a few cards ahead, and preload the pictures of the next three.
  useEffect(() => {
    for (const card of cards.slice(1, 4)) {
      const url = card.photos[0]?.url;
      if (url) {
        new Image().src = url;
      }
    }
    if (cards.length >= 3 || loadingMore || empty !== null || !online) {
      return;
    }
    setLoadingMore(true);
    api.discovery
      .deck({
        locale: "fr",
        limit: 8,
        exclude: [...cards.map((c) => c.userId), ...decided.current.slice(-80)],
      })
      .then((result) => {
        setQuota(result.quota);
        setCards((current) => {
          const known = new Set(current.map((c) => c.userId));
          return [...current, ...result.cards.filter((c) => !known.has(c.userId))];
        });
        if (result.cards.length === 0 && cards.length === 0) {
          setEmpty(result.empty ?? "exhausted");
        }
      })
      .catch(() => showToast(t("errors.generic")))
      .finally(() => setLoadingMore(false));
  }, [cards, loadingMore, empty, online, showToast, t]);

  const send = useCallback(
    async (card: MemberCardData, kind: Kind, content: LikedContent | null, comment: string | null) => {
      setExit(kind);
      decided.current.push(card.userId);
      setCards((current) => current.filter((c) => c.userId !== card.userId));
      navigator.vibrate?.(kind === "pass" ? 8 : 14);
      try {
        const result = await api.discovery.decide({
          targetId: card.userId,
          kind,
          content: content ? { type: content.type, id: content.id } : null,
          comment,
        });
        setQuota(result.quota);
        if (result.outcome === "matched" && result.matchId) {
          setLiaison({ card, matchId: result.matchId });
        }
        return true;
      } catch (error) {
        // Put the card back on top and explain.
        setCards((current) => [card, ...current.filter((c) => c.userId !== card.userId)]);
        showToast(t(`errors.${errorCode(error)}` as "errors.generic"));
        return false;
      }
    },
    [showToast, t],
  );

  const like = useCallback(
    (card: MemberCardData) => {
      const photo = card.photos[0];
      void send(card, "like", photo ? { type: "photo", id: photo.id, url: photo.url } : null, null);
    },
    [send],
  );

  const requestLike = useCallback(
    (card: MemberCardData, content: LikedContent | null, superlike: boolean) => {
      setSheetError(null);
      setLikeRequest({ card, name: card.firstName, content, superlike });
    },
    [],
  );

  const undo = useCallback(async () => {
    try {
      const result = await api.discovery.undo({ locale: "fr" });
      setQuota(result.quota);
      if (result.restored) {
        const restored = result.restored;
        setCards((current) => [restored, ...current.filter((c) => c.userId !== restored.userId)]);
        setEmpty(null);
        showToast(t("undone", { name: restored.firstName }));
      } else {
        showToast(t("errors.nothing_to_undo"));
      }
    } catch (error) {
      showToast(t(`errors.${errorCode(error)}` as "errors.generic"));
    }
  }, [showToast, t]);

  const openProfile = useCallback(
    (card: MemberCardData) => startTransition(() => router.push(`/membres/${card.userId}`)),
    [router],
  );

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (!top || likeRequest || liaison || !online || event.altKey || event.ctrlKey || event.metaKey) {
        return;
      }
      const target = event.target as HTMLElement | null;
      if (target?.closest("input, textarea, select, dialog")) {
        return;
      }
      if (event.key === "ArrowLeft" || event.key === "h") {
        event.preventDefault();
        void send(top, "pass", null, null);
      } else if (event.key === "ArrowRight" || event.key === "l") {
        event.preventDefault();
        like(top);
      } else if (event.key === "ArrowUp") {
        event.preventDefault();
        requestLike(top, null, true);
      } else if (event.key === "Enter" && target?.tagName !== "BUTTON" && target?.tagName !== "A") {
        openProfile(top);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [top, likeRequest, liaison, online, send, like, requestLike, openProfile]);

  const stack = useMemo(() => cards.slice(0, 3), [cards]);
  const actionsDisabled = !top || !online;

  return (
    <div className="flex flex-1 flex-col items-center gap-5">
      {!online && (
        <p role="status" className="w-full rounded-2xl bg-plasma/15 px-4 py-2 text-center text-sm">
          {t("offline")}
        </p>
      )}

      <div className="relative h-[min(64dvh,600px)] w-full max-w-[420px]">
        {stack.length === 0 ? (
          loadingMore ? (
            <DeckSkeleton label={t("loading")} />
          ) : (
            <EmptyDeck
              reason={empty ?? "exhausted"}
              filtersActive={filtersActive}
              onOpenFilters={onOpenFilters}
            />
          )
        ) : (
          <>
            {stack
              .slice(1)
              .reverse()
              .map((card) => {
                const depth = stack.indexOf(card);
                return (
                  <motion.div
                    key={card.userId}
                    aria-hidden="true"
                    className="absolute inset-0"
                    initial={false}
                    animate={{ scale: 1 - depth * 0.045, y: depth * 14, opacity: 1 - depth * 0.25 }}
                    transition={{ type: "spring", stiffness: 200, damping: 26 }}
                  >
                    <MemberCard card={card} interactive={false} />
                  </motion.div>
                );
              })}
            <AnimatePresence custom={exit} initial={false}>
              {top && (
                <SwipeCard
                  key={top.userId}
                  card={top}
                  disabled={actionsDisabled}
                  onPass={() => void send(top, "pass", null, null)}
                  onLike={() => like(top)}
                  onSuperlike={() => requestLike(top, null, true)}
                  onLikeContent={(content) => requestLike(top, content, false)}
                  onOpen={() => openProfile(top)}
                />
              )}
            </AnimatePresence>
          </>
        )}
      </div>

      <div className="flex items-center justify-center gap-4">
        <RoundButton
          label={t("actions.undo")}
          onClick={undo}
          disabled={quota.undosLeft === 0 || !online}
          size="sm"
        >
          <path d="M9 14 4 9l5-5M4 9h10.5a5.5 5.5 0 0 1 0 11H11" />
        </RoundButton>
        <RoundButton
          label={t("actions.pass")}
          onClick={() => top && send(top, "pass", null, null)}
          disabled={actionsDisabled}
        >
          <path d="M18 6 6 18M6 6l12 12" />
        </RoundButton>
        <RoundButton
          label={t("actions.superlike")}
          onClick={() => top && requestLike(top, null, true)}
          disabled={actionsDisabled || quota.superlikesLeft === 0}
          size="md"
          tone="volt"
        >
          <path d="m12 3 2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z" />
        </RoundButton>
        <RoundButton
          label={t("actions.like")}
          onClick={() => top && like(top)}
          disabled={actionsDisabled || quota.likesLeft === 0}
          tone="plasma"
        >
          <path d="M12 20.5 10.6 19.2C5.7 14.8 2.5 11.9 2.5 8.3 2.5 5.4 4.8 3.2 7.6 3.2c1.6 0 3.2.8 4.4 2 1.2-1.2 2.8-2 4.4-2 2.8 0 5.1 2.2 5.1 5.1 0 3.6-3.2 6.5-8.1 10.9z" />
        </RoundButton>
      </div>
      <p className="hidden text-center text-paper/60 text-xs sm:block">{t("keyboard")}</p>

      <div
        aria-live="polite"
        className="pointer-events-none fixed inset-x-0 bottom-24 z-30 flex justify-center px-4"
      >
        <AnimatePresence>
          {toast && (
            <motion.p
              key={toast}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 12 }}
              className="pointer-events-auto max-w-sm rounded-2xl bg-paper px-4 py-3 text-center text-ink text-sm shadow-lg"
            >
              {toast}
            </motion.p>
          )}
        </AnimatePresence>
      </div>

      <LikeSheet
        request={likeRequest}
        superlikesLeft={quota.superlikesLeft}
        pending={sending}
        error={sheetError}
        onCancel={() => setLikeRequest(null)}
        onSend={async (comment, superlike) => {
          if (!likeRequest) {
            return;
          }
          setSending(true);
          const ok = await send(
            likeRequest.card,
            superlike ? "superlike" : "like",
            likeRequest.content,
            comment || null,
          );
          setSending(false);
          if (ok) {
            setLikeRequest(null);
          } else {
            setSheetError(t("errors.generic"));
          }
        }}
      />

      {liaison && (
        <Liaison
          matchId={liaison.matchId}
          me={{
            firstName: me?.firstName ?? "",
            schoolSlug: me?.school.slug ?? "",
            photoUrl: me?.photos[0]?.url ?? null,
          }}
          other={{
            firstName: liaison.card.firstName,
            schoolSlug: liaison.card.school.slug,
            photoUrl: liaison.card.photos[0]?.url ?? null,
          }}
          onClose={() => setLiaison(null)}
        />
      )}
    </div>
  );
}

function SwipeCard({
  card,
  disabled,
  onPass,
  onLike,
  onSuperlike,
  onLikeContent,
  onOpen,
}: {
  card: MemberCardData;
  disabled: boolean;
  onPass: () => void;
  onLike: () => void;
  onSuperlike: () => void;
  onLikeContent: (content: LikedContent) => void;
  onOpen: () => void;
}) {
  const t = useTranslations("discovery.stamps");
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const rotate = useTransform(x, [-320, 0, 320], [-16, 0, 16]);
  const likeOpacity = useTransform(x, [24, THROW_DISTANCE], [0, 1]);
  const passOpacity = useTransform(x, [-THROW_DISTANCE, -24], [1, 0]);
  const superOpacity = useTransform(y, [-THROW_DISTANCE, -30], [1, 0]);

  const onDragEnd = (_event: unknown, info: PanInfo) => {
    if (info.offset.x > THROW_DISTANCE || info.velocity.x > THROW_VELOCITY) {
      onLike();
    } else if (info.offset.x < -THROW_DISTANCE || info.velocity.x < -THROW_VELOCITY) {
      onPass();
    } else if (info.offset.y < -THROW_DISTANCE || info.velocity.y < -THROW_VELOCITY) {
      animate(x, 0, { type: "spring", stiffness: 500, damping: 32 });
      animate(y, 0, { type: "spring", stiffness: 500, damping: 32 });
      onSuperlike();
    } else {
      animate(x, 0, { type: "spring", stiffness: 500, damping: 32 });
      animate(y, 0, { type: "spring", stiffness: 500, damping: 32 });
    }
  };

  return (
    <motion.div
      className="absolute inset-0 cursor-grab touch-none active:cursor-grabbing"
      style={{ x, y, rotate }}
      drag={!disabled}
      dragElastic={0.9}
      dragMomentum={false}
      onDragEnd={onDragEnd}
      initial={{ scale: 0.95, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      variants={{
        exit: (kind: Kind) => ({
          x: EXIT[kind].x * 640,
          y: EXIT[kind].y * 720,
          rotate: EXIT[kind].rotate,
          opacity: 0,
          transition: { duration: 0.32, ease: [0.16, 1, 0.3, 1] },
        }),
      }}
      exit="exit"
      transition={{ type: "spring", stiffness: 320, damping: 26 }}
    >
      <MemberCard card={card} interactive onLike={onLikeContent} onOpen={onOpen} />
      <Stamp opacity={likeOpacity} className="top-10 left-6 -rotate-12 border-volt text-volt">
        {t("like")}
      </Stamp>
      <Stamp opacity={passOpacity} className="top-10 right-6 rotate-12 border-paper text-paper">
        {t("pass")}
      </Stamp>
      <Stamp opacity={superOpacity} className="bottom-48 left-1/2 -translate-x-1/2 border-plasma text-plasma">
        {t("superlike")}
      </Stamp>
    </motion.div>
  );
}

function Stamp({
  opacity,
  className,
  children,
}: {
  opacity: ReturnType<typeof useTransform<number, number>>;
  className: string;
  children: string;
}) {
  return (
    <motion.span
      aria-hidden="true"
      style={{ opacity }}
      className={`pointer-events-none absolute rounded-xl border-4 px-3 py-1 font-display font-bold text-3xl uppercase tracking-wider ${className}`}
    >
      {children}
    </motion.span>
  );
}

function RoundButton({
  label,
  onClick,
  disabled,
  size = "lg",
  tone = "paper",
  children,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  size?: "sm" | "md" | "lg";
  tone?: "paper" | "plasma" | "volt";
  children: React.ReactNode;
}) {
  const sizes = { sm: "size-11", md: "size-14", lg: "size-16" } as const;
  const tones = {
    paper: "border-paper/25 text-paper hover:border-paper/60",
    plasma: "border-plasma/60 bg-plasma text-ink hover:brightness-110",
    volt: "border-volt/60 text-volt hover:bg-volt/10",
  } as const;
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      disabled={disabled}
      className={`grid place-items-center rounded-full border-2 transition-transform active:scale-90 disabled:opacity-30 ${sizes[size]} ${tones[tone]}`}
    >
      <svg
        viewBox="0 0 24 24"
        className={size === "sm" ? "size-5" : "size-7"}
        fill={tone === "plasma" ? "currentColor" : "none"}
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        {children}
      </svg>
    </button>
  );
}

function DeckSkeleton({ label }: { label: string }) {
  return (
    <div className="absolute inset-0 flex flex-col justify-end gap-3 overflow-hidden rounded-[28px] bg-paper/5 p-5">
      <span className="sr-only" role="status">
        {label}
      </span>
      <div className="h-6 w-24 animate-pulse rounded-full bg-paper/10" />
      <div className="h-9 w-40 animate-pulse rounded-xl bg-paper/10" />
      <div className="h-16 animate-pulse rounded-2xl bg-paper/10" />
    </div>
  );
}

function EmptyDeck({
  reason,
  filtersActive,
  onOpenFilters,
}: {
  reason: EmptyReason;
  filtersActive: boolean;
  onOpenFilters: () => void;
}) {
  const t = useTranslations("discovery.empty");
  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 rounded-[28px] border border-paper/10 px-8 text-center">
      <span aria-hidden="true" className="relative block size-20">
        <span className="absolute inset-0 rounded-full border border-paper/15" />
        <span className="absolute inset-5 rounded-full border border-paper/15" />
        <span className="absolute top-0 left-1/2 size-2.5 -translate-x-1/2 rounded-full bg-volt" />
      </span>
      <h2 className="font-display font-semibold text-2xl">{t(reason)}</h2>
      <p className="text-paper/70">{t(`${reason}Lead`)}</p>
      {reason === "exhausted" && (
        <div className="flex flex-wrap justify-center gap-2">
          {filtersActive && (
            <button
              type="button"
              onClick={onOpenFilters}
              className="rounded-full border border-paper/25 px-4 py-2 text-sm"
            >
              {t("widen")}
            </button>
          )}
          <a href="/likes" className="rounded-full bg-paper px-4 py-2 font-semibold text-ink text-sm">
            {t("seeLikes")}
          </a>
        </div>
      )}
    </div>
  );
}
