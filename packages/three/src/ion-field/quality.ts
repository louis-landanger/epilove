import { MARK } from "./layout";

/**
 * Adaptive quality of the ion field (docs/02-design.md, section 9): particle
 * budget per device, pixel ratio ceiling, and a frame monitor that lowers the
 * quality when the device cannot keep up. Pure functions, no DOM access.
 */

export interface DeviceProfile {
  /** `navigator.hardwareConcurrency`. */
  readonly cores: number;
  /** `navigator.deviceMemory` in GB when the browser exposes it. */
  readonly memoryGb?: number | undefined;
  /** Touch-first device (`(pointer: coarse)`). */
  readonly coarsePointer: boolean;
  /** Data saver (`navigator.connection.saveData`). */
  readonly saveData: boolean;
  /** Viewport width × height, in CSS pixels. */
  readonly viewportArea: number;
}

/** Below this, the static poster is kept: the field would cost more than it brings. */
export function canAffordLiveField(profile: DeviceProfile): boolean {
  if (profile.saveData) {
    return false;
  }
  if (profile.memoryGb !== undefined && profile.memoryGb < 2) {
    return false;
  }
  return profile.cores >= 2;
}

/**
 * How many particles the field draws: the same whatever the backend (WebGPU
 * or the WebGL2 fallback), so the landing looks the same on every device.
 * The particles are fine, and a few hundred are enough for each shape; touch
 * screens and small windows get fewer, modest machines fewer still. Never
 * fewer than the hero's lattice needs (a pair on each of its nodes, and a
 * reaction's chain). A hero that draws Lyon's rivers (`dense`) gets three
 * and a half times as many: two rivers across the screen, in fine dots,
 * need more particles than a shape.
 */
export function particleBudget(profile: DeviceProfile, dense = false): number {
  const modest = profile.cores <= 4 || (profile.memoryGb !== undefined && profile.memoryGb <= 4);
  const small = profile.coarsePointer || profile.viewportArea < 900 * 700;
  const budget = (small ? 900 : 1600) * (modest ? 0.75 : 1) * (dense ? 3.5 : 1);
  return Math.max(640, Math.floor(budget / 2) * 2);
}

/** Horizontal half-extent of the tilted orbit, in units of its major radius. */
const markExtent = (mark: typeof MARK) =>
  Math.sqrt(Math.cos(mark.tilt) ** 2 + (mark.orbitMinor * Math.sin(mark.tilt)) ** 2);

/** Size of the condensed logo mark, in units of half the viewport height, so it fits narrow screens. */
export function markScaleFor(aspect: number, mark: typeof MARK = MARK): number {
  return Math.min(0.56, (aspect * 0.8) / markExtent(mark));
}

export interface MarkPlacement {
  readonly scale: number;
  /** Centre of the mark in world units (x in [-aspect, aspect], y in [-1, 1]). */
  readonly x: number;
  readonly y: number;
}

/**
 * Where the field condenses: beside the manifesto on wide screens (right
 * half), above it on portrait screens, always fully visible.
 */
export function markPlacementFor(aspect: number, mark: typeof MARK = MARK): MarkPlacement {
  if (aspect >= 1.1) {
    const scale = Math.min(0.5, (aspect * 0.4) / markExtent(mark));
    return { scale, x: aspect * 0.52, y: 0 };
  }
  const scale = Math.min(0.42, markScaleFor(aspect, mark));
  return { scale, x: 0, y: 0.52 };
}

/**
 * Watches real frame times and asks for a lower quality when the median of
 * the recent frames exceeds the budget. The window and the cooldown are
 * counted in frames *and* in time, whichever comes first, so that a device
 * drawing three frames a second reacts in a couple of seconds, not minutes.
 * `canGiveUp` tells it the quality is already at its floor: a frame rate
 * still far below the budget then means "stop, keep the poster".
 *
 * A slowdown is often only a moment (a heavy section, another tab, the
 * garbage collector): `canUpgrade` tells it the quality is below its best,
 * and once frames have been fast for a while (well under the budget, for
 * `upgradeHoldMs`) it asks for the quality back. Each time a quality it gave
 * back proves too much (slow again soon after), it waits twice as long
 * before the next attempt: no back and forth.
 */
export function createFrameMonitor(
  options: {
    window?: number;
    windowMs?: number;
    budgetMs?: number;
    cooldown?: number;
    cooldownMs?: number;
    upgradeRatio?: number;
    upgradeHoldMs?: number;
  } = {},
) {
  const size = options.window ?? 90;
  const windowMs = options.windowMs ?? 1500;
  const budget = options.budgetMs ?? 24;
  const cooldown = options.cooldown ?? 180;
  const cooldownMs = options.cooldownMs ?? 2000;
  const upgradeBelow = budget * (options.upgradeRatio ?? 0.45);
  const baseHold = options.upgradeHoldMs ?? 4000;
  let hold = baseHold;
  let samples: number[] = [];
  let sinceLastChange = 0;
  let msSinceLastChange = 0;
  let lastChange: "degrade" | "upgrade" | null = null;
  const change = (verdict: "degrade" | "upgrade") => {
    if (verdict === "degrade" && lastChange === "upgrade" && msSinceLastChange < 2 * hold) {
      // The quality given back was too much: next time, wait longer.
      hold = Math.min(16 * baseHold, 2 * hold);
    }
    lastChange = verdict;
    samples = [];
    sinceLastChange = 0;
    msSinceLastChange = 0;
    return verdict;
  };
  return {
    push(frameMs: number, canGiveUp = false, canUpgrade = false): "ok" | "degrade" | "give-up" | "upgrade" {
      samples.push(frameMs);
      sinceLastChange += 1;
      msSinceLastChange += frameMs;
      while (samples.length > size) {
        samples.shift();
      }
      const elapsed = samples.reduce((sum, sample) => sum + sample, 0);
      const fullWindow = samples.length >= size || (samples.length >= 5 && elapsed >= windowMs);
      if (!fullWindow) {
        return "ok";
      }
      const sorted = [...samples].sort((a, b) => a - b);
      const median = sorted[Math.floor(sorted.length / 2)] ?? 0;
      if (canUpgrade && median <= upgradeBelow && msSinceLastChange >= hold) {
        return change("upgrade");
      }
      const cooledDown = sinceLastChange >= cooldown || msSinceLastChange >= cooldownMs;
      if (!cooledDown || median <= budget) {
        return "ok";
      }
      if (canGiveUp && median > budget * 3) {
        samples = [];
        sinceLastChange = 0;
        msSinceLastChange = 0;
        return "give-up";
      }
      return change("degrade");
    },
    reset() {
      samples = [];
      sinceLastChange = 0;
      msSinceLastChange = 0;
    },
  };
}

/**
 * Software rasterisers (no GPU acceleration): the field would hog the main
 * thread for little effect, so the poster stays.
 */
export function isSoftwareRenderer(renderer: string | null | undefined): boolean {
  return /swiftshader|llvmpipe|softpipe|software|basic render|mesa offscreen/i.test(renderer ?? "");
}
