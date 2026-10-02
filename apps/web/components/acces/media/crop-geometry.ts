/**
 * Pure geometry of the photo cropper: an image covering a fixed frame, moved
 * and zoomed by the member, mapped back to a rectangle of the source image.
 */
export interface CropState {
  readonly zoom: number;
  /** Top-left corner of the displayed image, relative to the frame, in CSS pixels. */
  readonly x: number;
  readonly y: number;
}

export interface CropFrame {
  readonly frameWidth: number;
  readonly frameHeight: number;
  readonly imageWidth: number;
  readonly imageHeight: number;
}

export const MIN_ZOOM = 1;
export const MAX_ZOOM = 3;

/** Scale at which the image exactly covers the frame. */
export function coverScale(frame: CropFrame): number {
  return Math.max(frame.frameWidth / frame.imageWidth, frame.frameHeight / frame.imageHeight);
}

/** Keeps the frame fully covered by the image. */
export function clampCrop(frame: CropFrame, state: CropState): CropState {
  const zoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, state.zoom));
  const scale = coverScale(frame) * zoom;
  const width = frame.imageWidth * scale;
  const height = frame.imageHeight * scale;
  return {
    zoom,
    x: Math.min(0, Math.max(frame.frameWidth - width, state.x)),
    y: Math.min(0, Math.max(frame.frameHeight - height, state.y)),
  };
}

export function centeredCrop(frame: CropFrame): CropState {
  const scale = coverScale(frame);
  return {
    zoom: 1,
    x: (frame.frameWidth - frame.imageWidth * scale) / 2,
    y: (frame.frameHeight - frame.imageHeight * scale) / 2,
  };
}

/** Zooms around the centre of the frame. */
export function zoomTo(frame: CropFrame, state: CropState, zoom: number): CropState {
  const before = coverScale(frame) * state.zoom;
  const centerX = (frame.frameWidth / 2 - state.x) / before;
  const centerY = (frame.frameHeight / 2 - state.y) / before;
  const nextZoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom));
  const after = coverScale(frame) * nextZoom;
  return clampCrop(frame, {
    zoom: nextZoom,
    x: frame.frameWidth / 2 - centerX * after,
    y: frame.frameHeight / 2 - centerY * after,
  });
}

/** The rectangle of the source image visible in the frame. */
export function sourceRect(frame: CropFrame, state: CropState) {
  const scale = coverScale(frame) * state.zoom;
  return {
    x: Math.max(0, -state.x / scale),
    y: Math.max(0, -state.y / scale),
    width: Math.min(frame.imageWidth, frame.frameWidth / scale),
    height: Math.min(frame.imageHeight, frame.frameHeight / scale),
  };
}
