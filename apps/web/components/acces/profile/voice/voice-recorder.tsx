"use client";

import type { OwnProfile } from "@atomes/contracts";
import { baseVoiceType, VOICE_MAX_BYTES, VOICE_MAX_DURATION_MS, VOICE_PEAK_COUNT } from "@atomes/core";
import { Button, Dialog } from "@atomes/ui";
import { Mic, RotateCcw, Square } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";
import { api } from "@/lib/api-client";
import { postPresignedForm } from "../../media/prepare-image";
import { VoicePlayer } from "./voice-player";
import { Waveform } from "./waveform";

/** Preferred recording formats, in order; the first supported one wins. */
const MIME_TYPES = ["audio/webm;codecs=opus", "audio/mp4", "audio/ogg;codecs=opus", "audio/webm"];

interface Recording {
  readonly blob: Blob;
  readonly url: string;
  readonly durationMs: number;
  readonly peaks: number[];
}

/** Squeezes the levels measured while recording into the waveform bars (0 to 100). */
function toPeaks(levels: readonly number[]): number[] {
  const max = Math.max(0.01, ...levels);
  return Array.from({ length: VOICE_PEAK_COUNT }, (_, index) => {
    const from = Math.floor((index * levels.length) / VOICE_PEAK_COUNT);
    const to = Math.max(from + 1, Math.floor(((index + 1) * levels.length) / VOICE_PEAK_COUNT));
    const slice = levels.slice(from, to);
    const level = slice.length > 0 ? Math.max(...slice) : 0;
    return Math.round(Math.min(1, level / max) * 100);
  });
}

