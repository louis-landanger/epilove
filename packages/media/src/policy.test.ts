import { describe, expect, it } from "vitest";
import { photoKey, quarantineKey } from "./policy";

describe("storage keys", () => {
  const user = "01920000-0000-7000-8000-000000000001";
  const photo = "01920000-0000-7000-8000-000000000002";

  it("separates quarantine from published photos", () => {
    expect(quarantineKey(user, photo)).toBe(`quarantine/${user}/${photo}`);
    expect(photoKey(user, photo)).toBe(`photos/${user}/${photo}.webp`);
  });

  it("refuses anything that is not an identifier", () => {
    expect(() => quarantineKey("../etc", photo)).toThrow();
    expect(() => photoKey(user, "a/b")).toThrow();
  });
});
