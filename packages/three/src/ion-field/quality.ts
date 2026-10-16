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
  /** Above the manifesto's text (a portrait screen) rather than beside it. */
  readonly above: boolean;
}

/**
 * Where the field condenses: beside the manifesto on wide screens (right
 * half), above it on portrait screens, always fully visible.
 */
export function markPlacementFor(aspect: number, mark: typeof MARK = MARK): MarkPlacement {
  if (aspect >= 1.1) {
    const scale = Math.min(0.5, (aspect * 0.4) / markExtent(mark));
    return { scale, x: aspect * 0.52, y: 0, above: false };
  }
  const scale = Math.min(0.42, markScaleFor(aspect, mark));
  return { scale, x: 0, y: 0.52, above: true };
}

/**
 * Room for more: three frames in four come within this share of the budget.
 * Frames come at a multiple of the display's refresh (16.7 ms at 60 Hz, or
 * at 120 Hz when a frame's work takes more than one refresh), so they are
 * judged against the budget alone: a share that admits 16.7 ms (60 frames a
 * second, as fast as a 60 Hz display shows), and keeps out a 30 Hz display
 * (33 ms, on time there yet over the budget).
 */
const UPGRADE_CEILING = 0.85;

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
 * and once frames have left room under the budget for a while
 * (`upgradeHoldMs`, UPGRADE_CEILING) it asks for the quality back. Each time
 * a quality it gave back proves too much (slow again soon after), it waits
 * twice as long before the next attempt: no back and forth.
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
  const upgradeBelow = budget * (options.upgradeRatio ?? UPGRADE_CEILING);
  // A couple of seconds of room before the first attempt: from the floor, the particles are
  // all back within ten seconds on a device that can afford them. A failed attempt doubles it.
  const baseHold = options.upgradeHoldMs ?? 2000;
  let hold = baseHold;
  let samples: number[] = [];
  let sinceLastChange = 0;
  let msSinceLastChange = 0;
  let lastChange: "degrade" | "upgrade" | null = null;
  const change = (verdict: "degrade" | "upgrade") => {
    if (verdict === "degrade" && lastChange === "upgrade" && msSinceLastChange < 2 * hold) {
      // The quality given back was too much: next time, wait longer (a minute at most).
      hold = Math.min(32 * baseHold, 2 * hold);
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
      const room = (sorted[Math.floor(sorted.length * 0.75)] ?? median) <= upgradeBelow;
      if (canUpgrade && room && msSinceLastChange >= hold) {
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

/** A screen's vsync jitters by a millisecond or two: within this, a frame at the cap's rate is due. */
const FRAME_JITTER_MS = 2.5;

/**
 * Whether the field draws this frame under a frame rate cap (`maxFps`), given
 * the time since the last frame it drew: on a screen faster than the cap it
 * skips the frames between two of its own (every other one at 120 Hz for a
 * cap of 60), and on a screen at the cap's rate it draws every frame, early
 * by a jitter or not. No cap: every frame.
 */
export function frameDue(sinceLastDrawnMs: number, maxFps?: number): boolean {
  if (!maxFps || maxFps <= 0) {
    return true;
  }
  return sinceLastDrawnMs >= 1000 / maxFps - FRAME_JITTER_MS;
}

/**
 * Software rasterisers (no GPU acceleration): the field would hog the main
 * thread for little effect, so the poster stays.
 */
export function isSoftwareRenderer(renderer: string | null | undefined): boolean {
  return /swiftshader|llvmpipe|softpipe|software|basic render|mesa offscreen/i.test(renderer ?? "");
}
