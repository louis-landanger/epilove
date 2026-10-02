"use client";

import { cn } from "@epilove/ui";
import { Volume2, VolumeX } from "lucide-react";
import { useTranslations } from "next-intl";
import { setSoundEnabled, useSoundEnabled } from "./sound-store";

/** The landing's sound switch, off by default. */
export function SoundToggle({ className }: { className?: string }) {
  const t = useTranslations("marketing.sound");
  const enabled = useSoundEnabled();
  return (
    <button
      type="button"
      aria-pressed={enabled}
      aria-label={t("label")}
      title={t("label")}
      onClick={() => setSoundEnabled(!enabled)}
      className={cn(
        "inline-flex size-10 shrink-0 items-center justify-center rounded-full border border-paper/15 bg-ink/55 text-paper/80 backdrop-blur-md transition-colors hover:text-paper focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-volt aria-pressed:border-volt/50 aria-pressed:text-volt",
        className,
      )}
    >
      {enabled ? (
        <Volume2 className="size-4" aria-hidden="true" />
      ) : (
        <VolumeX className="size-4" aria-hidden="true" />
      )}
    </button>
  );
}
