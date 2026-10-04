"use client";

import type { MessageAttachment } from "@atomes/contracts";
import { Sheet, ViewerWatermark } from "@atomes/ui";
import { useFormatter, useTranslations } from "next-intl";
import { useEffect, useId, useRef, useState } from "react";

type ImageAttachment = Extract<MessageAttachment, { type: "image" }>;
type VoiceAttachment = Extract<MessageAttachment, { type: "voice" }>;

/** A photo ready to leave: re-encoded in the browser, without its metadata. */
export interface PreparedPhoto {
  readonly file: File;
  readonly width: number;
  readonly height: number;
  readonly previewUrl: string;
}

/** A recorded voice message (CHAT-07). */
export interface RecordedVoice {
  readonly file: File;
  readonly durationMs: number;
  readonly waveform: number[];
  readonly previewUrl: string;
}

const MAX_PHOTO_SIDE = 1600;
export const MAX_VOICE_MS = 120_000;
const WAVEFORM_BARS = 64;

/**
 * Redraws the photo on a canvas (CHAT-06): at most 1600 px, upright, and
 * re-encoded as JPEG, which leaves EXIF and GPS data behind before upload.
 * The server strips metadata again.
 */
export async function preparePhoto(source: File): Promise<PreparedPhoto> {
  const bitmap = await createImageBitmap(source, { imageOrientation: "from-image" });
  const scale = Math.min(1, MAX_PHOTO_SIDE / Math.max(bitmap.width, bitmap.height));
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) {
    throw new Error("Canvas unavailable.");
  }
  context.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.85));
  if (!blob) {
    throw new Error("Encoding failed.");
  }
  const file = new File([blob], "photo.jpg", { type: "image/jpeg" });
  return { file, width, height, previewUrl: URL.createObjectURL(blob) };
}

/** 64 bars between 0 and 1, from the recording's loudness. */
async function waveformOf(blob: Blob): Promise<number[]> {
  const context = new AudioContext();
  try {
    const audio = await context.decodeAudioData(await blob.arrayBuffer());
    const samples = audio.getChannelData(0);
    const size = Math.max(1, Math.floor(samples.length / WAVEFORM_BARS));
    const bars: number[] = [];
    for (let bar = 0; bar < WAVEFORM_BARS; bar++) {
      let sum = 0;
      const start = bar * size;
      for (let i = start; i < Math.min(samples.length, start + size); i++) {
        const sample = samples[i] ?? 0;
        sum += sample * sample;
      }
      bars.push(Math.sqrt(sum / size));
    }
    const peak = Math.max(...bars, 1e-6);
    return bars.map((value) => Math.round((value / peak) * 100) / 100);
  } finally {
    void context.close();
  }
}

const RECORDING_TYPES = ["audio/webm;codecs=opus", "audio/mp4", "audio/ogg;codecs=opus"];

const formatDuration = (ms: number) => {
  const seconds = Math.round(ms / 1000);
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
};

/**
 * Voice recording (CHAT-07): MediaRecorder, two minutes at most, then a
 * preview to listen to before sending. Nothing leaves before "Envoyer".
 */
