import type { VoiceContentType } from "@atomes/core";

/** Voice prompts (PRO-06): storage keys and format checks. Safe in client components. */

const EXTENSIONS: Record<VoiceContentType, string> = {
  "audio/webm": "webm",
  "audio/mp4": "m4a",
  "audio/ogg": "ogg",
};

const ID = /^[0-9a-f-]{36}$/;

/** The published recording. */
export function voiceKey(userId: string, voiceId: string, contentType: VoiceContentType): string {
  if (!ID.test(userId) || !ID.test(voiceId)) {
    throw new Error("Invalid identifier.");
  }
  return `voices/${userId}/${voiceId}.${EXTENSIONS[contentType]}`;
}

/** The container actually present in the bytes, whatever the declared type. */
export function sniffAudio(bytes: Uint8Array): VoiceContentType | null {
  const ascii = (start: number, length: number) =>
    String.fromCharCode(...bytes.subarray(start, start + length));
  if (bytes.length >= 4 && bytes[0] === 0x1a && bytes[1] === 0x45 && bytes[2] === 0xdf && bytes[3] === 0xa3) {
    return "audio/webm";
  }
  if (bytes.length >= 12 && ascii(4, 4) === "ftyp") {
    return "audio/mp4";
  }
  if (bytes.length >= 4 && ascii(0, 4) === "OggS") {
    return "audio/ogg";
  }
  return null;
}
