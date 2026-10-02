import { describe, expect, it } from "vitest";
import { isValidVoiceSignature, parseRange, signVoiceUrl } from "./voice-url";

const services = {
  emailHmacSecret: () => "test-only-email-hmac-secret-32-characters",
  now: () => new Date("2026-10-02T10:00:00Z"),
};
const id = "0199a000-0000-7000-8000-000000000000";

describe("voice URLs", () => {
  it("signs and checks expiring URLs", () => {
    const url = new URL(signVoiceUrl(services, id), "http://app.test");
    const exp = url.searchParams.get("exp") ?? undefined;
    const sig = url.searchParams.get("sig") ?? undefined;
    expect(url.pathname).toBe(`/api/voice/${id}`);
    expect(isValidVoiceSignature(services, id, exp, sig)).toBe(true);
    expect(isValidVoiceSignature(services, "0199a000-0000-7000-8000-000000000001", exp, sig)).toBe(false);
    expect(isValidVoiceSignature(services, id, String(Number(exp) + 1), sig)).toBe(false);
    const later = { ...services, now: () => new Date("2026-10-02T11:00:01Z") };
    expect(isValidVoiceSignature(later, id, exp, sig)).toBe(false);
  });

  it("parses single byte ranges", () => {
    expect(parseRange("bytes=0-", 100)).toEqual({ start: 0, end: 99 });
    expect(parseRange("bytes=10-19", 100)).toEqual({ start: 10, end: 19 });
    expect(parseRange("bytes=-10", 100)).toEqual({ start: 90, end: 99 });
    expect(parseRange("bytes=50-500", 100)).toEqual({ start: 50, end: 99 });
    expect(parseRange("bytes=200-", 100)).toBeNull();
    expect(parseRange("bytes=0-1,4-5", 100)).toBeNull();
    expect(parseRange(undefined, 100)).toBeNull();
  });
});
