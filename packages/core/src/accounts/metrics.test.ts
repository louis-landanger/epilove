import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { LAUNCH_TARGETS, REPORT_TARGET_HOURS, share, targetState } from "./metrics";

describe("dashboard metrics", () => {
  it("orders report targets by priority", () => {
    expect(REPORT_TARGET_HOURS.p1).toBeLessThan(REPORT_TARGET_HOURS.p2);
    expect(REPORT_TARGET_HOURS.p2).toBeLessThan(REPORT_TARGET_HOURS.p3);
  });

  it("measures nothing without a population", () => {
    expect(share(0, 0)).toBeNull();
    expect(share(3, -1)).toBeNull();
    expect(share(1, 4)).toBe(0.25);
    expect(targetState(null, "activation")).toBe("unknown");
  });

  it("keeps shares between 0 and 1", () => {
    fc.assert(
      fc.property(fc.nat(), fc.integer({ min: 1 }), (part, total) => {
        const value = share(part, total);
        return value !== null && value >= 0 && value <= 1;
      }),
    );
  });

  it("compares against the launch targets", () => {
    expect(targetState(LAUNCH_TARGETS.activation, "activation")).toBe("met");
    expect(targetState(LAUNCH_TARGETS.activation - 0.01, "activation")).toBe("missed");
  });
});
