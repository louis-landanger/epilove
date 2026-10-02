import { describe, expect, it } from "vitest";
import { sniffAudio, sniffImage, stripImageMetadata } from "./media-files";

const bytes = (...values: (number | string)[]) =>
  new Uint8Array(values.flatMap((v) => (typeof v === "string" ? [...v].map((c) => c.charCodeAt(0)) : [v])));

const segment = (marker: number, payload: string) => {
  const length = payload.length + 2;
  return bytes(0xff, marker, length >> 8, length & 0xff, payload);
};

describe("conversation media files", () => {
  it("reads the real type from the bytes", () => {
    expect(sniffImage(bytes(0xff, 0xd8, 0xff, 0xe0))).toBe("image/jpeg");
    expect(sniffImage(bytes("\x89PNG\r\n\x1a\n"))).toBe("image/png");
    expect(sniffImage(bytes("RIFF", 0, 0, 0, 0, "WEBP"))).toBe("image/webp");
    expect(sniffImage(bytes("GIF89a"))).toBeNull();
    expect(sniffAudio(bytes(0x1a, 0x45, 0xdf, 0xa3))).toBe("audio/webm");
    expect(sniffAudio(bytes("OggS"))).toBe("audio/ogg");
    expect(sniffAudio(bytes(0, 0, 0, 0x20, "ftypM4A "))).toBe("audio/mp4");
    expect(sniffAudio(bytes("<html>"))).toBeNull();
  });

  it("removes EXIF (GPS), XMP and comments from a JPEG and keeps the image", () => {
    const jpeg = new Uint8Array([
      0xff,
      0xd8,
      ...segment(0xe0, "JFIF\0"),
      ...segment(0xe1, "Exif\0\0GPS 45.76N 4.83E"),
      ...segment(0xfe, "taken at home"),
      ...segment(0xdb, "quant"),
      0xff,
      0xda,
      0,
      4,
      1,
      2,
      9,
      9,
      0xff,
      0xd9,
    ]);
    const clean = stripImageMetadata(jpeg, "image/jpeg");
    const text = String.fromCharCode(...clean);
    expect(text).not.toContain("GPS");
    expect(text).not.toContain("home");
    expect(text).toContain("JFIF");
    expect(text).toContain("quant");
    expect([...clean.slice(-4)]).toEqual([9, 9, 0xff, 0xd9]);
  });

  it("removes text and EXIF chunks from a PNG", () => {
    const chunk = (type: string, data: string) => {
      const length = data.length;
      return bytes(
        length >>> 24,
        (length >>> 16) & 255,
        (length >>> 8) & 255,
        length & 255,
        type,
        data,
        0,
        0,
        0,
        0,
      );
    };
    const png = new Uint8Array([
      ...bytes("\x89PNG\r\n\x1a\n"),
      ...chunk("IHDR", "0123456789abc"),
      ...chunk("tEXt", "Author\0Someone"),
      ...chunk("eXIf", "GPS"),
      ...chunk("IDAT", "pixels"),
      ...chunk("IEND", ""),
    ]);
    const text = String.fromCharCode(...stripImageMetadata(png, "image/png"));
    expect(text).not.toContain("Someone");
    expect(text).not.toContain("GPS");
    expect(text).toContain("pixels");
    expect(text).toContain("IEND");
  });

  it("removes EXIF and XMP chunks from a WebP and clears their flags", () => {
    const chunk = (fourcc: string, data: number[]) => {
      const padded = data.length % 2 ? [...data, 0] : data;
      const size = data.length;
      return [...bytes(fourcc), size & 255, (size >>> 8) & 255, 0, 0, ...padded];
    };
    const body = [
      ...chunk("VP8X", [0x0c, 0, 0, 0, 1, 0, 0, 1, 0, 0]),
      ...chunk("VP8 ", [1, 2, 3, 4]),
      ...chunk("EXIF", [...bytes("GPS!")]),
      ...chunk("XMP ", [...bytes("<x/>")]),
    ];
    const size = body.length + 4;
    const webp = new Uint8Array([
      ...bytes("RIFF"),
      size & 255,
      (size >>> 8) & 255,
      0,
      0,
      ...bytes("WEBP"),
      ...body,
    ]);
    const clean = stripImageMetadata(webp, "image/webp");
    const text = String.fromCharCode(...clean);
    expect(text).not.toContain("GPS");
    expect(text).not.toContain("<x/>");
    expect(clean[20]).toBe(0);
    expect(new DataView(clean.buffer).getUint32(4, true)).toBe(clean.length - 8);
  });

  it("refuses malformed images", () => {
    expect(() => stripImageMetadata(bytes(0xff, 0xd8, 0xff, 0xe1, 0xff, 0xff), "image/jpeg")).toThrow();
  });
});
