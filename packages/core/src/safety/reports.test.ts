import { describe, expect, it } from "vitest";
import { REPORT_REASONS, reportPriority } from "./reports";

describe("reportPriority", () => {
  it("treats threats and minors as the most urgent", () => {
    expect(reportPriority("threat")).toBe("p1");
    expect(reportPriority("minor")).toBe("p1");
    expect(reportPriority("harassment")).toBe("p2");
    expect(reportPriority("spam")).toBe("p3");
  });

  it("assigns a priority to every reason", () => {
    for (const reason of REPORT_REASONS) {
      expect(["p1", "p2", "p3"]).toContain(reportPriority(reason));
    }
  });
});