export function useVoiceRecorder(onError: (key: "microphone" | "maxDuration") => void) {
  const [state, setState] = useState<"idle" | "recording" | "ready">("idle");
  const [elapsed, setElapsed] = useState(0);
  const [recorded, setRecorded] = useState<RecordedVoice | null>(null);
  const recorder = useRef<MediaRecorder | null>(null);
  const startedAt = useRef(0);
  const discardNext = useRef(false);
  const report = useRef(onError);
  report.current = onError;

  useEffect(() => {
    if (state !== "recording") {
      return;
    }
    const interval = window.setInterval(() => {
      const ms = Date.now() - startedAt.current;
      setElapsed(ms);
      if (ms >= MAX_VOICE_MS && recorder.current?.state === "recording") {
        recorder.current.stop();
        report.current("maxDuration");
      }
    }, 200);
    return () => window.clearInterval(interval);
  }, [state]);

  // The microphone is released when the conversation closes mid-recording.
  useEffect(
    () => () => {
      if (recorder.current?.state === "recording") {
        discardNext.current = true;
        recorder.current.stop();
      }
    },
    [],
  );

  const start = async () => {
    let stream: MediaStream | undefined;
    let media: MediaRecorder;
    const mimeType =
      typeof MediaRecorder === "undefined"
        ? undefined
        : RECORDING_TYPES.find((type) => MediaRecorder.isTypeSupported(type));
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      media = new MediaRecorder(stream, { mimeType, audioBitsPerSecond: 64_000 });
    } catch {
      for (const track of stream?.getTracks() ?? []) {
        track.stop();
      }
      report.current("microphone");
      return;
    }
    const tracks = stream.getTracks();
    const chunks: Blob[] = [];
    media.ondataavailable = (event) => {
      if (event.data.size > 0) {
        chunks.push(event.data);
      }
    };
    media.onstop = async () => {
      for (const track of tracks) {
        track.stop();
      }
      if (discardNext.current) {
        discardNext.current = false;
        setState("idle");
        return;
      }
      const type = (media.mimeType || mimeType || "audio/webm").split(";")[0] ?? "audio/webm";
      const blob = new Blob(chunks, { type });
      const durationMs = Math.min(MAX_VOICE_MS, Date.now() - startedAt.current);
      const waveform = await waveformOf(blob).catch(() => Array.from({ length: WAVEFORM_BARS }, () => 0.3));
      const extension = type === "audio/mp4" ? "m4a" : type === "audio/ogg" ? "ogg" : "webm";
      setRecorded({
        file: new File([blob], `voice.${extension}`, { type }),
        durationMs,
        waveform,
        previewUrl: URL.createObjectURL(blob),
      });
      setState("ready");
    };
    recorder.current = media;
    discardNext.current = false;
    startedAt.current = Date.now();
    setElapsed(0);
    media.start(250);
    setState("recording");
  };

  const stop = () => {
    if (recorder.current?.state === "recording") {
      recorder.current.stop();
    }
  };

  const reset = () => {
    if (recorder.current?.state === "recording") {
      discardNext.current = true;
      recorder.current.stop();
    }
    if (recorded) {
      URL.revokeObjectURL(recorded.previewUrl);
    }
    setRecorded(null);
    setElapsed(0);
    setState("idle");
  };

  return { state, elapsed, recorded, start, stop, reset };
}

/** The composer while a voice message is being recorded or listened to. */
export function VoiceComposer({
  recorder,
  busy,
  onSend,
}: {
  recorder: ReturnType<typeof useVoiceRecorder>;
  busy: boolean;
  onSend: (voice: RecordedVoice) => void;
}) {
  const t = useTranslations("chat.media");
  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={recorder.reset}
        aria-label={t("discard")}
        className="grid size-11 shrink-0 place-items-center rounded-full border border-paper/15 text-paper/80"
      >
        <svg
          viewBox="0 0 24 24"
          className="size-5"
          fill="none"
          stroke="currentColor"
          strokeWidth={1.8}
          aria-hidden="true"
        >
          <path
            d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>
      {recorder.state === "recording" ? (
        <>
          <p
            role="status"
            className="flex flex-1 items-center gap-3 rounded-3xl border border-plasma/40 px-4 py-2.5"
          >
            <span aria-hidden="true" className="size-2.5 animate-pulse rounded-full bg-plasma" />
            <span className="sr-only">{t("recording")}</span>
            <span className="font-mono tabular-nums">{formatDuration(recorder.elapsed)}</span>
            <span className="ml-auto font-mono text-paper/60 text-xs">{formatDuration(MAX_VOICE_MS)}</span>
          </p>
          <button
            type="button"
            onClick={recorder.stop}
            aria-label={t("stop")}
            className="grid size-11 shrink-0 place-items-center rounded-full bg-plasma text-ink"
          >
            <svg viewBox="0 0 24 24" className="size-4" fill="currentColor" aria-hidden="true">
              <rect x="5" y="5" width="14" height="14" rx="2" />
            </svg>
          </button>
        </>
      ) : recorder.recorded ? (
        <>
          <div className="min-w-0 flex-1">
            <VoicePlayer
              voice={{
                type: "voice",
                url: recorder.recorded.previewUrl,
                durationMs: recorder.recorded.durationMs,
                waveform: recorder.recorded.waveform,
              }}
              mine
            />
          </div>
          <button
            type="button"
            disabled={busy}
            onClick={() => recorder.recorded && onSend(recorder.recorded)}
            aria-label={t("sendVoice")}
            className="grid size-11 shrink-0 place-items-center rounded-full bg-plasma text-ink disabled:opacity-40"
          >
            <svg viewBox="0 0 24 24" className="size-5" fill="currentColor" aria-hidden="true">
              <path d="M3.4 20.4 21 12 3.4 3.6l-.1 6.5L15 12l-11.7 1.9z" />
            </svg>
          </button>
        </>
      ) : null}
    </div>
  );
}

