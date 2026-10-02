import { describe, expect, it } from "vitest";
import { normalizeWatermark, WATERMARK_PATTERN, watermarkCode } from "./watermark";

const SECRET = "test-only-email-hmac-secret-32-characters";

describe("watermark codes (SAF-12)", () => {
  it("is stable per member and different between members", () => {
    const a = watermarkCode(SECRET, "0199a000-0000-7000-8000-000000000001");
    const b = watermarkCode(SECRET, "0199a000-0000-7000-8000-000000000002");
    expect(a).toMatch(WATERMARK_PATTERN);
    expect(watermarkCode(SECRET, "0199a000-0000-7000-8000-000000000001")).toBe(a);
    expect(a).not.toBe(b);
    expect(
      watermarkCode("another-secret-another-secret-123", "0199a000-0000-7000-8000-000000000001"),
    ).not.toBe(a);
  });

  it("reads codes typed back from a screenshot", () => {
    expect(normalizeWatermark("7kq2 xa9m")).toBe("7KQ2-XA9M");
    expect(normalizeWatermark("7KQ2-XA9O")).toBe("7KQ2-XA90");
    expect(normalizeWatermark("7KQ2")).toBeNull();
    expect(normalizeWatermark("7KQ2-XA9U")).toBeNull();
  });
});
