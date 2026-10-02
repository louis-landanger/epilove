/** A minor pentatonic from A4: any sequence of these sounds consonant. */
export const PENTATONIC = [440, 523.25, 587.33, 659.25, 783.99, 880, 1046.5] as const;

/** The note for a step, wrapping around the scale (negative steps too). */
export function noteFor(step: number): number {
  const index = ((Math.trunc(step) % PENTATONIC.length) + PENTATONIC.length) % PENTATONIC.length;
  return PENTATONIC[index] ?? PENTATONIC[0];
}

/** Ratio of the modulator in the FM bell: inharmonic, glassy. */
export const BELL_RATIO = 2.76;

export const SOUND_STORAGE_KEY = "epilove:sound";
