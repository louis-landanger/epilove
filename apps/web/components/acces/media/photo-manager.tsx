"use client";

import type { OwnPhoto } from "@epilove/contracts";
import { MAX_PHOTOS, PHOTO_ALT_TEXT_MAX_LENGTH } from "@epilove/core";
import { ActionMenu, Button, cn, Dialog, ProgressBar, Spinner, TextAreaField, useToast } from "@epilove/ui";
import { ArrowLeft, ArrowRight, Captions, ImagePlus, Star, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { type ChangeEvent, type DragEvent, useCallback, useEffect, useRef, useState } from "react";
import { thumbHashToDataURL } from "thumbhash";
import { api, errorCode } from "../api-client";
import { PhotoCropDialog } from "./photo-crop-dialog";
import { decodeImage, postPresignedForm } from "./prepare-image";

const POLL_INTERVAL_MS = 1500;
const SKELETON_KEYS = Array.from({ length: MAX_PHOTOS }, (_, index) => `skeleton-${index}`);

interface LocalUpload {
  readonly localId: string;
  readonly photoId: string | null;
  readonly previewUrl: string;
  readonly progress: number;
}

/** Photos that count towards the minimum: uploaded and not rejected. */
export function usablePhotoCount(photos: readonly OwnPhoto[]): number {
  return photos.filter(
    (photo) => (photo.stage === "processing" || photo.stage === "ready") && photo.status !== "rejected",
  ).length;
}

function placeholder(thumbhash: string | null): string | undefined {
  if (!thumbhash) {
    return undefined;
  }
  try {
    const bytes = Uint8Array.from(atob(thumbhash), (char) => char.charCodeAt(0));
    return thumbHashToDataURL(bytes);
  } catch {
    return undefined;
  }
}

export interface PhotoManagerProps {
  /** Called whenever the number of usable photos changes. */
  readonly onUsableCountChange?: (count: number) => void;
  /** Called with the full list after every change (profile preview). */
  readonly onPhotosChange?: (photos: readonly OwnPhoto[]) => void;
  /** Offers the text alternative editor (PRO-11). */
  readonly altTextEditable?: boolean;
  readonly initialPhotos?: readonly OwnPhoto[];
}

/**
 * The member's photo grid (PRO-01): framing and compression in the browser,
 * direct upload to storage, processing status, reordering and removal.
 */
export function PhotoManager({
  onUsableCountChange,
  onPhotosChange,
  altTextEditable = false,
  initialPhotos,
}: PhotoManagerProps) {
  const t = useTranslations("onboarding.photos");
  const toast = useToast();
  const [photos, setPhotos] = useState<OwnPhoto[] | null>(initialPhotos ? [...initialPhotos] : null);
  const [describing, setDescribing] = useState<OwnPhoto | null>(null);
  const [uploads, setUploads] = useState<LocalUpload[]>([]);
  // Local previews kept after upload, until the processed photo has its own URL.
  const [previews, setPreviews] = useState<ReadonlyMap<string, string>>(new Map());
  const [cropping, setCropping] = useState<{ bitmap: ImageBitmap; url: string } | null>(null);
  const [dragged, setDragged] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);

  const refresh = useCallback(async () => {
    const result = await api().media.list();
    setPhotos(result.photos);
    return result.photos;
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (photos) {
      onUsableCountChange?.(usablePhotoCount(photos));
      onPhotosChange?.(photos);
    }
  }, [photos, onUsableCountChange, onPhotosChange]);

  // Once the processed photo is served, its local preview is no longer needed.
  useEffect(() => {
    const served = photos?.filter((photo) => photo.url && previews.has(photo.id)) ?? [];
    if (served.length === 0) {
      return;
    }
    const next = new Map(previews);
    for (const photo of served) {
      URL.revokeObjectURL(next.get(photo.id) ?? "");
      next.delete(photo.id);
    }
    setPreviews(next);
  }, [photos, previews]);

  // Poll while the worker processes uploads.
  useEffect(() => {
    if (!photos?.some((photo) => photo.stage === "processing")) {
      return;
    }
    const timer = setTimeout(() => void refresh(), POLL_INTERVAL_MS);
    return () => clearTimeout(timer);
  }, [photos, refresh]);

  const total = (photos?.length ?? 0) + uploads.filter((upload) => !upload.photoId).length;

  async function onFileChosen(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) {
      return;
    }
    try {
      const bitmap = await decodeImage(file);
      setCropping({ bitmap, url: URL.createObjectURL(file) });
    } catch {
      toast.error(t("unsupported"));
    }
  }

  async function upload(blob: Blob, previewUrl: string) {
    const localId = crypto.randomUUID();
    setUploads((current) => [...current, { localId, photoId: null, previewUrl, progress: 0 }]);
    const update = (patch: Partial<LocalUpload>) =>
      setUploads((current) =>
        current.map((item) => (item.localId === localId ? { ...item, ...patch } : item)),
      );
    try {
      const { photoId, upload: form } = await api().media.requestUpload({
        contentType: "image/jpeg",
        size: blob.size,
      });
      update({ photoId });
      await refresh();
      await postPresignedForm(form.url, form.fields, blob, (progress) => update({ progress }));
      await api().media.confirmUpload({ photoId });
      setPreviews((current) => new Map(current).set(photoId, previewUrl));
      await refresh();
    } catch (error) {
      const code = errorCode(error);
      toast.error(code === "TOO_MANY_PHOTOS" ? t("tooMany") : t("uploadFailed"));
      await refresh().catch(() => undefined);
    } finally {
      setUploads((current) => current.filter((item) => item.localId !== localId));
    }
  }

  async function reorder(ids: string[]) {
    if (!photos) {
      return;
    }
    const byId = new Map(photos.map((photo) => [photo.id, photo]));
    setPhotos(ids.map((id, position) => ({ ...(byId.get(id) as OwnPhoto), position })));
    try {
      setPhotos((await api().media.reorder({ photoIds: ids })).photos);
    } catch {
      toast.error(t("uploadFailed"));
      await refresh();
    }
  }

  function move(id: string, to: number) {
    if (!photos) {
      return;
    }
    const ids = photos.map((photo) => photo.id).filter((photoId) => photoId !== id);
    ids.splice(Math.max(0, Math.min(to, ids.length)), 0, id);
    void reorder(ids);
  }

  async function remove(id: string) {
    try {
      setPhotos((await api().media.remove({ photoId: id })).photos);
    } catch {
      toast.error(t("uploadFailed"));
    }
  }

  function onDrop(event: DragEvent<HTMLLIElement>, targetIndex: number) {
    event.preventDefault();
    if (dragged) {
      move(dragged, targetIndex);
    }
    setDragged(null);
  }

  if (!photos) {
    return (
      <div className="grid grid-cols-3 gap-3" aria-busy="true">
        {SKELETON_KEYS.map((key) => (
          <div key={key} className="aspect-[4/5] animate-pulse rounded-2xl bg-paper/5" />
        ))}
      </div>
    );
  }

  const pendingUploads = uploads.filter((item) => !photos.some((photo) => photo.id === item.photoId));
  const emptySlots = Math.max(0, MAX_PHOTOS - photos.length - pendingUploads.length);

  return (
    <div className="flex flex-col gap-4">
      <ul className="grid grid-cols-3 gap-3">
        {photos.map((photo, index) => {
          const local = uploads.find((item) => item.photoId === photo.id);
          const source = photo.url ?? local?.previewUrl ?? previews.get(photo.id);
          return (
            <li
              key={photo.id}
              draggable={photo.stage === "ready" || photo.stage === "processing"}
              onDragStart={() => setDragged(photo.id)}
              onDragOver={(event) => event.preventDefault()}
              onDrop={(event) => onDrop(event, index)}
              className={cn(
                "group relative aspect-[4/5] overflow-hidden rounded-2xl bg-paper/5 bg-center bg-cover",
                dragged === photo.id && "opacity-50",
                index === 0 && "ring-2 ring-plasma ring-offset-2 ring-offset-ink",
              )}
              style={{
                backgroundImage: placeholder(photo.thumbhash)
                  ? `url(${placeholder(photo.thumbhash)})`
                  : undefined,
              }}
            >
              {source ? (
                // biome-ignore lint/performance/noImgElement: signed imgproxy URLs and blob previews, already sized
                <img
                  src={source}
                  alt={photo.altText ?? t("photoAlt", { position: index + 1 })}
                  className="absolute inset-0 size-full object-cover"
                  draggable={false}
                />
              ) : null}
              <PhotoBadge photo={photo} progress={local?.progress} />
              <div className="absolute top-2 right-2">
                <ActionMenu
                  label={t("actions", { position: index + 1 })}
                  items={[
                    ...(index > 0
                      ? [
                          {
                            label: t("makeMain"),
                            icon: <Star className="size-4" aria-hidden="true" />,
                            onSelect: () => move(photo.id, 0),
                          },
                          {
                            label: t("moveLeft"),
                            icon: <ArrowLeft className="size-4" aria-hidden="true" />,
                            onSelect: () => move(photo.id, index - 1),
                          },
                        ]
                      : []),
                    ...(index < photos.length - 1
                      ? [
                          {
                            label: t("moveRight"),
                            icon: <ArrowRight className="size-4" aria-hidden="true" />,
                            onSelect: () => move(photo.id, index + 1),
                          },
                        ]
                      : []),
                    ...(altTextEditable
                      ? [
                          {
                            label: t("altText"),
                            icon: <Captions className="size-4" aria-hidden="true" />,
                            onSelect: () => setDescribing(photo),
                          },
                        ]
                      : []),
                    {
                      label: t("remove"),
                      icon: <Trash2 className="size-4" aria-hidden="true" />,
                      tone: "danger" as const,
                      onSelect: () => void remove(photo.id),
                    },
                  ]}
                />
              </div>
            </li>
          );
        })}
        {pendingUploads.map((item) => (
          <li key={item.localId} className="relative aspect-[4/5] overflow-hidden rounded-2xl bg-paper/5">
            {/* biome-ignore lint/performance/noImgElement: blob preview */}
            <img
              src={item.previewUrl}
              alt=""
              className="absolute inset-0 size-full object-cover opacity-60"
            />
            <div className="absolute inset-x-3 bottom-3">
              <ProgressBar value={item.progress} max={1} label={t("uploading")} />
            </div>
          </li>
        ))}
        {Array.from({ length: emptySlots }, (_, index) => {
          const position = photos.length + pendingUploads.length + index + 1;
          return (
            <li key={`empty-${position}`} className="aspect-[4/5]">
              <button
                type="button"
                onClick={() => input.current?.click()}
                aria-label={t("addSlot", { position })}
                className="flex size-full flex-col items-center justify-center gap-2 rounded-2xl border border-paper/20 border-dashed text-paper/60 transition-colors hover:border-plasma hover:text-paper focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-volt"
              >
                <ImagePlus className="size-6" aria-hidden="true" />
                {index === 0 ? <span className="text-xs">{t("add")}</span> : null}
              </button>
            </li>
          );
        })}
      </ul>
      <input
        ref={input}
        type="file"
        accept="image/*"
        className="sr-only"
        tabIndex={-1}
        aria-hidden="true"
        onChange={(event) => void onFileChosen(event)}
        disabled={total >= MAX_PHOTOS}
      />
      {describing ? (
        <AltTextDialog
          photo={describing}
          onClose={() => setDescribing(null)}
          onSaved={(saved) => {
            setPhotos((current) => current?.map((item) => (item.id === saved.id ? saved : item)) ?? null);
            setDescribing(null);
            toast.success(t("altTextSaved"));
          }}
        />
      ) : null}
      <PhotoCropDialog
        image={cropping}
        onCancel={() => {
          if (cropping) URL.revokeObjectURL(cropping.url);
          setCropping(null);
        }}
        onConfirm={(blob, previewUrl) => {
          if (cropping) URL.revokeObjectURL(cropping.url);
          setCropping(null);
          void upload(blob, previewUrl);
        }}
      />
    </div>
  );
}

