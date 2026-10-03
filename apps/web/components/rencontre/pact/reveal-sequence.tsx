"use client";

import { motion, useReducedMotion } from "motion/react";
import { useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";

/** The capsule shakes at least this long, so that everyone shares the suspense. */
const MIN_SUSPENSE_MS = 2600;
const OPENING_MS = 1100;

/**
 * Moment signature #7 (docs/02-design.md): the sample analysed for the whole
 * campus opens and the match card comes out. The sequence waits for the
 * result (fetched with a small random delay to spread the load) and for its
 * photo, then opens. Reduced motion: a plain fade.
 */
export function RevealSequence({
  ready,
  colors,
  onOpened,
}: {
  /** Result fetched and photos preloaded. */
  ready: boolean;
  /** Colours of the flash (the schools of the matches), volt when there is none. */
  colors: readonly string[];
  onOpened: () => void;
}) {
  const t = useTranslations("pact.sequence");
  const reduceMotion = useReducedMotion();
  const [suspenseOver, setSuspenseOver] = useState(false);
  const [stage, setStage] = useState<"analysing" | "opening">("analysing");
  const opened = useRef(onOpened);
  opened.current = onOpened;

  useEffect(() => {
    const timer = setTimeout(() => setSuspenseOver(true), reduceMotion ? 400 : MIN_SUSPENSE_MS);
    return () => clearTimeout(timer);
  }, [reduceMotion]);

  useEffect(() => {
    if (ready && suspenseOver) {
      setStage("opening");
    }
  }, [ready, suspenseOver]);

  useEffect(() => {
    if (stage !== "opening") {
      return;
    }
    navigator.vibrate?.([30, 60, 30]);
    const timer = setTimeout(() => opened.current(), reduceMotion ? 300 : OPENING_MS);
    return () => clearTimeout(timer);
  }, [stage, reduceMotion]);

  const [first = "var(--color-volt)", second = first] = colors;
  const opening = stage === "opening";

  return (
    <div className="relative flex min-h-[60dvh] flex-col items-center justify-center gap-10 overflow-hidden">
      <motion.div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0"
        initial={{ opacity: 0 }}
        animate={opening ? { opacity: [0, 1, 0.25], scale: [0.4, 1.4, 2] } : { opacity: 0 }}
        transition={{ duration: OPENING_MS / 1000, times: [0, 0.3, 1] }}
        style={{
          background: `radial-gradient(circle at 50% 45%, ${first} 0%, color-mix(in oklch, ${second} 60%, transparent) 20%, transparent 55%)`,
        }}
      />

      <motion.svg
        viewBox="0 0 120 220"
        className="relative h-56 w-auto"
        aria-hidden="true"
        animate={
          reduceMotion || opening
            ? {}
            : { rotate: [0, -2.5, 2.5, -1.5, 1.5, 0], scale: [1, 1.02, 1, 1.03, 1] }
        }
        transition={{ duration: 0.9, repeat: Number.POSITIVE_INFINITY, ease: "easeInOut" }}
      >
        <defs>
          <linearGradient id="pact-glass" x1="0" x2="1">
            <stop offset="0" stopColor="white" stopOpacity="0.18" />
            <stop offset="0.5" stopColor="white" stopOpacity="0.05" />
            <stop offset="1" stopColor="white" stopOpacity="0.14" />
          </linearGradient>
          <radialGradient id="pact-core">
            <stop offset="0" stopColor={first} stopOpacity="1" />
            <stop offset="1" stopColor={second} stopOpacity="0" />
          </radialGradient>
        </defs>
        <motion.circle
          cx="60"
          cy="110"
          r="34"
          fill="url(#pact-core)"
          animate={
            reduceMotion ? {} : { r: opening ? [34, 90] : [26, 36, 26], opacity: opening ? [1, 0] : 1 }
          }
          transition={
            opening
              ? { duration: OPENING_MS / 1000 }
              : { duration: 1.4, repeat: Number.POSITIVE_INFINITY, ease: "easeInOut" }
          }
        />
        {/* Upper half of the capsule. */}
        <motion.g
          animate={opening ? { y: -70, rotate: -18, opacity: 0 } : { y: 0, rotate: 0, opacity: 1 }}
          transition={{ duration: OPENING_MS / 1000, ease: [0.16, 1, 0.3, 1] }}
          style={{ transformOrigin: "60px 110px" }}
        >
          <path
            d="M20 110 V58 a40 40 0 0 1 80 0 V110 Z"
            fill="url(#pact-glass)"
            stroke="currentColor"
            strokeWidth="2"
            className="text-paper/70"
          />
          <path
            d="M34 60 a26 26 0 0 1 18 -24"
            stroke="white"
            strokeOpacity="0.5"
            strokeWidth="3"
            fill="none"
          />
        </motion.g>
        {/* Lower half. */}
        <motion.g
          animate={opening ? { y: 70, rotate: 14, opacity: 0 } : { y: 0, rotate: 0, opacity: 1 }}
          transition={{ duration: OPENING_MS / 1000, ease: [0.16, 1, 0.3, 1] }}
          style={{ transformOrigin: "60px 110px" }}
        >
          <path
            d="M20 110 V162 a40 40 0 0 0 80 0 V110 Z"
            fill="url(#pact-glass)"
            stroke="currentColor"
            strokeWidth="2"
            className="text-paper/70"
          />
          <rect x="20" y="104" width="80" height="12" rx="3" fill="currentColor" className="text-paper/25" />
        </motion.g>
      </motion.svg>

      <p className="relative font-mono text-paper/80 text-sm uppercase tracking-[0.3em]" aria-live="polite">
        {opening ? t("opening") : t("analysing")}
        {!opening && !reduceMotion && (
          <motion.span
            aria-hidden="true"
            animate={{ opacity: [0, 1, 0] }}
            transition={{ duration: 1.2, repeat: Number.POSITIVE_INFINITY }}
          >
            …
          </motion.span>
        )}
      </p>
    </div>
  );
}
