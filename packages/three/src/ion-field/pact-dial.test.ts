import { describe, expect, it } from "vitest";
import { FORMATION_STRIDE, loadPactDial, writeFormations } from "./formations";
import { createIonFieldLayout } from "./layout";

describe("loadPactDial", () => {
  it("rings the Pact's stage until its dial is in, then draws the dial", async () => {
    const layout = createIonFieldLayout(400);
    const pact = { weight: 1, x: 0.2, y: -0.1, radius: 0.5, seconds: 30 };
    const write = () => {
      const targets = new Float32Array(layout.count * FORMATION_STRIDE);
      writeFormations(targets, new Float32Array(targets.length), layout, { pact }, null, 3, 2 / 900);
      return targets;
    };
    const radii = (targets: Float32Array) =>
      Array.from({ length: layout.count }, (_, index) =>
        Math.hypot(
          (targets[index * FORMATION_STRIDE] ?? 0) - pact.x,
          (targets[index * FORMATION_STRIDE + 1] ?? 0) - pact.y,
        ),
      );
    // Not asked for yet: every particle on a ring round the stage, held.
    for (const radius of radii(write())) {
      expect(radius).toBeCloseTo(pact.radius, 6);
    }
    const first = loadPactDial();
    expect(loadPactDial()).toBe(first);
    await first;
    // In: the dial's ticks reach inside the ring.
    expect(Math.min(...radii(write()))).toBeLessThan(pact.radius * 0.85);
  });
});
