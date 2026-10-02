import { SCHOOLS, type SchoolSlug } from "@epilove/core";
import { SchoolChip } from "@epilove/ui";
import { ExternalLink, Phone, Settings, Smartphone } from "lucide-react";
import type { Route } from "next";
import Link from "next/link";
import { getTranslations } from "next-intl/server";

const EMERGENCY = ["police", "eu", "samu", "sms"] as const;
const LISTEN = ["violence", "cyber", "suicide", "youth", "lgbt"] as const;

/** Official national services only: their addresses are stable and public. */
const OFFICIAL_LINKS = {
  violence: "https://arretonslesviolences.gouv.fr",
  pharos: "https://www.internet-signalement.gouv.fr",
} as const;

function telHref(number: string) {
  return `tel:${number.replaceAll(" ", "")}`;
}

/** Emergency numbers, helplines and the schools' services against sexual and gender-based violence (SAF-15). */
export async function HelpResources({ embedded = false }: { embedded?: boolean }) {
  const t = await getTranslations("help");
  const Root = embedded ? "div" : "main";
  return (
    <Root className="mx-auto flex w-full max-w-2xl flex-col gap-10 px-4 py-8 sm:py-12">
      <header className="flex flex-col gap-3">
        <h1 className="font-display font-semibold text-4xl tracking-tight">{t("title")}</h1>
        <p className="text-lg text-paper/75">{t("lead")}</p>
      </header>

      <section aria-labelledby="emergency" className="flex flex-col gap-4">
        <h2 id="emergency" className="font-display font-semibold text-2xl tracking-tight">
          {t("emergency.title")}
        </h2>
        <ul className="grid gap-3 sm:grid-cols-2">
          {EMERGENCY.map((key) => {
            const number = t(`emergency.items.${key}.number`);
            return (
              <li key={key}>
                <a
                  href={telHref(number)}
                  aria-label={t("call", { number })}
                  className="flex items-center gap-4 rounded-3xl border border-danger/40 bg-danger/10 p-4 transition-colors hover:bg-danger/20 focus-visible:outline-2 focus-visible:outline-volt"
                >
                  <span className="font-display font-semibold text-3xl tabular-nums">{number}</span>
                  <span className="text-paper/80 text-sm">{t(`emergency.items.${key}.label`)}</span>
                </a>
              </li>
            );
          })}
        </ul>
      </section>

      <section aria-labelledby="listen" className="flex flex-col gap-4">
        <h2 id="listen" className="font-display font-semibold text-2xl tracking-tight">
          {t("listen.title")}
        </h2>
        <ul className="flex flex-col divide-y divide-paper/10 rounded-[2rem] border border-paper/10 bg-paper/[0.03]">
          {LISTEN.map((key) => {
            const number = t(`listen.items.${key}.number`);
            return (
              <li key={key}>
                <a
                  href={telHref(number)}
                  className="flex items-center justify-between gap-4 p-4 transition-colors hover:bg-paper/5 focus-visible:outline-2 focus-visible:outline-volt"
                >
                  <span className="flex flex-col">
                    <span className="font-mono font-semibold">{number}</span>
                    <span className="text-paper/70 text-sm">{t(`listen.items.${key}.label`)}</span>
                  </span>
                  <Phone className="size-4 shrink-0 text-paper/50" aria-hidden="true" />
                </a>
              </li>
            );
          })}
        </ul>
      </section>

      <section aria-labelledby="outside" className="flex flex-col gap-4">
        <h2 id="outside" className="font-display font-semibold text-2xl tracking-tight">
          {t("report.title")}
        </h2>
        <ul className="flex flex-col gap-2">
          {(["violence", "pharos"] as const).map((key) => (
            <li key={key}>
              <a
                href={OFFICIAL_LINKS[key]}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-start gap-2 text-paper underline decoration-paper/30 underline-offset-4 hover:decoration-paper"
              >
                <ExternalLink className="mt-1 size-4 shrink-0" aria-hidden="true" />
                {t(`report.${key}`)}
              </a>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="schools" className="flex flex-col gap-4">
        <h2 id="schools" className="font-display font-semibold text-2xl tracking-tight">
          {t("schools.title")}
        </h2>
        <p className="text-paper/70">{t("schools.lead")}</p>
        <ul className="flex flex-col gap-3">
          {SCHOOLS.map((school) => (
            <li
              key={school.slug}
              className="flex flex-col gap-2 rounded-3xl border border-paper/10 p-4 sm:flex-row sm:items-center"
            >
              <SchoolChip school={school.slug as SchoolSlug} name={school.name} className="self-start" />
              <span className="text-paper/80 text-sm">{t(`schools.${school.slug as SchoolSlug}`)}</span>
            </li>
          ))}
        </ul>
        <p className="text-paper/50 text-xs">{t("schools.verified")}</p>
      </section>

      <section aria-labelledby="in-app" className="flex flex-col gap-4">
        <h2 id="in-app" className="font-display font-semibold text-2xl tracking-tight">
          {t("inApp.title")}
        </h2>
        <ul className="flex list-disc flex-col gap-2 pl-5 text-paper/80">
          <li>{t("inApp.block")}</li>
          <li>{t("inApp.report")}</li>
          <li>{t("inApp.hide")}</li>
        </ul>
        <Link
          href={"/reglages" as Route}
          className="inline-flex items-center gap-2 self-start rounded-2xl bg-paper/10 px-4 py-2.5 font-semibold text-sm hover:bg-paper/15 focus-visible:outline-2 focus-visible:outline-volt"
        >
          <Settings className="size-4" aria-hidden="true" />
          {t("inApp.settings")}
        </Link>
      </section>

      {embedded ? null : (
        <Link
          href={"/aide/installer" as Route}
          className="flex items-center gap-4 rounded-3xl border border-paper/10 bg-paper/[0.03] p-5 transition-colors hover:bg-paper/5 focus-visible:outline-2 focus-visible:outline-volt"
        >
          <Smartphone className="size-6 shrink-0 text-volt" aria-hidden="true" />
          <span className="flex flex-col gap-1">
            <span className="font-semibold">{t("install.helpLink.title")}</span>
            <span className="text-paper/70 text-sm">{t("install.helpLink.body")}</span>
          </span>
        </Link>
      )}
    </Root>
  );
}
