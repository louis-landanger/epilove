"use client";

import { ageOn, checkBirthDate } from "@epilove/core";
import { Button, Dialog, TextField } from "@epilove/ui";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { StepShell } from "../step-shell";
import type { StepProps } from "../types";

/** Date of birth with the blocking 18+ check (ONB-04), confirmed before saving. */
export function BirthStep({ state, save, pending, focusTitle }: StepProps) {
  const t = useTranslations("onboarding");
  const [value, setValue] = useState(state.answers.birthDate ?? "");
  const [invalid, setInvalid] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const minimum = `${Number(state.today.slice(0, 4)) - 100}-01-01`;

  function review() {
    const check = checkBirthDate(value, state.today);
    // Minors are not told the threshold here: the server decides and closes the account.
    if (!check.ok && check.reason !== "underage") {
      setInvalid(true);
      return;
    }
    setConfirming(true);
  }

  async function confirm() {
    setConfirming(false);
    const result = await save({ step: "birth", birthDate: value });
    setInvalid(!result.ok && result.field === "birthDate");
  }

  const age = /^\d{4}-\d{2}-\d{2}$/.test(value) && value <= state.today ? ageOn(value, state.today) : null;

  return (
    <StepShell
      title={t("birth.title")}
      lead={t("birth.lead")}
      focusTitle={focusTitle}
      onSubmit={review}
      actions={
        <Button type="submit" size="lg" block loading={pending} disabled={!value}>
          {t("continue")}
        </Button>
      }
    >
      <TextField
        label={t("birth.label")}
        type="date"
        name="birthDate"
        autoComplete="bday"
        min={minimum}
        max={state.today}
        value={value}
        onChange={(event) => {
          setValue(event.target.value);
          setInvalid(false);
        }}
        error={invalid ? t("birth.invalid") : null}
        required
        inputClassName="[color-scheme:dark]"
      />
      <Dialog
        open={confirming && age !== null}
        onOpenChange={setConfirming}
        title={t("birth.confirmTitle", { age: age ?? 0 })}
        description={t("birth.confirmBody")}
        closeLabel={t("birth.edit")}
        footer={
          <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
            <Button variant="ghost" onClick={() => setConfirming(false)}>
              {t("birth.edit")}
            </Button>
            <Button onClick={() => void confirm()}>{t("birth.confirm")}</Button>
          </div>
        }
      />
    </StepShell>
  );
}
