"use client";

import { durations } from "@atomes/tokens";
import { motion, useReducedMotion } from "motion/react";
import { useTranslations } from "next-intl";
import { useId } from "react";

export interface RadarSection {
  readonly section: string;
  readonly score: number | null;
}

/** `ease-out` of docs/02-design.md (tokens `easings.out`), as Motion expects it. */
const EASE_OUT = [0.16, 1, 0.3, 1] as const;
const SIZE = 260;
/** Room on both sides for the section names ("Humour et nerd"). */
const LABEL_ROOM = 60;
const CENTER = SIZE / 2;
const RADIUS = 86;

function point(index: number, count: number, value: number) {
  const angle = -Math.PI / 2 + (2 * Math.PI * index) / count;
  return { x: CENTER + Math.cos(angle) * RADIUS * value, y: CENTER + Math.sin(angle) * RADIUS * value };
}

/**
 * Compatibility per questionnaire section (PAC-03), drawn once the match card
 * is on screen. Sections without enough common answers sit at the centre and
 * are named as such in the accessible description.
 */
export function RadarChart({
  sections,
  color,
  animate = true,
}: {
  sections: readonly RadarSection[];
  color: string;
  animate?: boolean;
}) {
  const t = useTranslations("pact.result");
  const labels = useTranslations("questionnaire.sections");
  const titleId = useId();
  const reduceMotion = useReducedMotion();
  const count = sections.length;
  if (count < 3) {
    return null;
  }
  const label = (section: string) =>
    labels.has(section as "values") ? labels(section as "values") : section;
  const polygon = sections
    .map((s, i) => point(i, count, Math.max(0.04, s.score ?? 0)))
    .map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`)
    .join(" ");
  const description = sections
    .map((s) =>
      s.score === null
        ? t("radarMissing", { section: label(s.section) })
        : t("radarValue", { section: label(s.section), score: Math.round(s.score * 100) }),
    )
    .join(" ; ");

  return (
    <figure className="flex flex-col items-center gap-2">
      <figcaption aria-hidden="true" className="font-mono text-paper/70 text-xs uppercase tracking-widest">
        {t("radarTitle")}
      </figcaption>
      <svg
        viewBox={`${-LABEL_ROOM} 0 ${SIZE + 2 * LABEL_ROOM} ${SIZE}`}
        className="w-full max-w-96 overflow-visible"
        role="img"
        aria-describedby={`${titleId}-desc`}
      >
        <title>{t("radarTitle")}</title>
        <desc id={`${titleId}-desc`}>{description}</desc>
        {[0.25, 0.5, 0.75, 1].map((ring) => (
          <polygon
            key={ring}
            points={sections
              .map((_, i) => point(i, count, ring))
              .map((p) => `${p.x},${p.y}`)
              .join(" ")}
            fill="none"
            stroke="currentColor"
            className="text-paper/15"
            strokeWidth={1}
          />
        ))}
        {sections.map((s, i) => {
          const end = point(i, count, 1);
          const text = point(i, count, 1.18);
          return (
            <g key={s.section}>
              <line
                x1={CENTER}
                y1={CENTER}
                x2={end.x}
                y2={end.y}
                stroke="currentColor"
                className="text-paper/15"
              />
              <text
                x={text.x}
                y={text.y}
                textAnchor={Math.abs(text.x - CENTER) < 8 ? "middle" : text.x > CENTER ? "start" : "end"}
                dominantBaseline="middle"
                fontSize={13}
                className={s.score === null ? "fill-paper/50" : "fill-paper/85"}
              >
                {label(s.section)}
              </text>
            </g>
          );
        })}
        <motion.polygon
          points={polygon}
          fill={color}
          fillOpacity={0.28}
          stroke={color}
          strokeWidth={2}
          strokeLinejoin="round"
          style={{ transformOrigin: `${CENTER}px ${CENTER}px` }}
          initial={animate && !reduceMotion ? { scale: 0, opacity: 0 } : false}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ duration: durations.cinematic / 1000, ease: EASE_OUT }}
        />
      </svg>
    </figure>
  );
}
