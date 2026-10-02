import { describe, expect, it } from "vitest";
import { canPause, canRequestDeletion, canResume } from "../accounts/lifecycle";
import { emailHint, shouldHoldProfile } from "./moderation";

describe("shouldHoldProfile", () => {
  it("hides at once for P1, from two reporters for P2, never for P3", () => {
    expect(shouldHoldProfile("p1", 1)).toBe(true);
    expect(shouldHoldProfile("p2", 1)).toBe(false);
    expect(shouldHoldProfile("p2", 2)).toBe(true);
    expect(shouldHoldProfile("p3", 10)).toBe(false);
  });
});

describe("emailHint", () => {
  it("keeps only the first two characters and the domain", () => {
    expect(emailHint("camille.martin@epita.fr")).toBe("ca…@epita.fr");
    expect(emailHint("a@isg.fr")).toBe("a…@isg.fr");
  });
});

describe("account lifecycle", () => {
  it("lets only active members pause and paused members resume", () => {
    expect(canPause("active")).toBe(true);
    expect(canPause("restricted")).toBe(false);
    expect(canPause("suspended")).toBe(false);
    expect(canResume("paused")).toBe(true);
    expect(canResume("active")).toBe(false);
  });

  it("always allows deletion once", () => {
    expect(canRequestDeletion("banned")).toBe(true);
    expect(canRequestDeletion("deleting")).toBe(false);
  });
});
