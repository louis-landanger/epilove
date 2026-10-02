import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { isUuidv7, uuidv7, uuidv7Time } from "./ids";

describe("uuidv7", () => {
  it("encodes the timestamp, the version and the variant", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 2 ** 48 - 1 }),
        fc.uint8Array({ minLength: 10, maxLength: 10 }),
        (time, random) => {
          const id = uuidv7(time, random);
          expect(isUuidv7(id)).toBe(true);
          expect(uuidv7Time(id)).toBe(time);
        },
      ),
    );
  });

  it("sorts by time", () => {
    const random = new Uint8Array(10).fill(255);
    const earlier = uuidv7(1_700_000_000_000, random);
    const later = uuidv7(1_700_000_000_001, new Uint8Array(10));
    expect(earlier < later).toBe(true);
  });

  it("rejects invalid input", () => {
    expect(() => uuidv7(-1, new Uint8Array(10))).toThrow();
    expect(() => uuidv7(1, new Uint8Array(4))).toThrow();
    expect(isUuidv7("01920000-0000-4000-8000-000000000000")).toBe(false);
  });
});
