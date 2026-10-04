"use client";

import type { PactMatchView } from "@atomes/contracts";
import { springs } from "@atomes/tokens";
import { ViewerWatermark } from "@atomes/ui";
import { animate, motion, useMotionValue, useReducedMotion, useTransform } from "motion/react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useEffect } from "react";
import { SchoolBadge, schoolColor, schoolFoil } from "../discovery/school";
import { RadarChart } from "./radar-chart";

/** Score that counts up when the card lands (a plain number with reduced motion). */
function CountingScore({ score, animated }: { score: number; animated: boolean }) {
  const t = useTranslations("pact.result");
  const target = Math.round(score * 100);
  const value = useMotionValue(animated ? 0 : target);
  const rounded = useTransform(value, (v) => t("score", { score: Math.round(v) }));
  useEffect(() => {
    if (!animated) {
      value.set(target);
      return;
    }
    const controls = animate(value, target, { duration: 1.1, ease: "easeOut", delay: 0.3 });
    return () => controls.stop();
  }, [animated, target, value]);
  return (
    <p className="font-mono text-lg text-volt tabular-nums">
      <span className="sr-only">{t("score", { score: target })}</span>
      <motion.span aria-hidden="true">{rounded}</motion.span>
    </p>
  );
}

export function PactMatchCard({
  match,
  animated,
  delay = 0,
}: {
  match: PactMatchView;
  animated: boolean;
  delay?: number;
}) {
  const t = useTranslations("pact.result");
  const reduceMotion = useReducedMotion();
  const play = animated && !reduceMotion;
  const { card, compatibility } = match;
  const color = schoolColor(card.school.slug);
  const photo = card.photos[0];

  return (
    <motion.article
      className="flex flex-col gap-5 rounded-[28px] border border-paper/10 bg-paper/[0.03] p-5"
      initial={play ? { opacity: 0, y: 40, scale: 0.9, filter: "blur(12px)" } : false}
      animate={{ opacity: 1, y: 0, scale: 1, filter: "blur(0px)" }}
      transition={{ type: "spring", ...springs.bouncy, delay }}
      style={{ ["--school" as string]: color }}
    >
      <p className="font-mono text-paper/70 text-xs uppercase tracking-widest">{t(`mode.${match.mode}`)}</p>
      <div className="flex items-center gap-4">
        <div className="relative isolate size-24 shrink-0 overflow-hidden rounded-3xl bg-ink">
          {photo ? (
            // biome-ignore lint/performance/noImgElement: signed imgproxy URLs are already resized and encoded.
            <img
              src={photo.url}
              alt={photo.alt ?? ""}
              width={96}
              height={96}
              className="size-full object-cover"
            />
          ) : null}
          {photo ? <ViewerWatermark /> : null}
          <span aria-hidden="true" className="foil" data-foil={schoolFoil(card.school.slug)} />
        </div>
        <div className="flex min-w-0 flex-col gap-1.5">
          <h3 className="font-display font-semibold text-3xl tracking-tight">
            {card.firstName}
            <span className="font-normal text-paper/70">, {card.age}</span>
          </h3>
          <SchoolBadge slug={card.school.slug} name={card.school.name} className="self-start" />
          <CountingScore score={match.score} animated={play} />
        </div>
      </div>

      <RadarChart sections={match.sections} color={color} animate={play} />

      {compatibility.agreements.length > 0 && (
        <section className="flex flex-col gap-2">
          <h4 className="font-mono text-paper/70 text-xs uppercase tracking-widest">{t("agreements")}</h4>
          <ul className="flex flex-col gap-2">
            {compatibility.agreements.map((agreement) => (
              <li key={agreement.question} className="rounded-2xl bg-paper/5 px-4 py-3 text-sm">
                <span className="text-paper/70">{agreement.question}</span>{" "}
                <span className="font-semibold">{agreement.answer}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
      {compatibility.quirk && (
        <section className="flex flex-col gap-2">
          <h4 className="font-mono text-paper/70 text-xs uppercase tracking-widest">{t("quirk")}</h4>
          <p className="rounded-2xl bg-paper/5 px-4 py-3 text-sm">
            <span className="text-paper/70">{compatibility.quirk.question}</span>{" "}
            {t("quirkLine", {
              mine: compatibility.quirk.mine,
              theirs: compatibility.quirk.theirs,
              name: card.firstName,
            })}
          </p>
        </section>
      )}

      <div className="flex flex-wrap gap-3">
        {match.matchId && (
          <Link
            href={`/messages/${match.matchId}`}
            className="rounded-full bg-paper px-5 py-3 font-semibold text-ink transition hover:bg-volt focus-visible:outline-2 focus-visible:outline-volt focus-visible:outline-offset-2"
          >
            {t("write", { name: card.firstName })}
          </Link>
        )}
        <Link
          href={`/membres/${card.userId}`}
          className="rounded-full border border-paper/25 px-5 py-3 font-semibold transition hover:border-paper/60 focus-visible:outline-2 focus-visible:outline-volt focus-visible:outline-offset-2"
        >
          {t("profile")}
        </Link>
      </div>
    </motion.article>
  );
}

/** Sober screen: no match is a legitimate outcome, never a failure. */
export function NoMatch() {
  const t = useTranslations("pact.noMatch");
  return (
    <section className="flex flex-col items-center gap-3 rounded-3xl border border-paper/10 px-6 py-14 text-center">
      <h2 className="font-display font-semibold text-2xl">{t("title")}</h2>
      <p className="max-w-md text-paper/75">{t("lead")}</p>
      <p className="max-w-md text-paper/70 text-sm">{t("next")}</p>
      <Link
        href="/decouvrir"
        className="mt-2 rounded-full border border-paper/25 px-5 py-3 font-semibold transition hover:border-paper/60 focus-visible:outline-2 focus-visible:outline-volt focus-visible:outline-offset-2"
      >
        {t("discover")}
      </Link>
    </section>
  );
}

export function NotParticipant() {
  const t = useTranslations("pact.notParticipant");
  return (
    <section className="flex flex-col items-center gap-3 rounded-3xl border border-paper/10 px-6 py-14 text-center">
      <h2 className="font-display font-semibold text-2xl">{t("title")}</h2>
      <p className="max-w-md text-paper/75">{t("lead")}</p>
    </section>
  );
}
