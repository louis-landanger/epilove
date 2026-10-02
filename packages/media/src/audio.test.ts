import { baseVoiceType, isValidPeaks } from "@epilove/core";
import { describe, expect, it } from "vitest";
import { sniffAudio, voiceKey } from "./audio";

describe("voice prompts (PRO-06)", () => {
  it("recognises the containers browsers record", () => {
    expect(sniffAudio(new Uint8Array([0x1a, 0x45, 0xdf, 0xa3, 0x01]))).toBe("audio/webm");
    expect(sniffAudio(new TextEncoder().encode("\u0000\u0000\u0000 ftypM4A isom"))).toBe("audio/mp4");
    expect(sniffAudio(new TextEncoder().encode("OggS\u0000\u0002"))).toBe("audio/ogg");
    expect(sniffAudio(new TextEncoder().encode("<html>"))).toBeNull();
    expect(sniffAudio(new Uint8Array())).toBeNull();
  });

  it("normalises recorder MIME types", () => {
    expect(baseVoiceType("audio/webm;codecs=opus")).toBe("audio/webm");
    expect(baseVoiceType("audio/mp4")).toBe("audio/mp4");
    expect(baseVoiceType("video/webm")).toBeNull();
  });

  it("checks the waveform and builds keys", () => {
    expect(isValidPeaks(Array.from({ length: 48 }, (_, index) => index))).toBe(true);
    expect(isValidPeaks([1, 2, 3])).toBe(false);
    expect(isValidPeaks(Array.from({ length: 48 }, () => 101))).toBe(false);
    const id = "0199a000-0000-7000-8000-000000000000";
    expect(voiceKey(id, id, "audio/mp4")).toBe(`voices/${id}/${id}.m4a`);
    expect(() => voiceKey("../x", id, "audio/webm")).toThrow();
  });
});
