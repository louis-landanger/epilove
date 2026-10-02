"use client";

import { Button, Dialog } from "@epilove/ui";
import { ZoomIn, ZoomOut } from "lucide-react";
import { useTranslations } from "next-intl";
import { type KeyboardEvent, type PointerEvent, useEffect, useMemo, useRef, useState } from "react";
import {
  type CropFrame,
  type CropState,
  centeredCrop,
  clampCrop,
  MAX_ZOOM,
  MIN_ZOOM,
  sourceRect,
  zoomTo,
} from "./crop-geometry";
import { PHOTO_ASPECT, renderCrop } from "./prepare-image";

const FRAME_WIDTH = 288;
const FRAME_HEIGHT = FRAME_WIDTH / PHOTO_ASPECT;
const KEYBOARD_STEP = 12;

export interface PhotoCropDialogProps {
  /** Decoded image to frame, or `null` when the dialog is closed. */
  readonly image: { bitmap: ImageBitmap; url: string } | null;
  readonly onCancel: () => void;
  readonly onConfirm: (blob: Blob, previewUrl: string) => void;
}

/** Portrait (4:5) framing before upload: drag to move, slider or keys to zoom. */
export function PhotoCropDialog({ image, onCancel, onConfirm }: PhotoCropDialogProps) {
  const t = useTranslations("onboarding.photos");
  const frame = useMemo<CropFrame | null>(
    () =>
      image
        ? {
            frameWidth: FRAME_WIDTH,
            frameHeight: FRAME_HEIGHT,
            imageWidth: image.bitmap.width,
            imageHeight: image.bitmap.height,
          }
        : null,
    [image],
  );
  const [crop, setCrop] = useState<CropState>({ zoom: 1, x: 0, y: 0 });
  const [busy, setBusy] = useState(false);
  const drag = useRef<{ pointerId: number; startX: number; startY: number; origin: CropState } | null>(null);

  useEffect(() => {
    if (frame) {
      setCrop(centeredCrop(frame));
    }
  }, [frame]);

  if (!image || !frame) {
    return null;
  }

  const scale = Math.max(FRAME_WIDTH / frame.imageWidth, FRAME_HEIGHT / frame.imageHeight) * crop.zoom;

  function onPointerDown(event: PointerEvent<HTMLDivElement>) {
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = { pointerId: event.pointerId, startX: event.clientX, startY: event.clientY, origin: crop };
  }

  function onPointerMove(event: PointerEvent<HTMLDivElement>) {
    const current = drag.current;
    if (!frame || !current || current.pointerId !== event.pointerId) {
      return;
    }
    setCrop(
      clampCrop(frame, {
        zoom: current.origin.zoom,
        x: current.origin.x + event.clientX - current.startX,
        y: current.origin.y + event.clientY - current.startY,
      }),
    );
  }

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (!frame) {
      return;
    }
    const moves: Record<string, [number, number]> = {
      ArrowLeft: [KEYBOARD_STEP, 0],
      ArrowRight: [-KEYBOARD_STEP, 0],
      ArrowUp: [0, KEYBOARD_STEP],
      ArrowDown: [0, -KEYBOARD_STEP],
    };
    const move = moves[event.key];
    if (move) {
      event.preventDefault();
      setCrop(clampCrop(frame, { ...crop, x: crop.x + move[0], y: crop.y + move[1] }));
    } else if (event.key === "+" || event.key === "=") {
      setCrop(zoomTo(frame, crop, crop.zoom + 0.1));
    } else if (event.key === "-") {
      setCrop(zoomTo(frame, crop, crop.zoom - 0.1));
    }
  }

  async function confirm() {
    if (!image || !frame) {
      return;
    }
    setBusy(true);
    try {
      const blob = await renderCrop(image.bitmap, sourceRect(frame, crop));
      onConfirm(blob, URL.createObjectURL(blob));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onCancel();
      }}
      title={t("cropTitle")}
      description={t("cropHelp")}
      closeLabel={t("cancel")}
      footer={
        <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <Button variant="ghost" onClick={onCancel}>
            {t("cancel")}
          </Button>
          <Button onClick={() => void confirm()} loading={busy}>
            {t("useCrop")}
          </Button>
        </div>
      }
    >
      <div className="flex flex-col items-center gap-5">
        <div
          role="application"
          aria-roledescription={t("cropTitle")}
          aria-label={t("cropHelp")}
          // biome-ignore lint/a11y/noNoninteractiveTabindex: custom 2D cropper driven by arrow keys
          tabIndex={0}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={() => {
            drag.current = null;
          }}
          onPointerCancel={() => {
            drag.current = null;
          }}
          onKeyDown={onKeyDown}
          className="relative cursor-grab touch-none select-none overflow-hidden rounded-3xl bg-ink outline-offset-4 focus-visible:outline-2 focus-visible:outline-volt active:cursor-grabbing"
          style={{ width: FRAME_WIDTH, height: FRAME_HEIGHT }}
        >
          {/* biome-ignore lint/performance/noImgElement: local blob preview, not an optimisable asset */}
          <img
            src={image.url}
            alt=""
            draggable={false}
            className="pointer-events-none absolute top-0 left-0 max-w-none origin-top-left"
            style={{
              width: frame.imageWidth * scale,
              height: frame.imageHeight * scale,
              transform: `translate(${crop.x}px, ${crop.y}px)`,
            }}
          />
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 rounded-3xl ring-1 ring-paper/20 ring-inset"
          />
        </div>
        <label className="flex w-full max-w-72 items-center gap-3 text-paper/70">
          <ZoomOut className="size-4 shrink-0" aria-hidden="true" />
          <span className="sr-only">{t("zoom")}</span>
          <input
            type="range"
            min={MIN_ZOOM}
            max={MAX_ZOOM}
            step={0.01}
            value={crop.zoom}
            onChange={(event) => setCrop(zoomTo(frame, crop, Number(event.target.value)))}
            className="w-full accent-plasma"
          />
          <ZoomIn className="size-4 shrink-0" aria-hidden="true" />
        </label>
      </div>
    </Dialog>
  );
}
