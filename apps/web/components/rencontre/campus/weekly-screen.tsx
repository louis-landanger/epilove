"use client";

import type { DistributionView, WeeklyView } from "@epilove/contracts";
import { SCHOOLS } from "@epilove/core";
import { ORPCError } from "@orpc/client";
import Link from "next/link";
import { useFormatter, useLocale, useTranslations } from "next-intl";
import { useState } from "react";
import { api } from "@/lib/rencontre/api.client";
import { contentLocale } from "@/lib/rencontre/locale";
import { schoolColor } from "../discovery/school";

const CAMPUS_TIME_ZONE = "Europe/Paris";

function Bars({
  distribution,
  labels,
  color,
  mine,
}: {
  distribution: DistributionView;
  labels: ReadonlyMap<string, string>;
  color: string;
  mine: string | null;
}) {
  const t = useTranslations("campus.weekly");
  return (
    <ul className="flex flex-col gap-2">
      {distribution.shares.map((share) => (
        <li key={share.option} className="flex flex-col gap-1">
          <span className="flex justify-between gap-3 text-sm">
            <span className={share.option === mine ? "font-semibold" : "text-paper/85"}>
              {labels.get(share.option) ?? share.option}
            </span>
            <span className="font-mono text-paper/70">{t("percent", { percent: share.percent })}</span>
          </span>
          <span aria-hidden="true" className="block h-2 overflow-hidden rounded-full bg-paper/10">
            <span
              className="block h-full rounded-full"
              style={{ width: `${share.percent}%`, background: color }}
            />
          </span>
        </li>
      ))}
    </ul>
  );
}

/** Question of the week (COM-01): answer, then see the campus and each school (from ten answers). */
export function WeeklyScreen({ initial }: { initial: WeeklyView }) {
  const t = useTranslations("campus.weekly");
  const locale = contentLocale(useLocale());
  const format = useFormatter();
  const [view, setView] = useState(initial);
  const [changing, setChanging] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const question = view.question;
  const labels = new Map(question?.options.map((o) => [o.value, o.label]) ?? []);

  const answer = async (option: string) => {
    if (!question) {
      return;
    }
    setBusy(true);
    setNotice(null);
    try {
      setView(await api.community.answerWeekly({ questionId: question.id, option, locale }));
      setChanging(false);
    } catch (error) {
      if (error instanceof ORPCError && error.message === "closed") {
        setView(await api.community.weekly({ locale }));
        setNotice(t("closed"));
      } else {
        setNotice(t("error"));
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-2xl flex-col gap-6 px-4 pt-6 pb-10">
      <header className="flex flex-col gap-2">
        <Link href="/campus" className="self-start text-paper/70 text-sm underline-offset-4 hover:underline">
          {t("back")}
        </Link>
        <h1 className="font-display font-semibold text-3xl tracking-tight">{t("title")}</h1>
        <p className="text-paper/75">{t("lead")}</p>
      </header>

      {!question ? (
        <p className="rounded-3xl border border-paper/15 border-dashed px-5 py-10 text-center text-paper/70">
          {t("none")}
        </p>
      ) : (
        <section
          aria-labelledby="weekly-question"
          className="relative flex flex-col gap-5 overflow-hidden rounded-3xl border border-paper/10 p-6"
        >
          <span
            aria-hidden="true"
            className="absolute -top-24 -left-16 size-64 rounded-full bg-volt/10 blur-3xl"
          />
          <p className="relative font-mono text-paper/60 text-xs uppercase tracking-widest">
            {t("until", {
              date: format.dateTime(new Date(new Date(view.endsAt).getTime() - 1), {
                weekday: "long",
                day: "numeric",
                month: "long",
                timeZone: CAMPUS_TIME_ZONE,
              }),
            })}
          </p>
          <h2 id="weekly-question" className="relative font-display font-semibold text-2xl">
            {question.text}
          </h2>
          {view.myAnswer && !changing ? (
            <div className="relative flex flex-wrap items-center gap-3">
              <p>
                <span className="text-paper/70">{t("yourAnswer")} </span>
                <span className="font-semibold">{labels.get(view.myAnswer)}</span>
              </p>
              <button
                type="button"
                onClick={() => setChanging(true)}
                className="text-paper/75 text-sm underline underline-offset-4"
              >
                {t("change")}
              </button>
            </div>
          ) : (
            <div className="relative grid gap-2 sm:grid-cols-2">
              {question.options.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  disabled={busy}
                  aria-pressed={view.myAnswer === option.value}
                  onClick={() => void answer(option.value)}
                  className="min-h-12 rounded-2xl border border-paper/20 px-4 py-3 text-left font-semibold transition hover:border-volt disabled:opacity-50 aria-pressed:border-volt aria-pressed:bg-volt/10"
                >
                  {option.label}
                </button>
              ))}
            </div>
          )}
          {notice && (
            <p role="status" className="relative text-sm">
              {notice}
            </p>
          )}
        </section>
      )}

      {view.results && (
        <section aria-labelledby="weekly-results" className="flex flex-col gap-5">
          <h2 id="weekly-results" className="font-display font-semibold text-xl">
            {t("resultsTitle")}
          </h2>
          {view.results.overall ? (
            <div className="flex flex-col gap-3 rounded-3xl bg-paper/[0.04] p-5">
              <h3 className="flex justify-between gap-3 font-semibold">
                {t("campus")}
                <span className="font-mono font-normal text-paper/60 text-xs">
                  {t("answers", { count: view.results.overall.total })}
                </span>
              </h3>
              <Bars
                distribution={view.results.overall}
                labels={labels}
                color="var(--color-volt)"
                mine={view.myAnswer}
              />
            </div>
          ) : (
            view.results.bySchool.length === 0 && <p className="text-paper/70">{t("notEnough")}</p>
          )}
          {view.results.bySchool.length > 0 && (
            <div className="flex flex-col gap-3">
              <h3 className="font-semibold">{t("bySchool")}</h3>
              <ul className="grid gap-3 sm:grid-cols-2">
                {view.results.bySchool.map((school) => (
                  <li
                    key={school.schoolSlug}
                    className="flex flex-col gap-3 rounded-3xl border border-paper/10 p-4"
                  >
                    <p className="flex items-center justify-between gap-3 font-semibold">
                      <span className="flex items-center gap-2">
                        <span
                          aria-hidden="true"
                          className="size-2.5 rounded-full"
                          style={{ background: schoolColor(school.schoolSlug) }}
                        />
                        {SCHOOLS.find((s) => s.slug === school.schoolSlug)?.name ?? school.schoolSlug}
                      </span>
                      <span className="font-mono font-normal text-paper/60 text-xs">
                        {t("answers", { count: school.total })}
                      </span>
                    </p>
                    <Bars
                      distribution={school}
                      labels={labels}
                      color={schoolColor(school.schoolSlug)}
                      mine={null}
                    />
                  </li>
                ))}
              </ul>
            </div>
          )}
          <p className="text-paper/60 text-sm">{t("threshold")}</p>
        </section>
      )}
    </main>
  );
}
