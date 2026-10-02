"use client";

/** Portrait frame used everywhere a profile photo is shown (4:5). */
export const PHOTO_ASPECT = 4 / 5;

/** Longest side sent to the server. The worker re-encodes again anyway. */
const UPLOAD_MAX_EDGE = 2048;
const JPEG_QUALITY = 0.88;

export interface SourceRect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/**
 * Decodes a picked file with its EXIF orientation applied. Fails for formats
 * the browser cannot decode (HEIC on most desktop browsers).
 */
export async function decodeImage(file: Blob): Promise<ImageBitmap> {
  return createImageBitmap(file, { imageOrientation: "from-image" });
}

/** Crops and compresses in the browser: smaller uploads, no original metadata sent. */
export async function renderCrop(image: ImageBitmap, rect: SourceRect): Promise<Blob> {
  const scale = Math.min(1, UPLOAD_MAX_EDGE / Math.max(rect.width, rect.height));
  const width = Math.max(1, Math.round(rect.width * scale));
  const height = Math.max(1, Math.round(rect.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) {
    throw new Error("Canvas unavailable");
  }
  context.imageSmoothingQuality = "high";
  context.drawImage(image, rect.x, rect.y, rect.width, rect.height, 0, 0, width, height);
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("Encoding failed"))),
      "image/jpeg",
      JPEG_QUALITY,
    );
  });
}

/** Posts a presigned form with upload progress (fetch has no upload progress events). */
export function postPresignedForm(
  url: string,
  fields: Record<string, string>,
  file: Blob,
  onProgress: (ratio: number) => void,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const form = new FormData();
    for (const [key, value] of Object.entries(fields)) {
      form.append(key, value);
    }
    // The file must be the last field of an S3 POST form.
    form.append("file", file);
    const request = new XMLHttpRequest();
    request.open("POST", url);
    request.upload.addEventListener("progress", (event) => {
      if (event.lengthComputable) {
        onProgress(event.loaded / event.total);
      }
    });
    request.addEventListener("load", () => {
      if (request.status >= 200 && request.status < 300) {
        resolve();
      } else {
        reject(new Error(`Upload failed (${request.status})`));
      }
    });
    request.addEventListener("error", () => reject(new Error("Upload failed")));
    request.send(form);
  });
}
