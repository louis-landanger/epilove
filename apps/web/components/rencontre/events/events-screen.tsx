import type { EventSummary } from "@atomes/contracts";
import { SCHOOLS } from "@atomes/core";
import Link from "next/link";
import { getFormatter, getTranslations } from "next-intl/server";

const CAMPUS_TIME_ZONE = "Europe/Paris";

/** School names describe who an event is for (eligibility only, never branding). */
export function schoolNames(slugs: readonly string[]): string {
  return slugs.map((slug) => SCHOOLS.find((s) => s.slug === slug)?.name ?? slug).join(", ");
}

/** Campus events (IRL-01): what the societies put on, soonest first. */
export async function EventsScreen({
  events,
  filter,
  canOrganize,
}: {
  events: EventSummary[];
  filter: "upcoming" | "mine";
  canOrganize: boolean;
}) {
  const t = await getTranslations("events");
  const format = await getFormatter();

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-3xl flex-col gap-5 px-4 pt-6 pb-10">
      <header className="flex flex-col gap-2">
        <Link href="/campus" className="self-start text-paper/70 text-sm underline-offset-4 hover:underline">
          {t("back")}
        </Link>
        <div className="flex flex-wrap items-end justify-between gap-3">
          <h1 className="font-display font-semibold text-3xl tracking-tight">{t("title")}</h1>
          {canOrganize && (
            <Link
              href="/campus/evenements/nouveau"
              className="rounded-full bg-volt px-4 py-2 font-semibold text-ink text-sm"
            >
              {t("create")}
            </Link>
          )}
        </div>
        <p className="text-paper/75">{t("lead")}</p>
      </header>

      <nav aria-label={t("tabs.label")} className="flex gap-2">
        {(["upcoming", "mine"] as const).map((tab) => (
          <Link
            key={tab}
            href={tab === "mine" ? "/campus/evenements?filtre=mes" : "/campus/evenements"}
            aria-current={filter === tab ? "page" : undefined}
            className="rounded-full border border-paper/20 px-4 py-2 text-sm aria-[current=page]:border-volt aria-[current=page]:text-volt"
          >
            {t(`tabs.${tab}`)}
          </Link>
        ))}
      </nav>

      {events.length === 0 ? (
        <p className="rounded-3xl border border-paper/15 border-dashed px-5 py-10 text-center text-paper/70">
          {filter === "mine" ? t("emptyMine") : t("empty")}
        </p>
      ) : (
        <ol className="flex flex-col gap-3">
          {events.map((event) => {
            const startsAt = new Date(event.startsAt);
            const cancelled = event.status === "cancelled";
            return (
              <li key={event.id}>
                <Link
                  href={`/campus/evenements/${event.id}`}
                  className="flex gap-4 rounded-3xl border border-paper/10 bg-paper/[0.03] p-4 transition hover:border-volt/50 focus-visible:outline-2 focus-visible:outline-volt focus-visible:outline-offset-2"
                >
                  <span
                    aria-hidden="true"
                    className={`flex w-16 shrink-0 flex-col items-center justify-center rounded-2xl py-2 ${
                      cancelled ? "bg-paper/10 text-paper/60" : "bg-plasma/15 text-plasma"
                    }`}
                  >
                    <span className="font-mono text-xs uppercase">
                      {format.dateTime(startsAt, { weekday: "short", timeZone: CAMPUS_TIME_ZONE })}
                    </span>
                    <span className="font-display font-semibold text-2xl leading-none">
                      {format.dateTime(startsAt, { day: "numeric", timeZone: CAMPUS_TIME_ZONE })}
                    </span>
                    <span className="font-mono text-xs uppercase">
                      {format.dateTime(startsAt, { month: "short", timeZone: CAMPUS_TIME_ZONE })}
                    </span>
                  </span>
                  <span className="flex min-w-0 flex-1 flex-col gap-1">
                    <span className="flex flex-wrap items-center gap-2">
                      <span
                        className={`font-semibold text-lg ${cancelled ? "text-paper/60 line-through" : ""}`}
                      >
                        {event.title}
                      </span>
                      {cancelled && (
                        <span className="rounded-full bg-paper/10 px-2 py-0.5 font-mono text-xs">
                          {t("cancelled")}
                        </span>
                      )}
                    </span>
                    <span className="text-paper/70 text-sm">
                      <time dateTime={event.startsAt}>
                        {format.dateTime(startsAt, {
                          weekday: "long",
                          day: "numeric",
                          month: "long",
                          hour: "2-digit",
                          minute: "2-digit",
                          timeZone: CAMPUS_TIME_ZONE,
                        })}
                      </time>
                      {" · "}
                      {event.venue}
                    </span>
                    <span className="text-paper/60 text-sm">
                      {t("organizedBy", { name: event.organizerName })}
                      {" · "}
                      {event.schoolSlugs.length === 0
                        ? t("schoolsAll")
                        : t("schoolsSome", { schools: schoolNames(event.schoolSlugs) })}
                    </span>
                    <span className="mt-1 flex flex-wrap items-center gap-2 text-sm">
                      <span className="font-mono text-paper/70 text-xs">
                        {t("going", { count: event.going })}
                      </span>
                      {event.mine && (
                        <span className="rounded-full bg-volt/15 px-2.5 py-0.5 font-mono text-volt text-xs">
                          {t(`myStatus.${event.mine.status}`)}
                        </span>
                      )}
                      {event.organizing && (
                        <span className="rounded-full border border-paper/20 px-2.5 py-0.5 font-mono text-xs">
                          {t("organizing")}
                        </span>
                      )}
                    </span>
                  </span>
                </Link>
              </li>
            );
          })}
        </ol>
      )}
    </main>
  );
}
