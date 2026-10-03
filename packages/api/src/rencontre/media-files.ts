/**
 * Conversation media checks (CHAT-06, CHAT-07): the real type is read from
 * the bytes (never trusted from the client), and image metadata (EXIF with
 * GPS position, XMP, comments) is removed before anything is stored.
 */
export type ImageType = "image/jpeg" | "image/png" | "image/webp";
export type AudioType = "audio/webm" | "audio/ogg" | "audio/mp4";

const ascii = (bytes: Uint8Array, start: number, length: number) =>
  String.fromCharCode(...bytes.subarray(start, start + length));

export function sniffImage(bytes: Uint8Array): ImageType | null {
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return "image/jpeg";
  }
  if (ascii(bytes, 0, 8) === "\x89PNG\r\n\x1a\n") {
    return "image/png";
  }
  if (ascii(bytes, 0, 4) === "RIFF" && ascii(bytes, 8, 4) === "WEBP") {
    return "image/webp";
  }
  return null;
}

export function sniffAudio(bytes: Uint8Array): AudioType | null {
  if (bytes[0] === 0x1a && bytes[1] === 0x45 && bytes[2] === 0xdf && bytes[3] === 0xa3) {
    return "audio/webm";
  }
  if (ascii(bytes, 0, 4) === "OggS") {
    return "audio/ogg";
  }
  if (ascii(bytes, 4, 4) === "ftyp") {
    return "audio/mp4";
  }
  return null;
}

/** JPEG segments that carry metadata: APP1 (EXIF, XMP), APP12, APP13 (IPTC), comments. */
const JPEG_DROPPED = new Set([0xe1, 0xec, 0xed, 0xfe]);

function stripJpeg(bytes: Uint8Array): Uint8Array {
  const parts: Uint8Array[] = [bytes.subarray(0, 2)];
  let offset = 2;
  while (offset + 4 <= bytes.length) {
    if (bytes[offset] !== 0xff) {
      throw new Error("Malformed JPEG.");
    }
    const marker = bytes[offset + 1] as number;
    if (marker === 0xda) {
      // Start of scan: compressed data until the end, kept as is.
      parts.push(bytes.subarray(offset));
      return concat(parts);
    }
    const length = ((bytes[offset + 2] as number) << 8) | (bytes[offset + 3] as number);
    const end = offset + 2 + length;
    if (length < 2 || end > bytes.length) {
      throw new Error("Malformed JPEG.");
    }
    if (!JPEG_DROPPED.has(marker)) {
      parts.push(bytes.subarray(offset, end));
    }
    offset = end;
  }
  throw new Error("Malformed JPEG.");
}

const PNG_DROPPED = new Set(["tEXt", "zTXt", "iTXt", "eXIf", "tIME"]);

function stripPng(bytes: Uint8Array): Uint8Array {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const parts: Uint8Array[] = [bytes.subarray(0, 8)];
  let offset = 8;
  while (offset + 12 <= bytes.length) {
    const length = view.getUint32(offset);
    const end = offset + 12 + length;
    if (end > bytes.length) {
      throw new Error("Malformed PNG.");
    }
    if (!PNG_DROPPED.has(ascii(bytes, offset + 4, 4))) {
      parts.push(bytes.subarray(offset, end));
    }
    offset = end;
  }
  return concat(parts);
}

function stripWebp(bytes: Uint8Array): Uint8Array {
  const parts: Uint8Array[] = [];
  let offset = 12;
  while (offset + 8 <= bytes.length) {
    const fourcc = ascii(bytes, offset, 4);
    const size = new DataView(bytes.buffer, bytes.byteOffset + offset + 4, 4).getUint32(0, true);
    const end = offset + 8 + size + (size % 2);
    if (offset + 8 + size > bytes.length) {
      throw new Error("Malformed WebP.");
    }
    if (fourcc !== "EXIF" && fourcc !== "XMP ") {
      const chunk = bytes.slice(offset, Math.min(end, bytes.length));
      if (fourcc === "VP8X" && chunk.length > 8) {
        // Clear the "has EXIF" (0x08) and "has XMP" (0x04) flags.
        chunk[8] = (chunk[8] as number) & ~0x0c;
      }
      parts.push(chunk);
    }
    offset = end;
  }
  const body = concat(parts);
  const header = new Uint8Array(12);
  header.set(bytes.subarray(0, 4), 0);
  new DataView(header.buffer).setUint32(4, body.length + 4, true);
  header.set(bytes.subarray(8, 12), 8);
  return concat([header, body]);
}

/** The image without its metadata. Throws on a malformed file. */
export function stripImageMetadata(bytes: Uint8Array, type: ImageType): Uint8Array {
  switch (type) {
    case "image/jpeg":
      return stripJpeg(bytes);
    case "image/png":
      return stripPng(bytes);
    case "image/webp":
      return stripWebp(bytes);
  }
}

function concat(parts: readonly Uint8Array[]): Uint8Array {
  const result = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
  let offset = 0;
  for (const part of parts) {
    result.set(part, offset);
    offset += part.length;
  }
  return result;
}

/**
 * Explicit image detection (CHAT-06, SAF-11), behind an interface: the real
 * classifier (open source, self-hosted, docs/07) plugs in here. The default
 * flags nothing, so images are shown unblurred until a model is deployed.
 */
export interface ImageClassifier {
  classify(bytes: Uint8Array, type: ImageType): Promise<{ readonly explicit: number }>;
}

/** Above this probability, the recipient sees the image blurred first. */
export const EXPLICIT_THRESHOLD = 0.7;

let classifier: ImageClassifier = { classify: async () => ({ explicit: 0 }) };

export function imageClassifier(): ImageClassifier {
  return classifier;
}

export function setImageClassifier(next: ImageClassifier | undefined) {
  classifier = next ?? { classify: async () => ({ explicit: 0 }) };
}
