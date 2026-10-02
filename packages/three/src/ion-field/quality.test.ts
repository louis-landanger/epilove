import { describe, expect, it } from "vitest";
import {
  canAffordLiveField,
  createFrameMonitor,
  type DeviceProfile,
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
  it("gives GPU compute many more ions than the CPU fallback", () => {
    expect(particleBudget("webgpu", laptop)).toBe(8000);
    expect(particleBudget("webgl2", laptop)).toBe(2200);
    expect(particleBudget("webgpu", phone)).toBeLessThan(particleBudget("webgpu", laptop));
    expect(particleBudget("webgl2", { ...phone, cores: 2, memoryGb: 2 })).toBeGreaterThanOrEqual(400);
  });

  it("always returns pairs", () => {
    for (const profile of [laptop, phone, { ...phone, cores: 3 }]) {
      expect(particleBudget("webgl2", profile) % 2).toBe(0);
      expect(particleBudget("webgpu", profile) % 2).toBe(0);
    }
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
