const STEPS = [0.05, 0.1, 0.2, 0.25, 0.4, 0.5, 0.75, 1, 1.5, 2];

/**
 * Top of the tubes' graduated scale: the smallest round share above the
 * leader's, so the race always reads well. The graduations are labelled, so
 * the picture stays honest whatever the scale.
 */
export function tubeScale(maxShare: number): number {
  const wanted = maxShare * 1.15;
  return STEPS.find((step) => step >= wanted) ?? Math.ceil(wanted);
}

/** Liquid level in [0, 1] for a share on a given scale, with a visible meniscus for any sign-up. */
export function tubeLevel(share: number, scale: number): number {
  if (share <= 0) {
    return 0;
  }
  return Math.min(1, Math.max(0.035, share / scale));
}
