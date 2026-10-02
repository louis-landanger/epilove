"use client";

import type { MemberCard as MemberCardData } from "@epilove/contracts";
import { useTranslations } from "next-intl";
import { useRef, useState, ViewTransition } from "react";
import { SchoolBadge, schoolColor, schoolFoil } from "./school";
import { useFoil } from "./use-foil";

export type LikedContent =
  | { type: "photo"; id: string; url: string }
  | { type: "prompt"; id: string; question: string; answer: string };

/**
 * The deck card (moment signature #3): photo carousel, holographic school
 * frame, name, compatibility and the first prompt. Each photo and prompt can
 * be liked on its own (DEC-02).
 */
export function MemberCard({
  card,
  interactive,
  secondChance = false,
  onLike,
  onOpen,
}: {
  card: MemberCardData;
  /** Only the top card of the deck reacts to the pointer and exposes its buttons. */
  interactive: boolean;
  /** Passed more than 45 days ago, changed since (DEC-09). */
  secondChance?: boolean;
  onLike?: (content: LikedContent) => void;
  onOpen?: () => void;
}) {
  const t = useTranslations("discovery");
  const ref = useRef<HTMLDivElement>(null);
  const [photoIndex, setPhotoIndex] = useState(0);
  useFoil(ref, interactive);

  const photo = card.photos[photoIndex];
  const prompt = card.prompts[0];
  const score = card.compatibility?.score;
  const color = schoolColor(card.school.slug);

  return (
    <div
      ref={ref}
      className="relative isolate size-full overflow-hidden rounded-[28px] bg-ink shadow-[0_24px_60px_-20px_rgb(0_0_0/0.8)]"
      style={{ ["--school" as string]: color }}
    >
      {photo ? (
        <ViewTransition name={`member-photo-${card.userId}`} share="member-photo" default="none">
          {/* biome-ignore lint/performance/noImgElement: signed imgproxy URLs are already resized and encoded. */}
          <img
            src={photo.url}
            alt={photo.alt ?? ""}
            width={photo.width ?? 640}
            height={photo.height ?? 800}
            draggable={false}
            className="absolute inset-0 size-full select-none object-cover"
          />
        </ViewTransition>
      ) : (
        <div className="absolute inset-0 grid place-items-center bg-paper/5 text-paper/60">
          {t("card.noPhoto")}
        </div>
      )}
      <span aria-hidden="true" className="foil" data-foil={schoolFoil(card.school.slug)} />
      <span aria-hidden="true" className="foil foil-frame" data-foil={schoolFoil(card.school.slug)} />

      {card.photos.length > 1 && (
        <div className="absolute inset-x-3 top-3 flex gap-1" aria-hidden="true">
          {card.photos.map((p, i) => (
            <span
              key={p.id}
              className={`h-1 flex-1 rounded-full ${i === photoIndex ? "bg-paper" : "bg-paper/35"}`}
            />
          ))}
        </div>
      )}
      {interactive && card.photos.length > 1 && (
        <>
          <button
            type="button"
            aria-label={t("card.previousPhoto")}
            onClick={() => setPhotoIndex((i) => Math.max(0, i - 1))}
            className="absolute top-0 left-0 h-3/5 w-1/3 focus-visible:outline-offset-[-4px]"
          />
          <button
            type="button"
            aria-label={t("card.nextPhoto")}
            onClick={() => setPhotoIndex((i) => Math.min(card.photos.length - 1, i + 1))}
            className="absolute top-0 right-0 h-3/5 w-1/3 focus-visible:outline-offset-[-4px]"
          />
        </>
      )}
      {interactive && photo && onLike && (
        <HeartButton
          label={t("actions.likeThis")}
          className="absolute top-8 right-3"
          onClick={() => onLike({ type: "photo", id: photo.id, url: photo.url })}
        />
      )}

      <div className="absolute inset-x-0 bottom-0 flex flex-col gap-3 bg-gradient-to-t from-ink via-ink/85 to-transparent px-5 pt-24 pb-5">
        <div className="flex flex-wrap items-center gap-2">
          <SchoolBadge slug={card.school.slug} name={card.school.name} />
          {secondChance && (
            <span
              className="rounded-full bg-volt/15 px-2.5 py-1 font-mono text-[11px] text-volt uppercase tracking-wider"
              title={t("card.secondChanceHelp")}
            >
              {t("card.secondChance")}
              <span className="sr-only"> : {t("card.secondChanceHelp")}</span>
            </span>
          )}
          {card.modes.length === 1 && card.modes[0] === "friends" && (
            <span className="rounded-full bg-paper/10 px-2.5 py-1 font-mono text-[11px] text-paper/80 uppercase tracking-wider">
              {t("card.modeFriends")}
            </span>
          )}
          <span className="ml-auto font-mono text-volt text-xs">
            {typeof score === "number" ? t("card.compatibility", { percent: Math.round(score * 100) }) : ""}
          </span>
        </div>
        <h2 className="font-display font-semibold text-3xl leading-none tracking-tight">
          {interactive && onOpen ? (
            <button
              type="button"
              onClick={onOpen}
              className="text-left"
              aria-label={t("actions.open", { name: card.firstName })}
            >
              {card.firstName}
              <span className="font-normal text-paper/80">, {card.age}</span>
            </button>
          ) : (
            <>
              {card.firstName}
              <span className="font-normal text-paper/80">, {card.age}</span>
            </>
          )}
        </h2>
        {prompt && (
          <figure className="relative rounded-2xl border border-paper/10 bg-paper/[0.06] p-3 pr-12 backdrop-blur-sm">
            <figcaption className="text-paper/60 text-xs">{prompt.question}</figcaption>
            <blockquote className="mt-1 line-clamp-2 font-serif text-lg italic leading-snug">
              {prompt.answer}
            </blockquote>
            {interactive && onLike && (
              <HeartButton
                label={t("actions.likeThis")}
                className="absolute top-1/2 right-2 -translate-y-1/2"
                small
                onClick={() =>
                  onLike({ type: "prompt", id: prompt.id, question: prompt.question, answer: prompt.answer })
                }
              />
            )}
          </figure>
        )}
      </div>
    </div>
  );
}

export function HeartButton({
  label,
  onClick,
  className = "",
  small = false,
}: {
  label: string;
  onClick: () => void;
  className?: string;
  small?: boolean;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      className={`grid place-items-center rounded-full border border-paper/20 bg-ink/60 text-plasma backdrop-blur-md transition-transform hover:scale-110 active:scale-95 ${
        small ? "size-9" : "size-11"
      } ${className}`}
    >
      <svg viewBox="0 0 24 24" className={small ? "size-4" : "size-5"} fill="currentColor" aria-hidden="true">
        <path d="M12 21.35 10.55 20C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54z" />
      </svg>
    </button>
  );
}
