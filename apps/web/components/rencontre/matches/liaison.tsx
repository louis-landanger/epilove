"use client";

import { motion, useReducedMotion } from "motion/react";
import { useTranslations } from "next-intl";
import { useEffect, useId, useRef, useState } from "react";
import { schoolColor } from "../discovery/school";

export interface LiaisonMember {
  readonly firstName: string;
  readonly schoolSlug: string;
  readonly photoUrl: string | null;
}

/** A jagged path between two points, like an electric arc. */
function arcPath(seed: number, width: number): string {
  const points = 9;
  let path = "M 0 50";
  for (let i = 1; i < points; i++) {
    const x = (width / points) * i;
    const jitter = Math.sin(seed * 13.7 + i * 4.1) * 14 + Math.cos(seed * 7.3 + i * 2.3) * 8;
    path += ` L ${x.toFixed(1)} ${(50 + jitter).toFixed(1)}`;
  }
  return `${path} L ${width} 50`;
}

/**
 * Match screen (moment signature #4, docs/02-design.md): both cards rush
 * together, an electric arc links them and a flash in the two school colours
 * marks the bond. Announced to screen readers; a calm fade with reduced motion.
 */
export function Liaison({
  me,
  other,
  matchId,
  onClose,
}: {
  me: LiaisonMember;
  other: LiaisonMember;
  matchId: string;
  onClose: () => void;
}) {
  const t = useTranslations("matches.liaison");
  const titleId = useId();
  const dialog = useRef<HTMLDialogElement>(null);
  const primary = useRef<HTMLAnchorElement>(null);
  const reduceMotion = useReducedMotion();
  const [seed, setSeed] = useState(1);
  const colorA = schoolColor(me.schoolSlug);
  const colorB = schoolColor(other.schoolSlug);

  useEffect(() => {
    dialog.current?.showModal();
    // The main action of the dialog gets the focus.
    primary.current?.focus();
    navigator.vibrate?.([18, 40, 18]);
  }, []);

  useEffect(() => {
    if (reduceMotion) {
      return;
    }
    const interval = setInterval(() => setSeed((s) => s + 1), 90);
    return () => clearInterval(interval);
  }, [reduceMotion]);

  return (
    <dialog
      ref={dialog}
      aria-labelledby={titleId}
      onClose={onClose}
      className="fixed inset-0 m-0 size-full max-h-none max-w-none overflow-hidden bg-ink/95 p-0 text-paper backdrop:bg-ink/80"
    >
      <motion.div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0"
        initial={{ opacity: 0, scale: 0.2 }}
        animate={{ opacity: [0, 1, 0.35], scale: [0.2, 1.6, 2.2] }}
        transition={{ duration: 1.1, delay: 0.55, times: [0, 0.25, 1] }}
        style={{
          background: `radial-gradient(circle at 50% 42%, ${colorA} 0%, color-mix(in oklch, ${colorB} 70%, transparent) 22%, transparent 55%)`,
        }}
      />

      <div className="relative mx-auto flex min-h-full max-w-md flex-col items-center justify-center gap-10 px-6 py-10">
        <div className="relative flex w-full items-center justify-center">
          <motion.div
            initial={{ x: -160, rotate: -14, opacity: 0 }}
            animate={{ x: -6, rotate: -6, opacity: 1 }}
            transition={{ type: "spring", stiffness: 320, damping: 14 }}
          >
            <Portrait member={me} color={colorA} />
          </motion.div>
          <svg
            aria-hidden="true"
            viewBox="0 0 120 100"
            className="absolute top-1/2 left-1/2 h-24 w-32 -translate-x-1/2 -translate-y-1/2"
            preserveAspectRatio="none"
          >
            <defs>
              <linearGradient id={`${titleId}-arc`} x1="0" x2="1" y1="0" y2="0">
                <stop offset="0%" stopColor={colorA} />
                <stop offset="100%" stopColor={colorB} />
              </linearGradient>
            </defs>
            <motion.path
              d={arcPath(seed, 120)}
              fill="none"
              stroke={`url(#${titleId}-arc)`}
              strokeWidth={3}
              strokeLinecap="round"
              initial={{ pathLength: 0, opacity: 0 }}
              animate={{ pathLength: 1, opacity: 1 }}
              transition={{ delay: 0.45, duration: 0.25 }}
              style={{ filter: "drop-shadow(0 0 6px white)" }}
            />
          </svg>
          <motion.div
            initial={{ x: 160, rotate: 14, opacity: 0 }}
            animate={{ x: 6, rotate: 6, opacity: 1 }}
            transition={{ type: "spring", stiffness: 320, damping: 14 }}
          >
            <Portrait member={other} color={colorB} />
          </motion.div>
        </div>

        <motion.div
          className="flex flex-col items-center gap-3 text-center"
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.8, duration: 0.42, ease: [0.16, 1, 0.3, 1] }}
        >
          <h2 id={titleId} className="font-display font-semibold text-5xl tracking-tight">
            {t.rich("title", {
              em: (chunks) => <em className="font-normal font-serif text-plasma italic">{chunks}</em>,
            })}
          </h2>
          <p role="status" className="text-lg text-paper/80">
            <span className="sr-only">{t("announce", { name: other.firstName })} </span>
            {t("lead", { name: other.firstName })}
          </p>
        </motion.div>

        <motion.div
          className="flex w-full flex-col gap-3"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1, duration: 0.3 }}
        >
          <a
            href={`/messages/${matchId}`}
            ref={primary}
            className="rounded-full bg-plasma px-6 py-3.5 text-center font-semibold text-ink"
          >
            {t("write", { name: other.firstName })}
          </a>
          <button type="button" onClick={onClose} className="rounded-full border border-paper/20 px-6 py-3.5">
            {t("continue")}
          </button>
        </motion.div>
      </div>
    </dialog>
  );
}

function Portrait({ member, color }: { member: LiaisonMember; color: string }) {
  return (
    <div
      className="relative h-44 w-32 overflow-hidden rounded-3xl border-2 bg-paper/10 shadow-[0_0_40px_-6px_var(--glow)] sm:h-52 sm:w-40"
      style={{ borderColor: color, ["--glow" as string]: color }}
    >
      {member.photoUrl && (
        // biome-ignore lint/performance/noImgElement: signed imgproxy URL.
        <img src={member.photoUrl} alt="" className="size-full object-cover" />
      )}
    </div>
  );
}
