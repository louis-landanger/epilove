import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { isAttemptFresh, pickGesture, VERIFICATION_GESTURES, verificationBlocker } from "./verification";

describe("photo verification (ONB-08)", () => {
  it("never repeats the previous gesture", () => {
    fc.assert(
      fc.property(
        fc.double({ min: 0, max: 1, maxExcluded: true, noNaN: true }),
        fc.constantFrom(...VERIFICATION_GESTURES),
        (r, previous) => {
          const gesture = pickGesture(() => r, previous);
          return gesture !== previous && VERIFICATION_GESTURES.includes(gesture);
        },
      ),
    );
    expect(pickGesture(() => 0.999_999)).toBe(VERIFICATION_GESTURES.at(-1));
  });

  it("needs a photo to compare with, one attempt at a time", () => {
    expect(verificationBlocker({ verified: false, comparablePhotos: 0, attemptInReview: false })).toBe(
      "no_photo",
    );
    expect(verificationBlocker({ verified: false, comparablePhotos: 2, attemptInReview: true })).toBe(
      "in_review",
    );
    expect(verificationBlocker({ verified: true, comparablePhotos: 2, attemptInReview: false })).toBe(
      "verified",
    );
    expect(verificationBlocker({ verified: false, comparablePhotos: 1, attemptInReview: false })).toBeNull();
  });

  it("keeps a gesture valid for 15 minutes", () => {
    const start = new Date("2026-10-02T10:00:00Z");
    expect(isAttemptFresh(start, new Date("2026-10-02T10:14:59Z"))).toBe(true);
    expect(isAttemptFresh(start, new Date("2026-10-02T10:15:01Z"))).toBe(false);
    expect(isAttemptFresh(start, new Date("2026-10-02T09:59:00Z"))).toBe(false);
  });
});
