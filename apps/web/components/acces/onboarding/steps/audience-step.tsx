"use client";

import { ageOn, defaultAgeRange, GENDERS, type Gender, MAX_AGE_PREFERENCE, MINIMUM_AGE } from "@epilove/core";
import { Button, CheckboxField, ChoiceGroup, RangeField } from "@epilove/ui";
import { ShieldAlert } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { StepShell } from "../step-shell";
import type { StepProps } from "../types";

const AGE_SLIDER_MAX = 45;

/**
 * "Who do you want to see": separate, explicit consent to sensitive data
 * (ONB-05, docs/08 section 3.1), genders sought and age range. Refusing is a
 * first-class option that keeps Friends mode.
 */
export function AudienceStep({ state, save, pending, focusTitle }: StepProps) {
  const t = useTranslations("onboarding");
  const { answers } = state;
  const love = answers.modes.includes("love");
  const age = answers.birthDate ? ageOn(answers.birthDate, state.today) : MINIMUM_AGE;
  const suggested = defaultAgeRange(age);
  const [range, setRange] = useState<[number, number]>([
    answers.ageMin ?? suggested.min,
    Math.min(answers.ageMax ?? suggested.max, AGE_SLIDER_MAX),
  ]);
  const [consent, setConsent] = useState(answers.sensitiveConsent);
  const [interestedIn, setInterestedIn] = useState<Gender[]>(answers.interestedIn);
  const [error, setError] = useState<"interestedIn" | null>(null);

  const ageMax = range[1] >= AGE_SLIDER_MAX ? MAX_AGE_PREFERENCE : range[1];

  async function submit(withConsent: boolean) {
    if (love && withConsent && interestedIn.length === 0) {
      setError("interestedIn");
      return;
    }
    const result = await save({
      step: "audience",
      ageMin: range[0],
      ageMax,
      sensitiveConsent: love && withConsent,
      interestedIn: love && withConsent ? interestedIn : [],
    });
    if (!result.ok && result.field === "interestedIn") {
      setError("interestedIn");
    }
  }

  const ageField = (
    <RangeField
      label={t("audience.ageLabel")}
      min={MINIMUM_AGE}
      max={AGE_SLIDER_MAX}
      value={range}
      onChange={setRange}
      formatValue={(value) =>
        value >= AGE_SLIDER_MAX ? `${AGE_SLIDER_MAX}+` : t("audience.ageValue", { age: value })
      }
      thumbLabels={[t("audience.ageMin"), t("audience.ageMax")]}
    />
  );

  if (!love) {
    return (
      <StepShell
        title={t("audience.title")}
        lead={t("audience.friendsOnlyLead")}
        focusTitle={focusTitle}
        onSubmit={() => void submit(false)}
        actions={
          <Button type="submit" size="lg" block loading={pending}>
            {t("continue")}
          </Button>
        }
      >
        {ageField}
      </StepShell>
    );
  }

  return (
    <StepShell
      title={t("audience.title")}
      focusTitle={focusTitle}
      onSubmit={() => void submit(true)}
      actions={
        <>
          <Button
            type="submit"
            size="lg"
            block
            loading={pending}
            disabled={!consent || interestedIn.length === 0}
          >
            {t("continue")}
          </Button>
          <Button variant="ghost" block disabled={pending} onClick={() => void submit(false)}>
            {t("audience.withoutConsent")}
          </Button>
        </>
      }
    >
      <section
        aria-labelledby="sensitive-title"
        className="flex flex-col gap-4 rounded-3xl border border-paper/10 bg-paper/[0.03] p-5"
      >
        <div className="flex items-center gap-3">
          <ShieldAlert className="size-5 shrink-0 text-volt" aria-hidden="true" />
          <h2 id="sensitive-title" className="font-semibold text-lg">
            {t("audience.consentTitle")}
          </h2>
        </div>
        <p className="text-paper/75 text-sm leading-relaxed">{t("audience.consentBody")}</p>
        <CheckboxField
          label={t("audience.consentLabel")}
          description={t("audience.consentHelp")}
          checked={consent}
          onCheckedChange={(checked) => {
            setConsent(checked);
            setError(null);
          }}
        />
      </section>
      {consent ? (
        <ChoiceGroup<Gender>
          label={t("audience.interestedInLabel")}
          multiple
          choices={GENDERS.map((value) => ({ value, label: t(`audience.interestedIn.${value}`) }))}
          value={interestedIn}
          onChange={(next) => {
            setInterestedIn(next);
            setError(null);
          }}
          error={error === "interestedIn" ? t("audience.interestedInRequired") : null}
        />
      ) : (
        <p className="text-paper/60 text-sm">{t("audience.withoutConsentNote")}</p>
      )}
      {ageField}
    </StepShell>
  );
}
