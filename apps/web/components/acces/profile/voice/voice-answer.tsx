"use client";

import type { OwnProfile, VoiceAnswer as VoiceAnswerData } from "@epilove/contracts";
import { Button } from "@epilove/ui";
import { Mic, RotateCcw, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { api } from "../../api-client";
import { VoicePlayer } from "./voice-player";
import { VoiceRecorder } from "./voice-recorder";

/** Voice controls under a saved answer (PRO-06). */
export function VoiceAnswerControls({
  promptId,
  voice,
  onSaved,
}: {
  promptId: string;
  voice: VoiceAnswerData | null;
  onSaved: (profile: OwnProfile) => void;
}) {
  const t = useTranslations("profile.voice");
  const [recording, setRecording] = useState(false);
  const [removing, setRemoving] = useState(false);
  const checking = voice?.stage === "uploading" || voice?.stage === "processing";

  // The check takes a few seconds in the background: follow it.
  useEffect(() => {
    if (!checking) return;
    const timer = window.setInterval(() => {
      void api()
        .profile.me()
        .then((profile) => {
          const next = profile.promptAnswers.find((answer) => answer.promptId === promptId)?.voice;
          if (next?.stage !== voice?.stage) onSaved(profile);
        })
        .catch(() => {});
    }, 2000);
    return () => window.clearInterval(timer);
  }, [checking, onSaved, promptId, voice?.stage]);

  async function remove() {
    setRemoving(true);
    try {
      onSaved(await api().profile.removeVoice({ promptId }));
    } finally {
      setRemoving(false);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      {voice?.stage === "ready" && voice.url ? (
        <VoicePlayer src={voice.url} peaks={voice.peaks} durationMs={voice.durationMs} />
      ) : null}
      {checking ? (
        <p role="status" className="text-paper/70 text-sm">
          {t("processing")}
        </p>
      ) : null}
      {voice?.stage === "failed" ? (
        <p role="alert" className="text-danger text-sm">
          {t("failed")}
        </p>
      ) : null}
      <div className="flex flex-wrap items-center gap-2">
        <Button
          variant="ghost"
          size="sm"
          leadingIcon={
            voice ? (
              <RotateCcw className="size-4" aria-hidden="true" />
            ) : (
              <Mic className="size-4" aria-hidden="true" />
            )
          }
          onClick={() => setRecording(true)}
        >
          {voice ? t("replace") : t("add")}
        </Button>
        {voice ? (
          <Button
            variant="ghost"
            size="sm"
            loading={removing}
            leadingIcon={<Trash2 className="size-4" aria-hidden="true" />}
            onClick={() => void remove()}
          >
            {t("remove")}
          </Button>
        ) : (
          <span className="text-paper/50 text-xs">{t("addHelp")}</span>
        )}
      </div>
      <VoiceRecorder promptId={promptId} open={recording} onOpenChange={setRecording} onSaved={onSaved} />
    </div>
  );
}
