"use client";

import type { EventDetail, EventInput, SpotView } from "@atomes/contracts";
import { EVENT_RULES, SCHOOLS, type SchoolSlug } from "@atomes/core";
import { ORPCError } from "@orpc/client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { api } from "@/lib/api-client";

/** `datetime-local` works in the browser's time zone, like the members reading the event. */
const toLocalInput = (iso: string | null) => {
  if (!iso) {
    return "";
  }
  const date = new Date(iso);
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
};

const ERRORS = [
  "title_required",
  "organizer_required",
  "no_place",
  "in_the_past",
  "too_far",
  "ends_before_start",
  "too_long",
  "unknown_spot",
] as const;

/** Creating or editing an event (IRL-01), for organizers. */
export function EventForm({ spots, event }: { spots: SpotView[]; event?: EventDetail }) {
  const t = useTranslations("events.form");
  const events = useTranslations("events");
  const router = useRouter();
  const [place, setPlace] = useState<"spot" | "other">(event?.spot ? "spot" : event ? "other" : "spot");
  const [schools, setSchools] = useState<SchoolSlug[]>((event?.schoolSlugs ?? []) as SchoolSlug[]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (form: FormData) => {
    const text = (name: string) => String(form.get(name) ?? "").trim();
    const startsAt = text("startsAt");
    const endsAt = text("endsAt");
    const input: EventInput = {
      title: text("title"),
      organizerName: text("organizerName"),
      description: text("description"),
      venue: place === "other" ? text("venue") || null : null,
      spotId: place === "spot" ? text("spotId") || null : null,
      startsAt: startsAt ? new Date(startsAt).toISOString() : "",
      endsAt: endsAt ? new Date(endsAt).toISOString() : null,
      schoolSlugs: schools,
    };
    setBusy(true);
    setError(null);
    try {
      const result = event
        ? await api.events.update({ ...input, eventId: event.id })
        : await api.events.create(input);
      router.push(`/campus/evenements/${result.eventId}`);
      router.refresh();
    } catch (failure) {
      const reason =
        failure instanceof ORPCError ? ERRORS.find((code) => code === failure.message) : undefined;
      setError(reason ? t(`errors.${reason}`) : t("errors.generic"));
      setBusy(false);
    }
  };

  const field =
    "rounded-2xl border border-paper/20 bg-transparent px-4 py-3 focus:border-volt focus:outline-none";

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-2xl flex-col gap-5 px-4 pt-6 pb-10">
      <header className="flex flex-col gap-2">
        <Link
          href={event ? `/campus/evenements/${event.id}` : "/campus/evenements"}
          className="self-start text-paper/70 text-sm underline-offset-4 hover:underline"
        >
          {event?.title ?? events("title")}
        </Link>
        <h1 className="font-display font-semibold text-3xl tracking-tight">
          {event ? t("editTitle") : t("createTitle")}
        </h1>
        <p className="text-paper/75">{t("lead")}</p>
      </header>

      <form
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          void submit(new FormData(e.currentTarget));
        }}
      >
        <label className="flex flex-col gap-1.5">
          <span className="font-semibold">{t("title")}</span>
          <input
            name="title"
            required
            maxLength={EVENT_RULES.titleMaxLength}
            defaultValue={event?.title}
            className={field}
          />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="font-semibold">{t("organizerName")}</span>
          <input
            name="organizerName"
            required
            maxLength={EVENT_RULES.organizerNameMaxLength}
            defaultValue={event?.organizerName}
            className={field}
          />
        </label>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="flex flex-col gap-1.5">
            <span className="font-semibold">{t("startsAt")}</span>
            <input
              type="datetime-local"
              name="startsAt"
              required
              defaultValue={toLocalInput(event?.startsAt ?? null)}
              className={field}
            />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="font-semibold">{t("endsAt")}</span>
            <input
              type="datetime-local"
              name="endsAt"
              defaultValue={toLocalInput(event?.endsAt ?? null)}
              className={field}
            />
          </label>
        </div>
        <fieldset className="flex flex-col gap-3">
          <legend className="mb-1.5 font-semibold">{t("place")}</legend>
          <div className="flex flex-wrap gap-4">
            {(["spot", "other"] as const).map((value) => (
              <label key={value} className="flex items-center gap-2">
                <input
                  type="radio"
                  name="place"
                  value={value}
                  checked={place === value}
                  onChange={() => setPlace(value)}
                  className="size-4 accent-volt"
                />
                {value === "spot" ? t("placeSpot") : t("placeOther")}
              </label>
            ))}
          </div>
          {place === "spot" ? (
            <label className="flex flex-col gap-1.5">
              <span className="text-paper/80 text-sm">{t("spot")}</span>
              <select
                name="spotId"
                defaultValue={event?.spot?.id ?? spots[0]?.id}
                className={`${field} bg-ink`}
              >
                {spots.map((spot) => (
                  <option key={spot.id} value={spot.id}>
                    {spot.name}
                  </option>
                ))}
              </select>
            </label>
          ) : (
            <label className="flex flex-col gap-1.5">
              <span className="text-paper/80 text-sm">{t("venue")}</span>
              <input
                name="venue"
                required
                maxLength={EVENT_RULES.venueMaxLength}
                defaultValue={event && !event.spot ? event.venue : undefined}
                className={field}
              />
            </label>
          )}
        </fieldset>
        <label className="flex flex-col gap-1.5">
          <span className="font-semibold">{t("description")}</span>
          <textarea
            name="description"
            rows={5}
            maxLength={EVENT_RULES.descriptionMaxLength}
            defaultValue={event?.description}
            className={`${field} resize-y`}
          />
        </label>
        <fieldset className="flex flex-col gap-2">
          <legend className="font-semibold">{t("schools")}</legend>
          <p className="text-paper/70 text-sm">{t("schoolsHint")}</p>
          <div className="flex flex-wrap gap-3">
            {SCHOOLS.map((school) => (
              <label key={school.slug} className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={schools.includes(school.slug)}
                  onChange={(e) =>
                    setSchools((current) =>
                      e.target.checked ? [...current, school.slug] : current.filter((s) => s !== school.slug),
                    )
                  }
                  className="size-4 accent-volt"
                />
                {school.name}
              </label>
            ))}
          </div>
        </fieldset>
        {error && (
          <p role="alert" className="rounded-2xl bg-plasma/15 px-4 py-3 text-sm">
            {error}
          </p>
        )}
        <button
          type="submit"
          disabled={busy}
          className="self-start rounded-full bg-volt px-6 py-3 font-semibold text-ink disabled:opacity-50"
        >
          {event ? t("save") : t("publish")}
        </button>
      </form>
    </main>
  );
}
