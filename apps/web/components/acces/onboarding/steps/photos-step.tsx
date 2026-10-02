"use client";

import { MIN_PHOTOS } from "@epilove/core";
import { Button } from "@epilove/ui";
import { Lightbulb } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { PhotoManager } from "../../media/photo-manager";
import { StepShell } from "../step-shell";
import type { StepProps } from "../types";

export function PhotosStep({ state, next, focusTitle }: StepProps) {
  const t = useTranslations("onboarding");
  const [usable, setUsable] = useState(state.photos);
  const missing = Math.max(0, MIN_PHOTOS - usable);

  return (
    <StepShell
      title={t("photos.title")}
      lead={t("photos.lead")}
      focusTitle={focusTitle}
      onSubmit={() => {
        if (missing === 0) next();
      }}
      actions={
        <>
          <p className="text-center text-paper/60 text-sm" aria-live="polite">
            {missing > 0 ? t("photos.minimum", { count: missing }) : t("photos.counter", { count: usable })}
          </p>
          <Button type="submit" size="lg" block disabled={missing > 0}>
            {t("continue")}
          </Button>
        </>
      }
    >
      <PhotoManager onUsableCountChange={setUsable} />
      <p className="flex gap-3 rounded-2xl bg-paper/[0.04] p-4 text-paper/70 text-sm">
        <Lightbulb className="mt-0.5 size-4 shrink-0 text-volt" aria-hidden="true" />
        {t("photos.tips")}
      </p>
    </StepShell>
  );
}