/** Photo preview before sending, with the view-once option (CHAT-06). */
export function PhotoSheet({
  photo,
  name,
  busy,
  error,
  onCancel,
  onSend,
}: {
  photo: PreparedPhoto | null;
  name: string;
  busy: boolean;
  error: string | null;
  onCancel: () => void;
  onSend: (viewOnce: boolean) => void;
}) {
  const t = useTranslations("chat.media");
  const [viewOnce, setViewOnce] = useState(false);
  const hint = useId();
  return (
    <Sheet open={photo !== null} onClose={onCancel} labelledBy="photo-preview">
      <h2 id="photo-preview" className="font-display font-semibold text-xl">
        {t("preview")}
      </h2>
      {photo && (
        // biome-ignore lint/performance/noImgElement: a local preview (blob URL), never optimised.
        <img
          src={photo.previewUrl}
          alt=""
          width={photo.width}
          height={photo.height}
          className="max-h-[50dvh] w-auto self-center rounded-3xl object-contain"
        />
      )}
      <label className="flex items-start gap-3">
        <input
          type="checkbox"
          checked={viewOnce}
          onChange={(event) => setViewOnce(event.target.checked)}
          aria-describedby={hint}
          className="mt-1 size-5 accent-volt"
        />
        <span className="flex flex-col">
          <span className="font-semibold">{t("viewOnce")}</span>
          <span id={hint} className="text-paper/70 text-sm">
            {t("viewOnceHint", { name })}
          </span>
        </span>
      </label>
      {error && (
        <p role="alert" className="rounded-2xl bg-plasma/15 px-4 py-2 text-sm">
          {error}
        </p>
      )}
      <div className="flex flex-wrap gap-3">
        <button
          type="button"
          disabled={busy}
          onClick={() => onSend(viewOnce)}
          className="rounded-full bg-plasma px-5 py-3 font-semibold text-ink disabled:opacity-50"
        >
          {busy ? t("sending") : t("send")}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="rounded-full border border-paper/25 px-5 py-3 font-semibold"
        >
          {t("cancel")}
        </button>
      </div>
    </Sheet>
  );
}

/**
 * A photo in the conversation: blurred when the classifier flagged it
 * (SAF-11), opened once through `onOpen` when it is ephemeral.
 */