function PhotoBadge({ photo, progress }: { photo: OwnPhoto; progress: number | undefined }) {
  const t = useTranslations("onboarding.photos");
  let label: string | null = null;
  let tone = "bg-ink/75 text-paper";
  if (photo.stage === "uploading") {
    label = progress === undefined ? t("uploading") : `${Math.round(progress * 100)} %`;
  } else if (photo.stage === "processing") {
    label = t("processing");
  } else if (photo.status === "rejected") {
    label = t("rejected");
    tone = "bg-danger text-ink";
  } else if (photo.status === "pending") {
    label = t("pending");
  }
  if (!label) {
    return null;
  }
  return (
    <span
      className={cn(
        "absolute bottom-2 left-2 inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs backdrop-blur",
        tone,
      )}
    >
      {photo.stage === "processing" || photo.stage === "uploading" ? <Spinner className="size-3" /> : null}
      {label}
    </span>
  );
}

function AltTextDialog({
  photo,
  onClose,
  onSaved,
}: {
  photo: OwnPhoto;
  onClose: () => void;
  onSaved: (photo: OwnPhoto) => void;
}) {
  const t = useTranslations("onboarding.photos");
  const toast = useToast();
  const [value, setValue] = useState(photo.altText ?? "");
  const [pending, setPending] = useState(false);

  async function save() {
    setPending(true);
    try {
      onSaved(await api().media.setAltText({ photoId: photo.id, altText: value.trim() || null }));
    } catch {
      toast.error(t("uploadFailed"));
    } finally {
      setPending(false);
    }
  }

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      title={t("altTextTitle")}
      description={t("altTextHelp")}
      closeLabel={t("cancel")}
      footer={
        <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <Button variant="ghost" onClick={onClose}>
            {t("cancel")}
          </Button>
          <Button onClick={() => void save()} loading={pending}>
            {t("altTextSave")}
          </Button>
        </div>
      }
    >
      <TextAreaField
        label={t("altTextLabel")}
        maxLength={PHOTO_ALT_TEXT_MAX_LENGTH}
        rows={3}
        value={value}
        onChange={(event) => setValue(event.target.value)}
      />
    </Dialog>
  );
}
