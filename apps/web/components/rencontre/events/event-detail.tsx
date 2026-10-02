"use client";

import type { AttendingMatch, EventDetail } from "@epilove/contracts";
import { dateIcs, EVENT_RULES, type RsvpStatus } from "@epilove/core";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useFormatter, useTranslations } from "next-intl";
import { useId, useState } from "react";
import { api } from "@/lib/rencontre/api.client";
import { Sheet } from "../ui/sheet";

const CAMPUS_TIME_ZONE = "Europe/Paris";

/** One event (IRL-01): answer, share with one's matches (reciprocal), calendar, organizer tools. */
export function EventDetailScreen({
  initial,
  schools,
}: {
  initial: { event: EventDetail; matchesGoing: AttendingMatch[] | null };
  schools: string;
}) {
  const t = useTranslations("events");
  const format = useFormatter();
  const router = useRouter();
  const [event, setEvent] = useState(initial.event);
  const [matchesGoing, setMatchesGoing] = useState(initial.matchesGoing);
  const [share, setShare] = useState(initial.event.mine?.shareWithMatches ?? false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const shareHint = useId();

  const startsAt = new Date(event.startsAt);
  const endsAt = event.endsAt
    ? new Date(event.endsAt)
    : new Date(startsAt.getTime() + EVENT_RULES.defaultDurationMinutes * 60_000);
  const over = endsAt.getTime() <= Date.now();
  const cancelled = event.status === "cancelled";
  const open = !cancelled && !over;

  const answer = async (status: RsvpStatus | null, shareWithMatches: boolean) => {
    setBusy(true);
    setError(null);
    try {
      const result = await api.events.rsvp({ eventId: event.id, status, shareWithMatches });
      setEvent((current) => ({ ...current, ...result.event }));
      setShare(status === null ? false : shareWithMatches);
      const fresh = await api.events.get({ eventId: event.id, locale: "fr" });
      setMatchesGoing(fresh.matchesGoing);
    } catch {
      setError(t("detail.error"));
    } finally {
      setBusy(false);
    }
  };

  const cancel = async () => {
    setBusy(true);
    try {
      await api.events.cancel({ eventId: event.id });
      setConfirmCancel(false);
      setEvent((current) => ({ ...current, status: "cancelled" }));
      router.refresh();
    } catch {
      setError(t("detail.error"));
    } finally {
      setBusy(false);
    }
  };

  const downloadIcs = () => {
    const ics = dateIcs({
      uid: event.id,
      startsAt,
      title: t("icsTitle", { title: event.title }),
      location: event.venue,
      description: t("organizedBy", { name: event.organizerName }),
      durationMinutes: Math.round((endsAt.getTime() - startsAt.getTime()) / 60_000),
    });
    const url = URL.createObjectURL(new Blob([ics], { type: "text/calendar;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = "evenement-epilove.ics";
    link.click();
    URL.revokeObjectURL(url);
  };

  const when = format.dateTimeRange(startsAt, endsAt, {
    weekday: "long",
    day: "numeric",
    month: "long",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: CAMPUS_TIME_ZONE,
  });

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-3xl flex-col gap-6 px-4 pt-6 pb-10">
      <header className="flex flex-col gap-3">
        <Link
          href="/campus/evenements"
          className="self-start text-paper/70 text-sm underline-offset-4 hover:underline"
        >
          {t("title")}
        </Link>
        <div className="relative overflow-hidden rounded-3xl border border-paper/10 p-6">
          <span
            aria-hidden="true"
            className="absolute -top-20 -right-10 size-56 rounded-full bg-plasma/30 blur-3xl"
          />
          <span
            aria-hidden="true"
            className="absolute -bottom-24 -left-10 size-56 rounded-full bg-volt/15 blur-3xl"
          />
          <p className="relative font-mono text-paper/70 text-xs uppercase tracking-widest">
            {t("organizedBy", { name: event.organizerName })}
          </p>
          <h1
            className={`relative mt-2 font-display font-semibold text-3xl tracking-tight ${
              cancelled ? "text-paper/60 line-through" : ""
            }`}
          >
            {event.title}
          </h1>
          <p className="relative mt-2 text-paper/70 text-sm">{schools}</p>
        </div>
        {cancelled && (
          <p role="status" className="rounded-2xl bg-plasma/15 px-4 py-3">
            {t("detail.isCancelled")}
          </p>
        )}
        {!cancelled && over && (
          <p role="status" className="rounded-2xl bg-paper/10 px-4 py-3">
            {t("detail.isOver")}
          </p>
        )}
      </header>

      <dl className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1 rounded-3xl border border-paper/10 p-4">
          <dt className="font-mono text-paper/60 text-xs uppercase tracking-widest">{t("detail.when")}</dt>
          <dd>
            <time dateTime={event.startsAt}>{when}</time>
          </dd>
          {open && (
            <dd>
              <button
                type="button"
                onClick={downloadIcs}
                className="mt-1 text-sm underline underline-offset-4"
              >
                {t("detail.calendar")}
              </button>
            </dd>
          )}
        </div>
        <div className="flex flex-col gap-1 rounded-3xl border border-paper/10 p-4">
          <dt className="font-mono text-paper/60 text-xs uppercase tracking-widest">{t("detail.where")}</dt>
          <dd>{event.venue}</dd>
          {event.spot && (
            <dd>
              <Link href="/campus/spots" className="mt-1 text-sm underline underline-offset-4">
                {t("detail.spot")}
              </Link>
            </dd>
          )}
        </div>
      </dl>

      {event.description && (
        <section aria-labelledby="event-about" className="flex flex-col gap-2">
          <h2 id="event-about" className="font-display font-semibold text-xl">
            {t("detail.about")}
          </h2>
          <p className="whitespace-pre-wrap text-paper/85">{event.description}</p>
        </section>
      )}

      <section
        aria-labelledby="event-rsvp"
        className="flex flex-col gap-4 rounded-3xl border border-paper/10 p-5"
      >
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 id="event-rsvp" className="font-display font-semibold text-xl">
            {t("detail.rsvpTitle")}
          </h2>
          <p className="font-mono text-paper/70 text-xs">
            {t("going", { count: event.going })}
            {event.maybe > 0 && ` · ${t("maybe", { count: event.maybe })}`}
          </p>
        </div>
        {open && (
          <>
            <div className="flex flex-wrap gap-2">
              {(["going", "maybe"] as const).map((status) => (
                <button
                  key={status}
                  type="button"
                  disabled={busy}
                  aria-pressed={event.mine?.status === status}
                  onClick={() => void answer(status, share)}
                  className="rounded-full border border-paper/25 px-5 py-2.5 font-semibold disabled:opacity-50 aria-pressed:border-volt aria-pressed:bg-volt aria-pressed:text-ink"
                >
                  {t(`detail.${status}`)}
                </button>
              ))}
              {event.mine && (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void answer(null, false)}
                  className="rounded-full px-4 py-2.5 text-paper/75 text-sm underline-offset-4 hover:underline disabled:opacity-50"
                >
                  {t("detail.withdraw")}
                </button>
              )}
            </div>
            <label className="flex items-start gap-3">
              <input
                type="checkbox"
                checked={share}
                disabled={busy}
                aria-describedby={shareHint}
                onChange={(e) => {
                  const next = e.target.checked;
                  setShare(next);
                  if (event.mine) {
                    void answer(event.mine.status, next);
                  }
                }}
                className="mt-1 size-5 accent-volt"
              />
              <span className="flex flex-col">
                <span className="font-semibold">{t("detail.share")}</span>
                <span id={shareHint} className="text-paper/70 text-sm">
                  {t("detail.shareHint")}
                </span>
              </span>
            </label>
          </>
        )}
        {error && (
          <p role="alert" className="text-plasma text-sm">
            {error}
          </p>
        )}
      </section>

      <section aria-labelledby="event-matches" className="flex flex-col gap-3">
        <h2 id="event-matches" className="font-display font-semibold text-xl">
          {t("detail.matchesTitle")}
        </h2>
        {matchesGoing === null ? (
          <p className="text-paper/70 text-sm">{t("detail.matchesHidden")}</p>
        ) : matchesGoing.length === 0 ? (
          <p className="text-paper/70 text-sm">{t("detail.matchesEmpty")}</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {matchesGoing.map((match) => (
              <li
                key={match.userId}
                className="flex items-center gap-3 rounded-2xl bg-paper/[0.04] px-3 py-2"
              >
                {match.photoUrl ? (
                  // biome-ignore lint/performance/noImgElement: a signed imgproxy URL, already resized.
                  <img
                    src={match.photoUrl}
                    alt=""
                    width={40}
                    height={40}
                    className="size-10 rounded-full object-cover"
                  />
                ) : (
                  <span aria-hidden="true" className="size-10 rounded-full bg-paper/15" />
                )}
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="font-semibold">{match.firstName}</span>
                  <span className="text-paper/60 text-xs">{t(`matchStatus.${match.status}`)}</span>
                </span>
                <Link
                  href={`/messages/${match.matchId}`}
                  className="rounded-full border border-paper/20 px-3 py-1.5 text-sm"
                >
                  {t("detail.write", { name: match.firstName })}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      {event.organizing && !cancelled && (
        <div className="flex flex-wrap gap-3 border-paper/10 border-t pt-5">
          {!over && (
            <Link
              href={`/campus/evenements/${event.id}/modifier`}
              className="rounded-full border border-paper/25 px-5 py-2.5 font-semibold"
            >
              {t("detail.edit")}
            </Link>
          )}
          <button
            type="button"
            onClick={() => setConfirmCancel(true)}
            className="rounded-full px-4 py-2.5 text-plasma underline-offset-4 hover:underline"
          >
            {t("detail.cancel")}
          </button>
        </div>
      )}

      <Sheet open={confirmCancel} onClose={() => setConfirmCancel(false)} labelledBy="cancel-event">
        <h2 id="cancel-event" className="font-display font-semibold text-xl">
          {t("detail.cancelTitle")}
        </h2>
        <p className="text-paper/75">{t("detail.cancelLead")}</p>
        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            onClick={() => setConfirmCancel(false)}
            className="rounded-full bg-paper px-5 py-3 font-semibold text-ink"
          >
            {t("detail.cancelKeep")}
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => void cancel()}
            className="rounded-full border border-plasma/60 px-5 py-3 font-semibold text-plasma disabled:opacity-50"
          >
            {t("detail.cancelConfirm")}
          </button>
        </div>
      </Sheet>
    </main>
  );
}
