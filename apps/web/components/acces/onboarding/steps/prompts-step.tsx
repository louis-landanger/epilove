"use client";

import { Button } from "@epilove/ui";
import { useTranslations } from "next-intl";
import { useState } from "react";
import {
  invalidSlots,
  PromptAnswersEditor,
  type PromptSlot,
  promptSlots,
} from "../../profile/prompt-answers-editor";
import { StepShell } from "../step-shell";
import type { StepProps } from "../types";

export function PromptsStep({ state, catalog, save, pending, focusTitle }: StepProps) {
  const t = useTranslations("onboarding");
  const [slots, setSlots] = useState<PromptSlot[]>(() => promptSlots(state.answers.promptAnswers));
  const [invalid, setInvalid] = useState<Set<number>>(new Set());

  async function submit() {
    const bad = invalidSlots(slots);
    setInvalid(bad);
    if (bad.size > 0) {
      return;
    }
    const result = await save({
      step: "prompts",
      answers: slots.map((slot) => ({ promptId: slot.promptId ?? "", text: slot.text })),
    });
    if (!result.ok && result.field?.startsWith("answers.")) {
      setInvalid(new Set([Number(result.field.split(".")[1])]));
    }
  }

  return (
    <StepShell
      title={t("prompts.title")}
      lead={t("prompts.lead")}
      focusTitle={focusTitle}
      onSubmit={() => void submit()}
      actions={
        <Button type="submit" size="lg" block loading={pending} disabled={invalidSlots(slots).size > 0}>
          {t("continue")}
        </Button>
      }
    >
      <PromptAnswersEditor
        catalog={catalog}
        slots={slots}
        onChange={(next) => {
          setSlots(next);
          setInvalid(new Set());
        }}
        invalid={invalid}
      />
    </StepShell>
  );
}