/** PRO-06: records up to 30 seconds, with live levels, then uploads the result. */
export function VoiceRecorder({
  promptId,
  open,
  onOpenChange,
  onSaved,
}: {
  promptId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: (profile: OwnProfile) => void;
}) {
  const t = useTranslations("profile.voice");
  const [state, setState] = useState<"idle" | "recording" | "review" | "uploading">("idle");
  const [problem, setProblem] = useState<string | null>(null);
  const [live, setLive] = useState<number[]>([]);
  const [elapsed, setElapsed] = useState(0);
  const [recording, setRecording] = useState<Recording | null>(null);
  const cleanup = useRef<() => void>(() => {});
  const recorderRef = useRef<MediaRecorder | null>(null);

  useEffect(() => () => cleanup.current(), []);
  useEffect(() => () => (recording ? URL.revokeObjectURL(recording.url) : undefined), [recording]);

  function reset() {
    cleanup.current();
    setState("idle");
    setLive([]);
    setElapsed(0);
    setRecording(null);
    setProblem(null);
  }

  async function start() {
    setProblem(null);
    const mimeType = MIME_TYPES.find(
      (type) => typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(type),
    );
    if (!mimeType || !navigator.mediaDevices?.getUserMedia) {
      setProblem(t("unsupported"));
      return;
    }
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true },
      });
    } catch {
      setProblem(t("micDenied"));
      return;
    }
    const context = new AudioContext();
    const analyser = context.createAnalyser();
    analyser.fftSize = 1024;
    context.createMediaStreamSource(stream).connect(analyser);
    const samples = new Float32Array(analyser.fftSize);
    const levels: number[] = [];
    const chunks: Blob[] = [];
    const recorder = new MediaRecorder(stream, { mimeType, audioBitsPerSecond: 64_000 });
    recorderRef.current = recorder;
    const startedAt = performance.now();
    let frame = 0;

    const sample = () => {
      analyser.getFloatTimeDomainData(samples);
      let sum = 0;
      for (const value of samples) sum += value * value;
      levels.push(Math.sqrt(sum / samples.length));
      const now = performance.now() - startedAt;
      setElapsed(now);
      setLive(toPeaks(levels.slice(-VOICE_PEAK_COUNT * 2)));
      if (now >= VOICE_MAX_DURATION_MS) {
        recorder.stop();
        return;
      }
      frame = requestAnimationFrame(sample);
    };

    cleanup.current = () => {
      cancelAnimationFrame(frame);
      if (recorder.state !== "inactive") recorder.stop();
      for (const track of stream.getTracks()) track.stop();
      void context.close().catch(() => {});
    };

    recorder.addEventListener("dataavailable", (event) => {
      if (event.data.size > 0) chunks.push(event.data);
    });
    recorder.addEventListener("stop", () => {
      const durationMs = Math.min(VOICE_MAX_DURATION_MS, Math.round(performance.now() - startedAt));
      cleanup.current();
      const blob = new Blob(chunks, { type: recorder.mimeType || mimeType });
      setRecording({ blob, url: URL.createObjectURL(blob), durationMs, peaks: toPeaks(levels) });
      setState("review");
    });
    recorder.start(250);
    setState("recording");
    frame = requestAnimationFrame(sample);
  }

  async function upload() {
    const contentType = recording ? baseVoiceType(recording.blob.type) : null;
    if (!recording || !contentType || recording.blob.size > VOICE_MAX_BYTES) {
      setProblem(t("error"));
      return;
    }
    setState("uploading");
    try {
      const form = await api.profile.requestVoiceUpload({
        promptId,
        contentType,
        size: recording.blob.size,
        durationMs: Math.max(500, recording.durationMs),
        peaks: recording.peaks,
      });
      await postPresignedForm(form.url, form.fields, recording.blob, () => {});
      onSaved(await api.profile.confirmVoiceUpload({ promptId }));
      reset();
      onOpenChange(false);
    } catch {
      setProblem(t("error"));
      setState("review");
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) reset();
        onOpenChange(next);
      }}
      title={t("title")}
      description={t("lead")}
    >
      <div className="flex flex-col gap-5">
        {state === "recording" ? (
          <div className="flex flex-col gap-3">
            <div className="flex items-center gap-3 rounded-full bg-paper/[0.06] px-4 py-2">
              <span className="size-2.5 shrink-0 animate-pulse rounded-full bg-danger" aria-hidden="true" />
              <Waveform peaks={live.length > 0 ? live : Array.from({ length: VOICE_PEAK_COUNT }, () => 0)} />
            </div>
            <p className="font-mono text-paper/70 text-sm tabular-nums" aria-live="off">
              {t("recording", { seconds: Math.floor(elapsed / 1000) })}
            </p>
            <div className="h-1 overflow-hidden rounded-full bg-paper/10" aria-hidden="true">
              <div
                className="h-full bg-plasma"
                style={{ width: `${Math.min(100, (elapsed / VOICE_MAX_DURATION_MS) * 100)}%` }}
              />
            </div>
          </div>
        ) : null}
        {(state === "review" || state === "uploading") && recording ? (
          <VoicePlayer src={recording.url} peaks={recording.peaks} durationMs={recording.durationMs} />
        ) : null}
        {problem ? (
          <p role="alert" className="text-danger text-sm">
            {problem}
          </p>
        ) : null}
        <div className="flex flex-wrap gap-3">
          {state === "idle" ? (
            <Button leadingIcon={<Mic className="size-4" aria-hidden="true" />} onClick={() => void start()}>
              {t("record")}
            </Button>
          ) : null}
          {state === "recording" ? (
            <Button
              variant="danger"
              leadingIcon={<Square className="size-4" aria-hidden="true" />}
              onClick={() => recorderRef.current?.stop()}
            >
              {t("stop")}
            </Button>
          ) : null}
          {state === "review" || state === "uploading" ? (
            <>
              <Button loading={state === "uploading"} onClick={() => void upload()}>
                {state === "uploading" ? t("uploading") : t("use")}
              </Button>
              <Button
                variant="secondary"
                disabled={state === "uploading"}
                leadingIcon={<RotateCcw className="size-4" aria-hidden="true" />}
                onClick={reset}
              >
                {t("rerecord")}
              </Button>
            </>
          ) : null}
        </div>
      </div>
    </Dialog>
  );
}
