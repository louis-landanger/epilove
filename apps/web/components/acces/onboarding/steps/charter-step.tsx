"use client";

import { Button, cn } from "@epilove/ui";
import { EyeOff, HeartHandshake, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { StepShell } from "../step-shell";
import type { StepProps } from "../types";

const SCREENS = [
  { key: "respect", Icon: HeartHandshake },
  { key: "consent", Icon: ShieldCheck },
  { key: "discretion", Icon: EyeOff },
] as const;

/** Community charter in three short screens (ONB-04, docs/07, A7). */
export function CharterStep({ state, save, pending, focusTitle }: StepProps) {
  const t = useTranslations("onboarding.charter");
  const [index, setIndex] = useState(state.answers.charterAccepted ? SCREENS.length - 1 : 0);
  const screen = SCREENS[index] ?? SCREENS[0];
  const last = index === SCREENS.length - 1;

  return (
    <StepShell
      key={screen.key}
      eyebrow={t("eyebrow")}
      title={t(`screens.${screen.key}.title`)}
      lead={t(`screens.${screen.key}.body`)}
      focusTitle={focusTitle || index > 0}
      onSubmit={() => (last ? void save({ step: "charter", accepted: true }) : setIndex(index + 1))}
      actions={
        <>
          {last ? (
            <p className="text-paper/60 text-sm">
              {t.rich("legal", {
                terms: (chunks) => (
                  <Link href="/legal/cgu" className="text-paper underline underline-offset-4" target="_blank">
                    {chunks}
                  </Link>
                ),
                privacy: (chunks) => (
                  <Link
                    href="/legal/confidentialite"
                    className="text-paper underline underline-offset-4"
                    target="_blank"
                  >
                    {chunks}
                  </Link>
                ),
              })}
            </p>
          ) : null}
          <Button type="submit" size="lg" block loading={pending}>
            {last ? t("accept") : t("next")}
          </Button>
        </>
      }
    >
      <div className="flex flex-1 flex-col items-center justify-center gap-8 py-6">
        <div className="relative grid size-40 place-items-center">
          <div
            aria-hidden="true"
            className="absolute inset-0 rounded-full bg-[conic-gradient(from_120deg,var(--color-plasma),var(--color-volt),var(--color-plasma))] opacity-30 blur-2xl motion-safe:animate-pulse"
          />
          <div className="relative grid size-28 place-items-center rounded-full border border-paper/15 bg-ink2">
            <screen.Icon className="size-12 text-plasma" aria-hidden="true" strokeWidth={1.5} />
          </div>
        </div>
        <ol className="flex gap-2" aria-label={t("eyebrow")}>
          {SCREENS.map((item, position) => (
            <li
              key={item.key}
              aria-current={position === index ? "step" : undefined}
              className={cn(
                "h-1.5 rounded-full transition-[width,background-color] duration-300",
                position === index ? "w-8 bg-plasma" : "w-1.5 bg-paper/25",
              )}
            >
              <span className="sr-only">{t(`screens.${item.key}.title`)}</span>
            </li>
          ))}
        </ol>
      </div>
    </StepShell>
  );
}
