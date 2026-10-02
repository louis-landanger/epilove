import { deflateSync } from "node:zlib";
import type { Random } from "./random";

/**
 * Synthetic profile pictures for development: gradients, glowing particles
 * and orbits in the app's palette. Never a face, never a real person
 * (docs/04-architecture.md, section 8).
 */

type Rgb = readonly [number, number, number];

const hex = (value: string): Rgb => [
  Number.parseInt(value.slice(1, 3), 16),
  Number.parseInt(value.slice(3, 5), 16),
  Number.parseInt(value.slice(5, 7), 16),
];

/** sRGB approximations of the OKLCH tokens (packages/tokens). */
export const SCHOOL_RGB: Readonly<Record<string, Rgb>> = {
  epita: hex("#4a7cf0"),
  esme: hex("#e8b23a"),
  supbiotech: hex("#3fc47a"),
  isg: hex("#f0684a"),
  ipsa: hex("#3fb8d6"),
};
const INK = hex("#14111e");
const ACCENTS: readonly Rgb[] = [hex("#f0408c"), hex("#c8f04a"), hex("#f3efe6"), hex("#8a5cf6")];

export const PHOTO_WIDTH = 480;
export const PHOTO_HEIGHT = 600;

interface Blob {
  readonly x: number;
  readonly y: number;
  readonly radius: number;
  readonly color: Rgb;
  readonly strength: number;
}

interface Ring {
  readonly x: number;
  readonly y: number;
  readonly radius: number;
  readonly width: number;
  readonly color: Rgb;
}

/** Renders one abstract picture as raw RGB bytes. */
function render(random: Random, schoolSlug: string): Uint8Array {
  const width = PHOTO_WIDTH;
  const height = PHOTO_HEIGHT;
  const base = SCHOOL_RGB[schoolSlug] ?? ACCENTS[0] ?? INK;
  const second = random.pick([...ACCENTS, ...Object.values(SCHOOL_RGB)]);
  const angle = random.next() * Math.PI * 2;
  const dx = Math.cos(angle);
  const dy = Math.sin(angle);
  const darkness = 0.35 + random.next() * 0.35;

  const blobs: Blob[] = Array.from({ length: random.int(2, 5) }, () => ({
    x: random.next() * width,
    y: random.next() * height,
    radius: 60 + random.next() * 220,
    color: random.chance(0.5) ? base : random.pick(ACCENTS),
    strength: 0.35 + random.next() * 0.55,
  }));
  const rings: Ring[] = Array.from({ length: random.int(0, 3) }, () => ({
    x: random.next() * width,
    y: random.next() * height,
    radius: 80 + random.next() * 260,
    width: 1.2 + random.next() * 2.5,
    color: random.pick(ACCENTS),
  }));
  const grainSeed = random.int(1, 1_000_000);

  const pixels = new Uint8Array(width * height * 3);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      // Diagonal gradient from the school colour to a second colour, over ink.
      const t = Math.min(1, Math.max(0, ((x / width - 0.5) * dx + (y / height - 0.5) * dy) * 0.9 + 0.5));
      let r = (base[0] * (1 - t) + second[0] * t) * (1 - darkness) + INK[0] * darkness;
      let g = (base[1] * (1 - t) + second[1] * t) * (1 - darkness) + INK[1] * darkness;
      let b = (base[2] * (1 - t) + second[2] * t) * (1 - darkness) + INK[2] * darkness;

      for (const blob of blobs) {
        const distance = Math.hypot(x - blob.x, y - blob.y) / blob.radius;
        if (distance < 1.6) {
          const glow = Math.exp(-distance * distance * 2.2) * blob.strength;
          r += (blob.color[0] - r) * glow;
          g += (blob.color[1] - g) * glow;
          b += (blob.color[2] - b) * glow;
        }
      }
      for (const ring of rings) {
        const edge = Math.abs(Math.hypot(x - ring.x, y - ring.y) - ring.radius);
        if (edge < ring.width * 2) {
          const alpha = Math.max(0, 1 - edge / (ring.width * 2)) * 0.8;
          r += (ring.color[0] - r) * alpha;
          g += (ring.color[1] - g) * alpha;
          b += (ring.color[2] - b) * alpha;
        }
      }

      // Light film grain (deterministic hash of the position).
      const hash = Math.sin((x * 12.9898 + y * 78.233 + grainSeed) * 0.001) * 43_758.5453;
      const grain = (hash - Math.floor(hash) - 0.5) * 10;

      const offset = (y * width + x) * 3;
      pixels[offset] = clamp(r + grain);
      pixels[offset + 1] = clamp(g + grain);
      pixels[offset + 2] = clamp(b + grain);
    }
  }
  return pixels;
}

const clamp = (value: number) => Math.max(0, Math.min(255, Math.round(value)));

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc = (CRC_TABLE[(crc ^ byte) & 0xff] ?? 0) ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Uint8Array): Buffer {
  const typeAndData = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(typeAndData));
  return Buffer.concat([length, typeAndData, crc]);
}

/** Minimal PNG encoder (8-bit RGB, no interlacing): enough for synthetic pictures. */
export function encodePng(width: number, height: number, rgb: Uint8Array): Buffer {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8; // bit depth
  header[9] = 2; // colour type: RGB
  const stride = width * 3;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0; // filter: none
    raw.set(rgb.subarray(y * stride, (y + 1) * stride), y * (stride + 1) + 1);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", header),
    chunk("IDAT", deflateSync(raw, { level: 6 })),
    chunk("IEND", new Uint8Array()),
  ]);
}

/** A synthetic profile picture as a PNG file. */
export function syntheticPhoto(random: Random, schoolSlug: string): Buffer {
  return encodePng(PHOTO_WIDTH, PHOTO_HEIGHT, render(random, schoolSlug));
}
