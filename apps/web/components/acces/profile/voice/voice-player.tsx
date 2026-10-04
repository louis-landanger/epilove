"use client";

import { cn } from "@atomes/ui";
import { Pause, Play } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";
import { formatClock, Waveform } from "./waveform";

/**
 * Plays a voice answer with its waveform. The duration comes from the
 * recorder: WebM files from MediaRecorder often report no duration.
 */
export function VoicePlayer({
  src,
  peaks,
  durationMs,
  className,
}: {
  src: string;
  peaks: readonly number[];
  durationMs: number;
  className?: string;
}) {
  const t = useTranslations("profile.voice");
  const audioRef = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [position, setPosition] = useState(0);

  useEffect(() => {
    if (!playing) return;
    let frame = 0;
    const tick = () => {
      setPosition((audioRef.current?.currentTime ?? 0) * 1000);
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [playing]);

  async function toggle() {
    const audio = audioRef.current;
    if (!audio) return;
    if (audio.paused) {
      await audio.play().catch(() => setPlaying(false));
    } else {
      audio.pause();
    }
  }

  return (
    <div className={cn("flex items-center gap-3 rounded-full bg-paper/[0.06] py-2 pr-4 pl-2", className)}>
      <button
        type="button"
        onClick={() => void toggle()}
        aria-label={playing ? t("pause") : t("play")}
        className="inline-flex size-10 shrink-0 items-center justify-center rounded-full bg-plasma text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-volt"
      >
        {playing ? (
          <Pause className="size-4" aria-hidden="true" />
        ) : (
          <Play className="size-4" aria-hidden="true" />
        )}
      </button>
      <Waveform peaks={peaks} progress={Math.min(1, position / durationMs)} />
      <span className="font-mono text-paper/70 text-xs tabular-nums">
        {formatClock(playing || position > 0 ? position : durationMs)}
      </span>
      {/* biome-ignore lint/a11y/useMediaCaption: the written answer is the transcript, shown next to it */}
      <audio
        ref={audioRef}
        src={src}
        preload="none"
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => {
          setPlaying(false);
          setPosition(0);
        }}
      />
    </div>
  );
}
