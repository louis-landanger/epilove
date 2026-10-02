"use client";

import type { LikeReceived, MemberCard, QuotaView } from "@epilove/contracts";
import { ORPCError } from "@orpc/client";
import { AnimatePresence, motion } from "motion/react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState, useTransition, ViewTransition } from "react";
import { api } from "@/lib/rencontre/api.client";
import { SchoolBadge, schoolFoil } from "../discovery/school";
import { Liaison } from "../matches/liaison";

/**
 * Likes received (DEC-04): free and unblurred, with what was liked and the
 * comment. Liking back creates the match on the spot.
 */
export function LikesScreen({
  initialLikes,
  initialQuota,
  me,
}: {
  initialLikes: LikeReceived[];
  initialQuota: QuotaView;
  me: MemberCard | null;
}) {
  const t = useTranslations("likes");
  const discovery = useTranslations("discovery");
  const router = useRouter();
  const [likes, setLikes] = useState(initialLikes);
  const [quota, setQuota] = useState(initialQuota);
  const [error, setError] = useState<string | null>(null);
  const [liaison, setLiaison] = useState<{ card: MemberCard; matchId: string } | null>(null);
  const [, startTransition] = useTransition();

  const answer = async (like: LikeReceived, kind: "like" | "pass") => {
    setError(null);
    const previous = likes;
    setLikes((current) => current.filter((l) => l.card.userId !== like.card.userId));
    try {
      const result = await api.discovery.decide({
        targetId: like.card.userId,
        kind,
        content: null,
        comment: null,
      });
      setQuota(result.quota);
      if (result.matchId) {
        setLiaison({ card: like.card, matchId: result.matchId });
      }
    } catch (cause) {
      setLikes(previous);
      const code = cause instanceof ORPCError ? cause.message : "generic";
      setError(discovery(`errors.${code}` as "errors.generic"));
    }
  };

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-3xl flex-col gap-6 px-4 pt-6 pb-10">
      <header className="flex flex-col gap-1">
        <h1 className="font-display font-semibold text-3xl tracking-tight">{t("title")}</h1>
        <p className="text-paper/70">{likes.length > 0 ? t("count", { count: likes.length }) : t("lead")}</p>
        <p className="font-mono text-paper/60 text-xs">{discovery("quota", { count: quota.likesLeft })}</p>
      </header>

      {error && (
        <p role="alert" className="rounded-2xl bg-plasma/15 px-4 py-3 text-sm">
          {error}
        </p>
      )}

      {likes.length === 0 ? (
        <section className="flex flex-col items-center gap-3 rounded-3xl border border-paper/10 px-6 py-16 text-center">
          <h2 className="font-display font-semibold text-2xl">{t("empty")}</h2>
          <p className="max-w-sm text-paper/70">{t("emptyLead")}</p>
        </section>
      ) : (
        <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <AnimatePresence initial={false}>
            {likes.map((like) => (
              <motion.li
                key={like.card.userId}
                layout
                exit={{ opacity: 0, scale: 0.9 }}
                className="relative flex flex-col overflow-hidden rounded-[24px] border border-paper/10 bg-paper/[0.03]"
              >
                <button
                  type="button"
                  onClick={() => startTransition(() => router.push(`/membres/${like.card.userId}`))}
                  className="relative aspect-[4/5] w-full overflow-hidden text-left"
                  aria-label={t("open")}
                >
                  {like.card.photos[0] && (
                    <ViewTransition
                      name={`member-photo-${like.card.userId}`}
                      share="member-photo"
                      default="none"
                    >
                      {/* biome-ignore lint/performance/noImgElement: signed imgproxy URL. */}
                      <img src={like.card.photos[0].url} alt="" className="size-full object-cover" />
                    </ViewTransition>
                  )}
                  <span aria-hidden="true" className="foil" data-foil={schoolFoil(like.card.school.slug)} />
                  <span className="absolute inset-x-0 bottom-0 flex flex-col gap-2 bg-gradient-to-t from-ink to-transparent p-4 pt-16">
                    <span className="flex items-center gap-2">
                      <SchoolBadge slug={like.card.school.slug} name={like.card.school.name} />
                      {like.kind === "superlike" && (
                        <span className="rounded-full bg-volt px-2.5 py-1 font-mono text-[11px] text-ink uppercase">
                          {t("superlike")}
                        </span>
                      )}
                    </span>
                    <span className="font-display font-semibold text-2xl">
                      {like.card.firstName}
                      <span className="font-normal text-paper/70">, {like.card.age}</span>
                    </span>
                  </span>
                </button>
                <div className="flex flex-1 flex-col gap-3 p-4">
                  {like.liked && (
                    <div className="flex items-start gap-3 rounded-2xl bg-paper/5 p-3 text-sm">
                      {like.liked.type === "photo" ? (
                        <>
                          {/* biome-ignore lint/performance/noImgElement: signed imgproxy URL. */}
                          <img src={like.liked.url} alt="" className="h-14 w-11 rounded-lg object-cover" />
                          <span className="text-paper/70">{t("liked")}</span>
                        </>
                      ) : (
                        <span className="flex flex-col gap-1">
                          <span className="text-paper/60 text-xs">{t("likedPrompt")}</span>
                          <span className="line-clamp-2 font-serif italic">{like.liked.answer}</span>
                        </span>
                      )}
                    </div>
                  )}
                  {like.comment && (
                    <p className="font-serif text-lg italic leading-snug">« {like.comment} »</p>
                  )}
                  <div className="mt-auto flex gap-2">
                    <button
                      type="button"
                      onClick={() => answer(like, "pass")}
                      className="rounded-full border border-paper/20 px-4 py-2.5 text-sm"
                    >
                      {t("pass")}
                    </button>
                    <button
                      type="button"
                      onClick={() => answer(like, "like")}
                      disabled={quota.likesLeft === 0}
                      className="flex-1 rounded-full bg-plasma px-4 py-2.5 font-semibold text-ink text-sm disabled:opacity-40"
                    >
                      {t("likeBack")}
                    </button>
                  </div>
                </div>
              </motion.li>
            ))}
          </AnimatePresence>
        </ul>
      )}

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
    </main>
  );
}
