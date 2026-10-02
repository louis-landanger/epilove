/**
 * Voice prompts (PRO-06): rules shared by the recorder, the API and the
 * worker. The written answer doubles as the transcript.
 */

/** What browsers record: WebM/Opus (Chromium, Firefox), MP4/AAC (Safari), Ogg/Opus. */
export const VOICE_CONTENT_TYPES = ["audio/webm", "audio/mp4", "audio/ogg"] as const;
export type VoiceContentType = (typeof VOICE_CONTENT_TYPES)[number];

export const VOICE_MAX_DURATION_MS = 30_000;
/** 30 s of speech fits in well under 1 MB at the bitrates browsers use. */
export const VOICE_MAX_BYTES = 1024 * 1024;
/** Bars of the waveform, each from 0 to 100. */
export const VOICE_PEAK_COUNT = 48;

/** The recorder's MIME type without parameters (`audio/webm;codecs=opus` → `audio/webm`). */
export function baseVoiceType(mimeType: string): VoiceContentType | null {
  const base = mimeType.split(";")[0]?.trim().toLowerCase();
  return (VOICE_CONTENT_TYPES as readonly string[]).includes(base ?? "") ? (base as VoiceContentType) : null;
}

export function isValidPeaks(peaks: readonly number[]): boolean {
  return (
    peaks.length === VOICE_PEAK_COUNT &&
    peaks.every((peak) => Number.isInteger(peak) && peak >= 0 && peak <= 100)
  );
}
