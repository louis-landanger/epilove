import { describe, expect, it } from "vitest";
import { oklchToHex } from "./oklch";

describe("oklchToHex", () => {
  it("converts the design tokens", () => {
    expect(oklchToHex("oklch(0.15 0.02 285)")).toBe("#0a0a13");
    expect(oklchToHex("oklch(1 0 0)")).toBe("#ffffff");
    expect(oklchToHex("oklch(0 0 0)")).toBe("#000000");
  });

  it("rejects anything else", () => {
    expect(() => oklchToHex("#fff")).toThrow();
  });
});
