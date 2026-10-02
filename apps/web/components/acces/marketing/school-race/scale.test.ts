import { describe, expect, it } from "vitest";
import { tubeLevel, tubeScale } from "./scale";

describe("tubeScale", () => {
  it("picks the smallest round step above the leader", () => {
    expect(tubeScale(0)).toBe(0.05);
    expect(tubeScale(0.012)).toBe(0.05);
    expect(tubeScale(0.09)).toBe(0.2);
    expect(tubeScale(0.3)).toBe(0.4);
    expect(tubeScale(0.95)).toBe(1.5);
    expect(tubeScale(3)).toBe(4);
  });
});

describe("tubeLevel", () => {
  it("is empty without sign-ups, visible with one, and capped at the top", () => {
    expect(tubeLevel(0, 0.05)).toBe(0);
    expect(tubeLevel(0.0001, 0.05)).toBe(0.035);
    expect(tubeLevel(0.025, 0.05)).toBe(0.5);
    expect(tubeLevel(2, 1)).toBe(1);
  });
});
