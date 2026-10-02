import { describe, expect, it } from "vitest";
import { centeredCrop, clampCrop, sourceRect, zoomTo } from "./crop-geometry";

const frame = { frameWidth: 320, frameHeight: 400, imageWidth: 3000, imageHeight: 2000 };

describe("crop geometry", () => {
  it("centres a landscape photo in a portrait frame", () => {
    const rect = sourceRect(frame, centeredCrop(frame));
    expect(rect.height).toBeCloseTo(2000);
    expect(rect.width).toBeCloseTo(1600);
    expect(rect.x).toBeCloseTo(700);
    expect(rect.y).toBeCloseTo(0);
  });

  it("never leaves an empty band inside the frame", () => {
    const clamped = clampCrop(frame, { zoom: 1, x: 50, y: -999 });
    expect(clamped.x).toBe(0);
    expect(clamped.y).toBe(0);
    const rect = sourceRect(frame, clampCrop(frame, { zoom: 1, x: -99999, y: 0 }));
    expect(rect.x + rect.width).toBeCloseTo(3000);
  });

  it("zooms around the centre and keeps the aspect ratio", () => {
    const zoomed = zoomTo(frame, centeredCrop(frame), 2);
    const rect = sourceRect(frame, zoomed);
    expect(rect.width / rect.height).toBeCloseTo(320 / 400);
    expect(rect.x + rect.width / 2).toBeCloseTo(1500);
    expect(rect.y + rect.height / 2).toBeCloseTo(1000);
    expect(zoomTo(frame, zoomed, 10).zoom).toBe(3);
  });
});
