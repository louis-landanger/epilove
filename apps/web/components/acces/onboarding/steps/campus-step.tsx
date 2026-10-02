"use client";

import { PROGRAM_MAX_LENGTH, SCHOOLS, type SchoolSlug } from "@epilove/core";
import { Button, CheckboxField, ChoiceGroup, SchoolChip, TextField } from "@epilove/ui";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { StepShell } from "../step-shell";
import type { StepProps } from "../types";

/** Campus and class (ONB-07, ONB-12): school from the email, declared year and status. */
export function CampusStep({ state, save, pending, focusTitle }: StepProps) {
  const t = useTranslations("onboarding");
  const { min, max } = state.graduationYears;
  const years = Array.from({ length: max - min + 1 }, (_, index) => String(min + index));
  const [year, setYear] = useState<string | null>(
    state.answers.graduationYear ? String(state.answers.graduationYear) : null,
  );
  const [program, setProgram] = useState(state.answers.program ?? "");
  const [onCampus, setOnCampus] = useState(state.answers.campusDeclared);
  const [student, setStudent] = useState(state.answers.campusDeclared);
  const [error, setError] = useState<"year" | "declarations" | null>(null);
  const school = SCHOOLS.find((item) => item.slug === state.schoolSlug);

  async function submit() {
    if (!year) {
      setError("year");
      return;
    }
    if (!onCampus || !student) {
      setError("declarations");
      return;
    }
    const result = await save({
      step: "campus",
      graduationYear: Number(year),
      program: program.trim() || null,
      onCampus: true,
      student: true,
    });
    if (!result.ok && result.field === "graduationYear") {
      setError("year");
    }
  }

  return (
    <StepShell
      title={t("campus.title")}
      lead={t("campus.lead")}
      focusTitle={focusTitle}
      onSubmit={() => void submit()}
      actions={
        <Button type="submit" size="lg" block loading={pending} disabled={!year || !onCampus || !student}>
          {t("continue")}
        </Button>
      }
    >
      {school ? (
        <div className="flex items-center gap-3">
          <span className="text-paper/60 text-sm">{t("campus.school")}</span>
          <SchoolChip school={school.slug as SchoolSlug} name={school.name} />
        </div>
      ) : null}
      <ChoiceGroup
        label={t("campus.yearLabel")}
        choices={years.map((value) => ({ value, label: value }))}
        value={year ? [year] : []}
        onChange={(next) => {
          setYear(next[0] ?? null);
          setError(null);
        }}
        error={error === "year" ? t("campus.yearRequired") : null}
      />
      <TextField
        label={t("campus.programLabel")}
        placeholder={t("campus.programPlaceholder")}
        maxLength={PROGRAM_MAX_LENGTH}
        value={program}
        onChange={(event) => setProgram(event.target.value)}
      />
      <div className="flex flex-col gap-4 rounded-3xl border border-paper/10 bg-paper/[0.03] p-5">
        <CheckboxField
          label={t("campus.onCampus")}
          checked={onCampus}
          onCheckedChange={setOnCampus}
          required
        />
        <CheckboxField label={t("campus.student")} checked={student} onCheckedChange={setStudent} required />
        <p className="text-paper/55 text-sm">{t("campus.declarationsHelp")}</p>
        {error === "declarations" ? (
          <p role="alert" className="text-danger text-sm">
            {t("campus.declarationsRequired")}
          </p>
        ) : null}
      </div>
    </StepShell>
  );
}