export function ImageBubble({
  image,
  mine,
  onOpen,
  onReport,
}: {
  image: ImageAttachment;
  mine: boolean;
  onOpen: () => Promise<string | null>;
  onReport: () => void;
}) {
  const t = useTranslations("chat.media");
  const [revealed, setRevealed] = useState(mine || !image.explicit);
  const [opened, setOpened] = useState<string | null>(null);
  const [opening, setOpening] = useState(false);
  const titleId = useId();

  if (image.viewOnce) {
    const status = image.viewed ? t("opened") : mine ? t("notOpened") : t("once");
    return (
      <div className="flex w-56 max-w-full flex-col gap-3 rounded-3xl border border-volt/40 px-4 py-3">
        <span className="flex items-center gap-3">
          <svg
            viewBox="0 0 24 24"
            className="size-6 shrink-0 text-volt"
            fill="none"
            stroke="currentColor"
            strokeWidth={1.8}
            aria-hidden="true"
          >
            <circle cx="12" cy="12" r="9" strokeDasharray="3 3" />
            <path d="M12 8v4l2.5 2.5" strokeLinecap="round" />
          </svg>
          <span className="flex flex-col">
            <span className="font-semibold">{t("ephemeral")}</span>
            {status && <span className="text-paper/70 text-sm">{status}</span>}
          </span>
        </span>
        {!mine && !image.viewed && (
          <button
            type="button"
            disabled={opening}
            onClick={async () => {
              setOpening(true);
              setOpened(await onOpen());
              setOpening(false);
            }}
            className="rounded-full bg-volt px-4 py-2 font-semibold text-ink text-sm disabled:opacity-50"
          >
            {t("open")}
          </button>
        )}
        <Sheet open={opened !== null} onClose={() => setOpened(null)} labelledBy={titleId}>
          <h2 id={titleId} className="sr-only">
            {t("ephemeral")}
          </h2>
          {opened && (
            <ExplicitGuard
              explicit={image.explicit && !revealed}
              onReveal={() => setRevealed(true)}
              onReport={onReport}
            >
              <span className="relative self-center overflow-hidden rounded-3xl">
                {/* biome-ignore lint/performance/noImgElement: a short-lived signed imgproxy URL. */}
                <img
                  src={opened}
                  alt={t("photoAlt")}
                  width={image.width}
                  height={image.height}
                  className="block max-h-[70dvh] w-auto object-contain"
                />
                <ViewerWatermark />
              </span>
            </ExplicitGuard>
          )}
          <button
            type="button"
            onClick={() => setOpened(null)}
            className="self-start rounded-full border border-paper/25 px-5 py-3 font-semibold"
          >
            {t("close")}
          </button>
        </Sheet>
      </div>
    );
  }

  if (!image.url) {
    return null;
  }
  return (
    <ExplicitGuard explicit={!revealed} onReveal={() => setRevealed(true)} onReport={onReport}>
      <span className="relative block w-fit overflow-hidden rounded-3xl">
        {/* biome-ignore lint/performance/noImgElement: a signed imgproxy URL, already resized. */}
        <img
          src={image.url}
          alt={t("photoAlt")}
          width={image.width}
          height={image.height}
          loading="lazy"
          style={{ aspectRatio: `${image.width} / ${image.height}` }}
          className="block h-auto max-h-80 w-60 max-w-full object-cover"
        />
        {!mine && <ViewerWatermark />}
      </span>
    </ExplicitGuard>
  );
}

function ExplicitGuard({
  explicit,
  onReveal,
  onReport,
  children,
}: {
  explicit: boolean;
  onReveal: () => void;
  onReport: () => void;
  children: React.ReactNode;
}) {
  const t = useTranslations("chat.media");
  if (!explicit) {
    return <>{children}</>;
  }
  return (
    <div className="relative overflow-hidden rounded-3xl">
      <div aria-hidden="true" className="pointer-events-none blur-2xl">
        {children}
      </div>
      <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-ink/50 p-4 text-center">
        <p className="text-sm">{t("explicit")}</p>
        <div className="flex flex-wrap justify-center gap-2">
          <button
            type="button"
            onClick={onReveal}
            className="rounded-full bg-paper px-3 py-1.5 font-semibold text-ink text-sm"
          >
            {t("showAnyway")}
          </button>
          <button
            type="button"
            onClick={onReport}
            className="rounded-full border border-paper/40 px-3 py-1.5 text-sm"
          >
            {t("report")}
          </button>
        </div>
      </div>
    </div>
  );
}

