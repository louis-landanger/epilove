"use client";

import { MIN_INTERESTS } from "@atomes/core";
import { Button } from "@atomes/ui";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { InterestsPicker } from "../../profile/interests-picker";
import { StepShell } from "../step-shell";
import type { StepProps } from "../types";

export function InterestsStep({ state, catalog, save, pending, focusTitle }: StepProps) {
  const t = useTranslations("onboarding");
  const [selected, setSelected] = useState<string[]>(state.answers.interestIds);
  const missing = Math.max(0, MIN_INTERESTS - selected.length);

  return (
    <StepShell
      title={t("interests.title")}
      lead={t("interests.lead")}
      focusTitle={focusTitle}
      onSubmit={() => {
        if (missing === 0) void save({ step: "interests", interestIds: selected });
      }}
      actions={
        <>
          <p className="text-center text-paper/60 text-sm" aria-live="polite">
            {missing > 0
              ? t("interests.minimum", { count: missing })
              : t("interests.counter", { count: selected.length })}
          </p>
          <Button type="submit" size="lg" block loading={pending} disabled={missing > 0}>
            {t("continue")}
          </Button>
        </>
      }
    >
      <InterestsPicker catalog={catalog} selected={selected} onChange={setSelected} />
    </StepShell>
  );
}
