import type { PactCurrent } from "@epilove/contracts";
import Link from "next/link";
import { getFormatter, getTranslations } from "next-intl/server";

const CAMPUS_TIME_ZONE = "Europe/Paris";

/**
 * The Campus tab (docs/02-design.md, navigation): what happens between the
 * five schools. For now the Pact and the questionnaire; events, Spots and the
 * question of the week join it as they ship.
 */
export async function CampusHub({ pact }: { pact: PactCurrent }) {
  const t = await getTranslations("campus.hub");
  const title = await getTranslations("campus");
  const format = await getFormatter();
  const season = pact.season;
  const date = (iso: string) =>
    format.dateTime(new Date(iso), { dateStyle: "long", timeStyle: "short", timeZone: CAMPUS_TIME_ZONE });

  const pactStatus = !season
    ? t("pact.none")
    : season.phase === "upcoming"
      ? t("pact.upcoming", { date: date(season.opensAt) })
      : season.phase === "open"
        ? t("pact.open", { date: date(season.closesAt) })
        : season.phase === "closed"
          ? t("pact.closed", { date: date(season.revealAt) })
          : t(`pact.${season.phase}`);

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-3xl flex-col gap-6 px-4 pt-6 pb-10">
      <header className="flex flex-col gap-1">
        <h1 className="font-display font-semibold text-3xl tracking-tight">{title("title")}</h1>
        <p className="text-paper/70">{t("lead")}</p>
      </header>
      <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <li>
          <Link
            href="/campus/pacte"
            className="group relative flex h-full flex-col gap-3 overflow-hidden rounded-3xl border border-paper/10 bg-paper/[0.03] p-5 transition hover:border-volt/60 focus-visible:outline-2 focus-visible:outline-volt focus-visible:outline-offset-2"
          >
            <span
              aria-hidden="true"
              className="absolute -top-16 -right-16 size-40 rounded-full bg-plasma/25 blur-3xl transition group-hover:bg-plasma/40"
            />
            <h2 className="font-display font-semibold text-2xl">{t("pact.title")}</h2>
            <p className="text-paper/75 text-sm">{pactStatus}</p>
            {pact.participation && season?.phase !== "revealed" && (
              <p className="self-start rounded-full bg-volt/15 px-3 py-1 font-mono text-volt text-xs">
                {t("pact.joined")}
              </p>
            )}
            <span className="mt-auto font-semibold text-sm">{t("pact.action")} →</span>
          </Link>
        </li>
        <li>
          <Link
            href="/campus/questionnaire"
            className="flex h-full flex-col gap-3 rounded-3xl border border-paper/10 bg-paper/[0.03] p-5 transition hover:border-volt/60 focus-visible:outline-2 focus-visible:outline-volt focus-visible:outline-offset-2"
          >
            <h2 className="font-display font-semibold text-2xl">{t("questionnaire.title")}</h2>
            <p className="text-paper/75 text-sm">{t("questionnaire.lead")}</p>
            <p className="font-mono text-paper/70 text-xs">
              {t("questionnaire.progress", { count: pact.questionnaire.answered })}
            </p>
            <span className="mt-auto font-semibold text-sm">{t("questionnaire.action")} →</span>
          </Link>
        </li>
        <li>
          <Link
            href="/campus/spots"
            className="flex h-full flex-col gap-3 rounded-3xl border border-paper/10 bg-paper/[0.03] p-5 transition hover:border-volt/60 focus-visible:outline-2 focus-visible:outline-volt focus-visible:outline-offset-2"
          >
            <h2 className="font-display font-semibold text-2xl">{t("spots.title")}</h2>
            <p className="text-paper/75 text-sm">{t("spots.lead")}</p>
            <span className="mt-auto font-semibold text-sm">{t("spots.action")} →</span>
          </Link>
        </li>
      </ul>
    </main>
  );
}
