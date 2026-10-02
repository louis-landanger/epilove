"use client";

import { BELL_RATIO, noteFor } from "./notes";

export interface SoundEngine {
  /** Soft tick when hovering an interactive element. */
  tick(): void;
  /** Glass bell, for a tap on the ion field. */
  chime(step: number): void;
  /** Filtered breath when a section comes into view. */
  swell(): void;
  setAudible(audible: boolean): void;
  dispose(): Promise<void>;
}

/**
 * Landing sound design (palier 3): everything is synthesised with Web Audio,
 * no file to download. Quiet by design, behind a compressor, with a slow
 * ambient pad under the interface sounds.
 */
export function createSoundEngine(): SoundEngine {
  const context = new AudioContext();
  const master = context.createGain();
  master.gain.value = 0;
  const limiter = context.createDynamicsCompressor();
  limiter.threshold.value = -18;
  limiter.ratio.value = 8;
  master.connect(limiter).connect(context.destination);

  // Ambient pad: an open fifth and a ninth, slowly breathing through a low-pass filter.
  const padFilter = context.createBiquadFilter();
  padFilter.type = "lowpass";
  padFilter.frequency.value = 700;
  const padGain = context.createGain();
  padGain.gain.value = 0.018;
  padFilter.connect(padGain).connect(master);
  const pad = [110, 164.81, 246.94, 220.5].map((frequency, index) => {
    const oscillator = context.createOscillator();
    oscillator.type = index % 2 === 0 ? "sine" : "triangle";
    oscillator.frequency.value = frequency;
    oscillator.detune.value = (index - 1.5) * 4;
    oscillator.connect(padFilter);
    oscillator.start();
    return oscillator;
  });
  const lfo = context.createOscillator();
  lfo.frequency.value = 0.05;
  const lfoDepth = context.createGain();
  lfoDepth.gain.value = 300;
  lfo.connect(lfoDepth).connect(padFilter.frequency);
  lfo.start();

  const noise = context.createBuffer(1, context.sampleRate, context.sampleRate);
  const samples = noise.getChannelData(0);
  for (let index = 0; index < samples.length; index += 1) {
    samples[index] = Math.random() * 2 - 1;
  }

  let lastTick = 0;

  return {
    tick() {
      const now = context.currentTime;
      if (now - lastTick < 0.06) return;
      lastTick = now;
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.type = "triangle";
      oscillator.frequency.setValueAtTime(1900, now);
      oscillator.frequency.exponentialRampToValueAtTime(1100, now + 0.05);
      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.exponentialRampToValueAtTime(0.035, now + 0.004);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.08);
      oscillator.connect(gain).connect(master);
      oscillator.start(now);
      oscillator.stop(now + 0.1);
    },

    chime(step) {
      const now = context.currentTime;
      const frequency = noteFor(step);
      const carrier = context.createOscillator();
      const modulator = context.createOscillator();
      const modulation = context.createGain();
      const gain = context.createGain();
      carrier.frequency.value = frequency;
      modulator.frequency.value = frequency * BELL_RATIO;
      modulation.gain.setValueAtTime(frequency * 2, now);
      modulation.gain.exponentialRampToValueAtTime(1, now + 1.2);
      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.exponentialRampToValueAtTime(0.07, now + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 1.6);
      modulator.connect(modulation).connect(carrier.frequency);
      carrier.connect(gain).connect(master);
      modulator.start(now);
      carrier.start(now);
      modulator.stop(now + 1.7);
      carrier.stop(now + 1.7);
    },

    swell() {
      const now = context.currentTime;
      const source = context.createBufferSource();
      source.buffer = noise;
      const filter = context.createBiquadFilter();
      filter.type = "bandpass";
      filter.Q.value = 3;
      filter.frequency.setValueAtTime(300, now);
      filter.frequency.exponentialRampToValueAtTime(2200, now + 0.6);
      filter.frequency.exponentialRampToValueAtTime(400, now + 1.2);
      const gain = context.createGain();
      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.exponentialRampToValueAtTime(0.02, now + 0.5);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 1.3);
      source.connect(filter).connect(gain).connect(master);
      source.start(now);
      source.stop(now + 1.4);
    },

    setAudible(audible) {
      const now = context.currentTime;
      master.gain.cancelScheduledValues(now);
      master.gain.setTargetAtTime(audible ? 0.6 : 0, now, audible ? 0.6 : 0.15);
      if (audible && context.state === "suspended") {
        void context.resume();
      }
    },

    async dispose() {
      for (const oscillator of [...pad, lfo]) oscillator.stop();
      await context.close();
    },
  };
}