const SPEEDS = [1, 1.5, 2] as const;

/** A voice message: play, waveform with progress, 1× / 1.5× / 2× (CHAT-07). */
export function VoicePlayer({ voice, mine }: { voice: VoiceAttachment; mine: boolean }) {
  const t = useTranslations("chat.media");
  const audio = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [speed, setSpeed] = useState<(typeof SPEEDS)[number]>(1);
  const format = useFormatter();
  const speedLabel = `${format.number(speed)}×`;
  const bars = voice.waveform.length > 0 ? voice.waveform : Array.from({ length: 32 }, () => 0.3);
  const duration = formatDuration(voice.durationMs);

  useEffect(() => {
    if (audio.current) {
      audio.current.playbackRate = speed;
    }
  }, [speed]);

  if (!voice.url) {
    return null;
  }
  return (
    <figure
      aria-label={t("voiceLabel", { duration })}
      className={`flex w-64 max-w-full items-center gap-2 rounded-3xl px-3 py-2 ${
        mine ? "bg-plasma text-ink" : "bg-paper/10 text-paper"
      }`}
    >
      {/* biome-ignore lint/a11y/useMediaCaption: transcription is not available yet. */}
      <audio
        ref={audio}
        src={voice.url}
        preload="metadata"
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => {
          setPlaying(false);
          setProgress(0);
        }}
        onTimeUpdate={(event) => {
          const element = event.currentTarget;
          const total = Number.isFinite(element.duration) ? element.duration : voice.durationMs / 1000;
          setProgress(total > 0 ? Math.min(1, element.currentTime / total) : 0);
        }}
      />
      <button
        type="button"
        onClick={() => {
          const element = audio.current;
          if (!element) {
            return;
          }
          if (element.paused) {
            element.playbackRate = speed;
            void element.play();
          } else {
            element.pause();
          }
        }}
        aria-label={playing ? t("pause") : t("play")}
        className={`grid size-9 shrink-0 place-items-center rounded-full ${mine ? "bg-ink text-plasma" : "bg-paper text-ink"}`}
      >
        {playing ? (
          <svg viewBox="0 0 24 24" className="size-4" fill="currentColor" aria-hidden="true">
            <rect x="6" y="5" width="4" height="14" rx="1" />
            <rect x="14" y="5" width="4" height="14" rx="1" />
          </svg>
        ) : (
          <svg viewBox="0 0 24 24" className="size-4" fill="currentColor" aria-hidden="true">
            <path d="M7 4.5v15l13-7.5z" />
          </svg>
        )}
      </button>
      <span aria-hidden="true" className="flex h-8 min-w-0 flex-1 items-center gap-px">
        {bars.map((value, index) => (
          <span
            // biome-ignore lint/suspicious/noArrayIndexKey: bars never reorder.
            key={index}
            className={`w-full rounded-full ${
              index / bars.length < progress
                ? mine
                  ? "bg-ink"
                  : "bg-volt"
                : mine
                  ? "bg-ink/35"
                  : "bg-paper/35"
            }`}
            style={{ height: `${Math.max(12, value * 100)}%` }}
          />
        ))}
      </span>
      <span className="font-mono text-xs tabular-nums">{duration}</span>
      <button
        type="button"
        onClick={() => setSpeed((current) => SPEEDS[(SPEEDS.indexOf(current) + 1) % SPEEDS.length] ?? 1)}
        aria-label={t("speed", { speed: speedLabel })}
        className={`min-w-9 rounded-full px-1.5 py-1 font-mono text-xs ${mine ? "bg-ink/15" : "bg-paper/15"}`}
      >
        {speedLabel}
      </button>
    </figure>
  );
}
