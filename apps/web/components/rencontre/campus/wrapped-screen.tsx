"use client";

import type { WrappedView } from "@atomes/contracts";
import { motion } from "motion/react";
import Link from "next/link";
import { useTranslations } from "next-intl";

/** Brand colours only: school colours carry a meaning (docs/02-design.md). */
const COLORS = ["var(--color-plasma)", "var(--color-volt)"];

/** Wrapped (COM-03): the member's own year as a story of cards, and the image to keep. */
export function WrappedScreen({ wrapped }: { wrapped: WrappedView }) {
  const t = useTranslations("campus.wrapped");
  const slides = [
    { big: String(wrapped.matches), text: t("matches", { count: wrapped.matches }) },
    {
      big: String(wrapped.messages),
      text: `${t("messages", { count: wrapped.messages })} ${t("conversations", { count: wrapped.conversations })}`,
    },
    { big: String(wrapped.likes), text: t("likes", { count: wrapped.likes }) },
    // A reaction or a peak hour only once there is one: no empty card.
    ...(wrapped.favoriteReaction ? [{ big: wrapped.favoriteReaction, text: t("reaction") }] : []),
    ...(wrapped.peakHour === null ? [] : [{ big: t("hour", { hour: wrapped.peakHour }), text: t("peak") }]),
    { big: String(wrapped.events), text: t("events", { count: wrapped.events }) },
    { big: String(wrapped.pacts), text: t("pacts", { count: wrapped.pacts }) },
  ];

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col gap-5 px-4 pt-6 pb-10">
      <header className="flex flex-col gap-2">
        <Link href="/campus" className="self-start text-paper/70 text-sm underline-offset-4 hover:underline">
          {t("back")}
        </Link>
        <h1 className="font-display font-semibold text-3xl tracking-tight">{t("title")}</h1>
        <p className="text-paper/75">{t("lead", { label: wrapped.label })}</p>
      </header>
      <ol className="flex flex-col gap-4">
        {slides.map((slide, index) => (
          <motion.li
            key={slide.text}
            initial={{ opacity: 0, y: 24 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.4 }}
            transition={{ type: "spring", stiffness: 200, damping: 26, delay: 0.05 }}
            className="relative flex min-h-48 flex-col justify-end gap-2 overflow-hidden rounded-[28px] border border-paper/10 p-6"
          >
            <span
              aria-hidden="true"
              className="absolute -top-16 -right-16 size-56 rounded-full opacity-40 blur-3xl"
              style={{ background: COLORS[index % COLORS.length] }}
            />
            <span className="relative font-display font-semibold text-6xl tracking-tight">{slide.big}</span>
            <span className="relative text-lg">{slide.text}</span>
          </motion.li>
        ))}
      </ol>
      <a
        href="/campus/wrapped/image"
        download="atomes-wrapped.png"
        className="self-start rounded-full bg-plasma px-5 py-3 font-semibold text-ink"
      >
        {t("download")}
      </a>
      <p className="text-paper/60 text-sm">{t("privacy")}</p>
    </main>
  );
}
