/**
 * Design tokens: single source of truth (docs/02-design.md).
 * `theme.gen.css` is generated from this file by `pnpm --filter @epilove/tokens generate`.
 *
 * School colours deliberately differ from the schools' official brand
 * identities and never carry information on their own (each school also has
 * a glyph and a foil pattern).
 */

export const colors = {
  ink: "oklch(0.15 0.02 285)",
  paper: "oklch(0.97 0.01 85)",
  plasma: "oklch(0.68 0.25 350)",
  volt: "oklch(0.9 0.19 125)",
} as const;

export const schoolColors = {
  epita: "oklch(0.62 0.19 255)",
  esme: "oklch(0.8 0.16 80)",
  supbiotech: "oklch(0.74 0.17 150)",
  isg: "oklch(0.66 0.19 30)",
  ipsa: "oklch(0.75 0.13 210)",
} as const;

export const schoolFoils = {
  epita: "kernel",
  esme: "ampere",
  supbiotech: "enzyme",
  isg: "capital",
  ipsa: "stratosphere",
} as const;

export const durations = {
  fast: 120,
  base: 220,
  slow: 420,
  cinematic: 900,
} as const;

export const easings = {
  out: "cubic-bezier(0.16, 1, 0.3, 1)",
  inOut: "cubic-bezier(0.65, 0, 0.35, 1)",
} as const;

/** Spring presets for Motion (`type: "spring"`). */
export const springs = {
  snappy: { stiffness: 500, damping: 32 },
  soft: { stiffness: 200, damping: 26 },
  bouncy: { stiffness: 320, damping: 14 },
} as const;

export type SchoolColorKey = keyof typeof schoolColors;
