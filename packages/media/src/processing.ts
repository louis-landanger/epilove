import sharp, { type Metadata } from "sharp";
import { rgbaToThumbHash } from "thumbhash";
import { PHOTO_MAX_EDGE, PHOTO_MIN_EDGE } from "./policy";

/**
 * Photo processing, run by the worker on every upload (docs/04-architecture.md,
 * section 4.4). The file is decoded by libvips whatever its declared type, so
 * the real format is checked, then re-encoded from pixels: EXIF (GPS position,
 * device), ICC comments and any embedded payload are dropped.
 */
export const ACCEPTED_FORMATS = ["jpeg", "png", "webp", "heif", "avif"] as const;

export type PhotoRejection = "unsupported_format" | "too_small" | "unreadable";

export type ProcessedPhoto =
  | {
      readonly ok: true;
      readonly bytes: Uint8Array;
      readonly width: number;
      readonly height: number;
      /** Base64 ThumbHash, shown blurred while the photo loads. */
      readonly thumbhash: string;
    }
  | { readonly ok: false; readonly reason: PhotoRejection };

// Decompression bombs: refuse anything above 50 megapixels before decoding.
const LIMIT_INPUT_PIXELS = 50_000_000;

export async function processPhoto(input: Uint8Array): Promise<ProcessedPhoto> {
  let metadata: Metadata;
  try {
    metadata = await sharp(input, { limitInputPixels: LIMIT_INPUT_PIXELS }).metadata();
  } catch {
    return { ok: false, reason: "unreadable" };
  }
  if (!metadata.format || !(ACCEPTED_FORMATS as readonly string[]).includes(metadata.format)) {
    return { ok: false, reason: "unsupported_format" };
  }

  try {
    // `autoOrient` applies the EXIF orientation before the metadata is dropped.
    const pipeline = sharp(input, { limitInputPixels: LIMIT_INPUT_PIXELS, pages: 1 }).autoOrient();
    const { data, info } = await pipeline
      .clone()
      .resize({ width: PHOTO_MAX_EDGE, height: PHOTO_MAX_EDGE, fit: "inside", withoutEnlargement: true })
      .webp({ quality: 82, effort: 4 })
      .toBuffer({ resolveWithObject: true });

    if (Math.min(info.width, info.height) < PHOTO_MIN_EDGE) {
      return { ok: false, reason: "too_small" };
    }

    const thumb = await pipeline
      .clone()
      .resize({ width: 100, height: 100, fit: "inside" })
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    const hash = rgbaToThumbHash(thumb.info.width, thumb.info.height, thumb.data);

    return {
      ok: true,
      bytes: new Uint8Array(data),
      width: info.width,
      height: info.height,
      thumbhash: Buffer.from(hash).toString("base64"),
    };
  } catch {
    return { ok: false, reason: "unreadable" };
  }
}
