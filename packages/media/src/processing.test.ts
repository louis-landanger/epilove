import sharp from "sharp";
import { thumbHashToApproximateAspectRatio } from "thumbhash";
import { describe, expect, it } from "vitest";
import { processPhoto } from "./processing";

async function jpegWithExif(width: number, height: number) {
  return new Uint8Array(
    await sharp({ create: { width, height, channels: 3, background: { r: 200, g: 40, b: 120 } } })
      .withExif({ IFD0: { Make: "Phone", Model: "Secret model" }, IFD3: { GPSLatitudeRef: "N" } })
      .jpeg()
      .toBuffer(),
  );
}

describe("processPhoto", () => {
  it("re-encodes to WebP without metadata and computes a ThumbHash", async () => {
    const input = await jpegWithExif(1200, 1500);
    expect((await sharp(input).metadata()).exif).toBeDefined();

    const result = await processPhoto(input);
    if (!result.ok) throw new Error(result.reason);
    const output = await sharp(result.bytes).metadata();
    expect(output.format).toBe("webp");
    expect(output.exif).toBeUndefined();
    expect([result.width, result.height]).toEqual([1200, 1500]);
    const hash = Buffer.from(result.thumbhash, "base64");
    // Portrait: the hash encodes an approximate aspect ratio.
    expect(thumbHashToApproximateAspectRatio(hash)).toBeLessThan(1);
  });

  it("downsizes very large photos", async () => {
    const result = await processPhoto(await jpegWithExif(4000, 3000));
    if (!result.ok) throw new Error(result.reason);
    expect([result.width, result.height]).toEqual([2048, 1536]);
  });

  it("applies the EXIF orientation before dropping it", async () => {
    const rotated = new Uint8Array(
      await sharp({ create: { width: 800, height: 400, channels: 3, background: "#123456" } })
        .withMetadata({ orientation: 6 })
        .jpeg()
        .toBuffer(),
    );
    const result = await processPhoto(rotated);
    if (!result.ok) throw new Error(result.reason);
    expect([result.width, result.height]).toEqual([400, 800]);
  });

  it("rejects tiny images, unsupported formats and garbage", async () => {
    await expect(processPhoto(await jpegWithExif(200, 200))).resolves.toEqual({
      ok: false,
      reason: "too_small",
    });
    const svg = new TextEncoder().encode(
      '<svg xmlns="http://www.w3.org/2000/svg" width="800" height="800"><rect width="800" height="800"/></svg>',
    );
    await expect(processPhoto(svg)).resolves.toEqual({ ok: false, reason: "unsupported_format" });
    await expect(processPhoto(new TextEncoder().encode("<html>not an image</html>"))).resolves.toEqual({
      ok: false,
      reason: "unreadable",
    });
  });
});
