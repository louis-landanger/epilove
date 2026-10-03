/**
 * Seeded pseudo-random generator (mulberry32): the development data set is the
 * same on every machine and every run. Not for anything security-related.
 */
export class Random {
  private state: number;

  constructor(seed: number) {
    this.state = seed >>> 0;
  }

  /** Uniform float in [0, 1). */
  next(): number {
    this.state = (this.state + 0x6d2b79f5) >>> 0;
    let t = this.state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
  }

  /** Integer in [min, max], both included. */
  int(min: number, max: number): number {
    return min + Math.floor(this.next() * (max - min + 1));
  }

  chance(probability: number): boolean {
    return this.next() < probability;
  }

  pick<T>(items: readonly T[]): T {
    if (items.length === 0) {
      throw new Error("Cannot pick from an empty list.");
    }
    return items[Math.floor(this.next() * items.length)] as T;
  }

  /** Picks a key according to its weight. */
  weighted<T extends string>(weights: Readonly<Record<T, number>>): T {
    const entries = Object.entries(weights) as [T, number][];
    const total = entries.reduce((sum, [, weight]) => sum + weight, 0);
    let roll = this.next() * total;
    for (const [key, weight] of entries) {
      roll -= weight;
      if (roll < 0) {
        return key;
      }
    }
    return (entries.at(-1) as [T, number])[0];
  }

  /** `count` distinct items, in random order. */
  sample<T>(items: readonly T[], count: number): T[] {
    const copy = [...items];
    for (let i = copy.length - 1; i > 0; i--) {
      const j = Math.floor(this.next() * (i + 1));
      [copy[i], copy[j]] = [copy[j] as T, copy[i] as T];
    }
    return copy.slice(0, Math.min(count, copy.length));
  }

  /** A child generator, so that adding draws in one place does not reshuffle everything else. */
  fork(label: string): Random {
    let hash = this.state ^ 0x9e3779b9;
    for (let i = 0; i < label.length; i++) {
      hash = Math.imul(hash ^ label.charCodeAt(i), 0x01000193) >>> 0;
    }
    return new Random(hash);
  }
}
