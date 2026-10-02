"use client";

import { INTENTIONS, type Intention, type Mode } from "@epilove/core";
import { Button, ChoiceGroup } from "@epilove/ui";
import { AnimatePresence, motion } from "motion/react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { StepShell } from "../step-shell";
import type { StepProps } from "../types";

type Choice = "love" | "friends" | "both";

function choiceOf(modes: readonly Mode[]): Choice | null {
  if (modes.includes("love") && modes.includes("friends")) return "both";
  if (modes.includes("love")) return "love";
  if (modes.includes("friends")) return "friends";
  return null;
}

const MODES_FOR: Record<Choice, Mode[]> = { love: ["love"], friends: ["friends"], both: ["love", "friends"] };

export function SeekingStep({ state, save, pending, focusTitle }: StepProps) {
  const t = useTranslations("onboarding");
  const [choice, setChoice] = useState<Choice | null>(choiceOf(state.answers.modes));
  const [intentions, setIntentions] = useState<Intention[]>(state.answers.intentions);
  const [missing, setMissing] = useState(false);
  const love = choice === "love" || choice === "both";

  async function submit() {
    if (!choice) {
      setMissing(true);
      return;
    }
    await save({ step: "seeking", modes: MODES_FOR[choice], intentions: love ? intentions : [] });
  }

  return (
    <StepShell
      title={t("seeking.title")}
      lead={t("seeking.lead")}
      focusTitle={focusTitle}
      onSubmit={() => void submit()}
      actions={
        <Button type="submit" size="lg" block loading={pending} disabled={!choice}>
          {t("continue")}
        </Button>
      }
    >
      <ChoiceGroup<Choice>
        label={t("seeking.label")}
        layout="cards"
        choices={(["love", "friends", "both"] as const).map((value) => ({
          value,
          label: t(`seeking.options.${value}.label`),
          description: t(`seeking.options.${value}.description`),
        }))}
        value={choice ? [choice] : []}
        onChange={(next) => {
          setChoice(next[0] ?? null);
          setMissing(false);
        }}
        error={missing ? t("seeking.required") : null}
      />
      <AnimatePresence initial={false}>
        {love ? (
          <motion.div
            key="intentions"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden"
          >
            <ChoiceGroup<Intention>
              label={t("seeking.intentionsLabel")}
              multiple
              choices={INTENTIONS.map((value) => ({ value, label: t(`seeking.intentions.${value}`) }))}
              value={intentions}
              onChange={setIntentions}
            />
          </motion.div>
        ) : null}
      </AnimatePresence>
    </StepShell>
  );
}
