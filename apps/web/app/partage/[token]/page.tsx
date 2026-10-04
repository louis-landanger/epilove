import { EMERGENCY_NUMBERS } from "@atomes/core";
import type { Metadata } from "next";
import { getFormatter, getTranslations } from "next-intl/server";
import { serverApi } from "@/lib/rencontre/api.server";
import { gated } from "@/lib/rencontre/gate";

const CAMPUS_TIME_ZONE = "Europe/Paris";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("chat.safetyKit.public");
  // The token stays out of other sites' logs and out of search engines.
  return { title: t("metaTitle"), robots: { index: false, follow: false }, referrer: "no-referrer" };
}

/**
 * The trusted person's page (IRL-03): no account, only the unguessable link.
 * Who, where, when, and the member's answer after the date.
 */
export default async function SharedDatePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const t = await getTranslations("chat.safetyKit");
  const format = await getFormatter();
  const api = await serverApi();
  const result = /^[A-Za-z0-9_-]{20,100}$/.test(token)
    ? await gated(() => api.dateSafety.shared({ token }))
    : null;

  if (!result?.ok) {
    return (
      <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-3 px-4 text-center">
        <h1 className="font-display font-semibold text-2xl">{t("public.goneTitle")}</h1>
        <p className="text-paper/75">{t("public.goneLead")}</p>
      </main>
    );
  }
  const shared = result.data;
  const time = (iso: string) =>
    format.dateTime(new Date(iso), { hour: "2-digit", minute: "2-digit", timeZone: CAMPUS_TIME_ZONE });
  const sharer = shared.sharerFirstName;

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-xl flex-col gap-6 px-4 pt-8 pb-10">
      <header className="flex flex-col gap-2">
        <p className="font-mono text-paper/60 text-xs uppercase tracking-widest">Atomes</p>
        <h1 className="font-display font-semibold text-3xl tracking-tight">{t("public.title")}</h1>
        <p className="text-paper/80">{t("public.lead", { sharer })}</p>
      </header>

      <dl className="flex flex-col gap-3 rounded-3xl border border-paper/10 p-5">
        <div className="flex flex-col gap-0.5">
          <dt className="font-mono text-paper/60 text-xs uppercase tracking-widest">{t("public.with")}</dt>
          <dd className="font-semibold text-lg">{shared.otherFirstName}</dd>
        </div>
        <div className="flex flex-col gap-0.5">
          <dt className="font-mono text-paper/60 text-xs uppercase tracking-widest">{t("public.where")}</dt>
          <dd>{shared.place}</dd>
          {shared.mapUrl && (
            <dd>
              <a
                href={shared.mapUrl}
                rel="noreferrer noopener"
                target="_blank"
                className="text-sm underline underline-offset-4"
              >
                {t("public.map")}
              </a>
            </dd>
          )}
        </div>
        <div className="flex flex-col gap-0.5">
          <dt className="font-mono text-paper/60 text-xs uppercase tracking-widest">{t("public.when")}</dt>
          <dd>
            <time dateTime={shared.startsAt}>
              {format.dateTime(new Date(shared.startsAt), {
                weekday: "long",
                day: "numeric",
                month: "long",
                hour: "2-digit",
                minute: "2-digit",
                timeZone: CAMPUS_TIME_ZONE,
              })}
            </time>
          </dd>
        </div>
      </dl>

      <section
        aria-labelledby="news-title"
        className={`flex flex-col gap-2 rounded-3xl p-5 ${
          shared.checkIn?.answer === "help"
            ? "border border-plasma/60 bg-plasma/10"
            : shared.checkIn?.answer === "ok"
              ? "border border-volt/50 bg-volt/10"
              : "border border-paper/10"
        }`}
      >
        <h2 id="news-title" className="font-display font-semibold text-xl">
          {t("public.newsTitle")}
        </h2>
        <p role="status">
          {shared.checkIn
            ? t(`public.${shared.checkIn.answer}`, { sharer, time: time(shared.checkIn.at) })
            : t("public.pending", { sharer })}
        </p>
        <a href={`/partage/${token}`} className="self-start text-sm underline underline-offset-4">
          {t("public.refresh")}
        </a>
      </section>

      <section aria-labelledby="numbers-title" className="flex flex-col gap-2">
        <h2 id="numbers-title" className="font-semibold">
          {t("emergencyTitle")}
        </h2>
        <ul className="grid gap-2 sm:grid-cols-2">
          {EMERGENCY_NUMBERS.map((number) => (
            <li key={number.id}>
              <a
                href={number.href}
                className="flex min-h-11 items-center rounded-2xl border border-paper/15 px-4 py-2 text-sm"
              >
                {t(`numbers.${number.id}`)}
              </a>
            </li>
          ))}
        </ul>
      </section>

      <footer className="flex flex-col gap-1 text-paper/60 text-sm">
        <p>
          {t("public.expires", {
            date: format.dateTime(new Date(shared.expiresAt), {
              day: "numeric",
              month: "long",
              hour: "2-digit",
              minute: "2-digit",
              timeZone: CAMPUS_TIME_ZONE,
            }),
          })}
        </p>
        <p>{t("public.about")}</p>
      </footer>
    </main>
  );
}
