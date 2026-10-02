import { describe, expect, it } from "vitest";
import { UUID_PATTERN, uuidv7, uuidv7Timestamp } from "./uuidv7";

describe("uuidv7", () => {
  it("has the version 7 and RFC variant bits", () => {
    const id = uuidv7();
    expect(id).toMatch(UUID_PATTERN);
    expect(id[14]).toBe("7");
    expect(["8", "9", "a", "b"]).toContain(id[19]);
  });

  it("encodes the timestamp and sorts by time", () => {
    const earlier = uuidv7(1_790_000_000_000);
    const later = uuidv7(1_790_000_000_001);
    expect(uuidv7Timestamp(earlier)).toBe(1_790_000_000_000);
    expect(earlier < later).toBe(true);
  });

  it("does not repeat", () => {
    const ids = new Set(Array.from({ length: 1000 }, () => uuidv7(0)));
    expect(ids.size).toBe(1000);
  });
});
