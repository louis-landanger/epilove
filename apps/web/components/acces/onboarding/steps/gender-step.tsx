"use client";

import { GENDERS, type Gender, normalizePronouns, PRONOUNS_MAX_LENGTH } from "@atomes/core";
import { Button, ChoiceGroup, TextField } from "@atomes/ui";
import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";
import { StepShell } from "../step-shell";
import type { StepProps } from "../types";

const PRONOUN_SUGGESTIONS = { fr: ["elle", "il", "iel"], en: ["she/her", "he/him", "they/them"] } as const;

export function GenderStep({ state, save, pending, focusTitle }: StepProps) {
  const t = useTranslations("onboarding");
  const suggestions = PRONOUN_SUGGESTIONS[useLocale()];
  const [gender, setGender] = useState<Gender | null>(state.answers.gender);
  const [pronouns, setPronouns] = useState(state.answers.pronouns ?? "");
  const [error, setError] = useState<"gender" | "pronouns" | null>(null);

  async function submit() {
    if (!gender) {
      setError("gender");
      return;
    }
    if (pronouns.trim() && !normalizePronouns(pronouns)) {
      setError("pronouns");
      return;
    }
    const result = await save({ step: "gender", gender, pronouns: pronouns.trim() || null });
    setError(!result.ok && result.field === "pronouns" ? "pronouns" : null);
  }

  return (
    <StepShell
      title={t("gender.title")}
      lead={t("gender.lead")}
      focusTitle={focusTitle}
      onSubmit={() => void submit()}
      actions={
        <Button type="submit" size="lg" block loading={pending} disabled={!gender}>
          {t("continue")}
        </Button>
      }
    >
      <ChoiceGroup
        label={t("gender.label")}
        layout="cards"
        choices={GENDERS.map((value) => ({ value, label: t(`gender.options.${value}`) }))}
        value={gender ? [gender] : []}
        onChange={(next) => {
          setGender(next[0] ?? null);
          setError(null);
        }}
        error={error === "gender" ? t("gender.required") : null}
      />
      <div className="flex flex-col gap-3">
        <TextField
          label={t("gender.pronounsLabel")}
          description={t("gender.pronounsHelp")}
          placeholder={t("gender.pronounsPlaceholder")}
          name="pronouns"
          maxLength={PRONOUNS_MAX_LENGTH}
          value={pronouns}
          onChange={(event) => {
            setPronouns(event.target.value);
            setError(null);
          }}
          error={error === "pronouns" ? t("gender.pronounsInvalid") : null}
        />
        <div className="flex flex-wrap gap-2">
          {suggestions.map((suggestion) => (
            <button
              key={suggestion}
              type="button"
              onClick={() => setPronouns(suggestion)}
              aria-pressed={pronouns === suggestion}
              className="rounded-full border border-paper/15 px-3 py-1.5 text-paper/80 text-sm hover:border-paper/35 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-volt aria-pressed:border-plasma aria-pressed:bg-plasma/15"
            >
              {suggestion}
            </button>
          ))}
        </div>
      </div>
    </StepShell>
  );
}
