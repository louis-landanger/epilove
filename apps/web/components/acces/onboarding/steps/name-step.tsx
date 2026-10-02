"use client";

import { FIRST_NAME_MAX_LENGTH, normalizeFirstName } from "@epilove/core";
import { Button, TextField } from "@epilove/ui";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { StepShell } from "../step-shell";
import type { StepProps } from "../types";

export function NameStep({ state, save, pending, focusTitle }: StepProps) {
  const t = useTranslations("onboarding");
  const [value, setValue] = useState(state.answers.firstName ?? "");
  const [invalid, setInvalid] = useState(false);

  async function submit() {
    const firstName = normalizeFirstName(value);
    if (!firstName) {
      setInvalid(true);
      return;
    }
    const result = await save({ step: "name", firstName });
    setInvalid(!result.ok && result.field === "firstName");
  }

  return (
    <StepShell
      title={t("name.title")}
      lead={t("name.lead")}
      focusTitle={focusTitle}
      onSubmit={() => void submit()}
      actions={
        <Button type="submit" size="lg" block loading={pending} disabled={value.trim().length === 0}>
          {t("continue")}
        </Button>
      }
    >
      <TextField
        label={t("name.label")}
        name="firstName"
        autoComplete="given-name"
        autoCapitalize="words"
        maxLength={FIRST_NAME_MAX_LENGTH}
        value={value}
        onChange={(event) => {
          setValue(event.target.value);
          setInvalid(false);
        }}
        error={invalid ? t("name.invalid") : null}
        required
      />
    </StepShell>
  );
}
