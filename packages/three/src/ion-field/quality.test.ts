import { describe, expect, it } from "vitest";
import {
  canAffordLiveField,
  createFrameMonitor,
  type DeviceProfile,
  isSoftwareRenderer,
  markPlacementFor,
  markScaleFor,
  particleBudget,
} from "./quality";

const laptop: DeviceProfile = {
  cores: 8,
  memoryGb: 8,
  coarsePointer: false,
  saveData: false,
  viewportArea: 1440 * 900,
};
const phone: DeviceProfile = {
  cores: 8,
  memoryGb: 4,
  coarsePointer: true,
  saveData: false,
  viewportArea: 412 * 915,
};

describe("particle budget", () => {
  it("draws the same number of particles whatever the backend, fewer on small and modest devices", () => {
    expect(particleBudget(laptop)).toBe(1600);
    expect(particleBudget(phone)).toBeLessThan(particleBudget(laptop));
    expect(particleBudget({ ...laptop, cores: 4 })).toBeLessThan(particleBudget(laptop));
    // Never fewer than the hero's lattice needs.
    expect(particleBudget({ ...phone, cores: 2, memoryGb: 2 })).toBeGreaterThanOrEqual(640);
  });

  it("always returns pairs", () => {
    for (const profile of [laptop, phone, { ...phone, cores: 3 }, { ...laptop, memoryGb: 3 }]) {
      expect(particleBudget(profile) % 2).toBe(0);
      expect(particleBudget(profile, true) % 2).toBe(0);
    }
  });

  it("gives half as many again to a hero that draws the rivers", () => {
    expect(particleBudget(laptop, true)).toBe(2400);
    expect(particleBudget(phone, true) / particleBudget(phone)).toBeCloseTo(1.5, 2);
  });

  it("keeps the poster on data saver and very small devices", () => {
    expect(canAffordLiveField(laptop)).toBe(true);
    expect(canAffordLiveField({ ...laptop, saveData: true })).toBe(false);
    expect(canAffordLiveField({ ...phone, memoryGb: 1 })).toBe(false);
    expect(canAffordLiveField({ ...phone, cores: 1 })).toBe(false);
  });
});

describe("markScaleFor", () => {
  it("shrinks the mark on portrait screens so the orbit stays visible", () => {
    expect(markScaleFor(16 / 9)).toBe(0.56);
    const portrait = markScaleFor(360 / 740);
    expect(portrait).toBeLessThan(0.56);
    // The tilted orbit's horizontal half-extent stays inside the viewport.
    expect(portrait * 0.89).toBeLessThan(360 / 740);
  });
});

describe("markPlacementFor", () => {
  it.each([16 / 9, 1440 / 900, 1.2, 1, 412 / 915, 360 / 740])(
    "keeps the mark inside the viewport at %f",
    (aspect) => {
      const { scale, x, y } = markPlacementFor(aspect);
      const halfWidth = scale * 0.89;
      expect(x - halfWidth).toBeGreaterThan(-aspect);
      expect(x + halfWidth).toBeLessThan(aspect);
      expect(y + scale * 0.75).toBeLessThan(1);
      expect(y - scale * 0.75).toBeGreaterThan(-1);
    },
  );

  it("sits beside the text on wide screens and above it on portrait screens", () => {
    expect(markPlacementFor(16 / 9).x).toBeGreaterThan(0.5);
    expect(markPlacementFor(360 / 740)).toMatchObject({ x: 0 });
    expect(markPlacementFor(360 / 740).y).toBeGreaterThan(0.3);
  });
});

describe("createFrameMonitor", () => {
  it("asks for less only after a sustained slowdown, then waits", () => {
    const monitor = createFrameMonitor({ window: 10, budgetMs: 20, cooldown: 20 });
    const verdicts = Array.from({ length: 20 }, () => monitor.push(16));
    expect(verdicts.every((verdict) => verdict === "ok")).toBe(true);
    const slow = Array.from({ length: 10 }, () => monitor.push(40));
    expect(slow.filter((verdict) => verdict === "degrade")).toHaveLength(1);
    expect(Array.from({ length: 9 }, () => monitor.push(40)).every((verdict) => verdict === "ok")).toBe(true);
  });

  it("ignores isolated spikes", () => {
    const monitor = createFrameMonitor({ window: 10, budgetMs: 20, cooldown: 0 });
    const verdicts = Array.from({ length: 30 }, (_, index) => monitor.push(index % 5 === 0 ? 80 : 16));
    expect(verdicts).not.toContain("degrade");
  });
});

describe("slow devices", () => {
  it("reacts within seconds when frames are slow, not after hundreds of frames", () => {
    const monitor = createFrameMonitor({
      window: 90,
      windowMs: 1500,
      budgetMs: 24,
      cooldown: 180,
      cooldownMs: 2000,
    });
    const verdicts = Array.from({ length: 12 }, () => monitor.push(300));
    expect(verdicts.indexOf("degrade")).toBeGreaterThanOrEqual(4);
    expect(verdicts.indexOf("degrade")).toBeLessThan(8);
  });

  it("gives up once the quality is at its floor and frames stay far too slow", () => {
    const monitor = createFrameMonitor({ windowMs: 1000, cooldownMs: 1000, budgetMs: 24 });
    const verdicts = Array.from({ length: 10 }, () => monitor.push(250, true));
    expect(verdicts).toContain("give-up");
    const fine = createFrameMonitor({ windowMs: 1000, cooldownMs: 1000, budgetMs: 24 });
    expect(Array.from({ length: 10 }, () => fine.push(40, true))).not.toContain("give-up");
  });

  it("recognises software rasterisers", () => {
    expect(
      isSoftwareRenderer("ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero)), SwiftShader driver)"),
    ).toBe(true);
    expect(isSoftwareRenderer("llvmpipe (LLVM 15.0.7, 256 bits)")).toBe(true);
    expect(isSoftwareRenderer("ANGLE (Apple, ANGLE Metal Renderer: Apple M2, Unspecified Version)")).toBe(
      false,
    );
    expect(isSoftwareRenderer(null)).toBe(false);
  });
});
