"use client";

import type { AvailabilityView } from "@epilove/contracts";
import { AVAILABILITY_ACTIVITIES, AVAILABILITY_AREAS } from "@epilove/core";
import { Sheet } from "@epilove/ui";
import { ORPCError } from "@orpc/client";
import { useFormatter, useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { api } from "@/lib/rencontre/api.client";

const CAMPUS_TIME_ZONE = "Europe/Paris";
const DURATIONS = [30, 60, 120, 180, 300] as const;

/** "Dispo pour un café au campus jusqu'à 16:30" (IRL-05). */
export function useDispoText() {
  const t = useTranslations("chat.dispo");
  const format = useFormatter();
  return (available: AvailabilityView) =>
    t("status", {
      activity: t(`activities.${available.activity}`),
      area: t(`areas.${available.area}`),
      time: format.dateTime(new Date(available.until), {
        hour: "2-digit",
        minute: "2-digit",
        timeZone: CAMPUS_TIME_ZONE,
      }),
    });
}

/** A match's status in the conversation list. */
export function DispoChip({ available }: { available: AvailabilityView }) {
  const t = useTranslations("chat.dispo");
  const text = useDispoText();
  return (
    <span
      title={text(available)}
      className="flex shrink-0 items-center gap-1 rounded-full bg-volt/15 px-2 py-0.5 font-mono text-[10px] text-volt uppercase"
    >
      <span aria-hidden="true" className="size-1.5 rounded-full bg-volt" />
      <span aria-hidden="true">{t("chip")}</span>
      <span className="sr-only">{text(available)}</span>
    </span>
  );
}

/** One's own "Dispo" status, at the top of the Messages tab. */
export function DispoControl() {
  const t = useTranslations("chat.dispo");
  const text = useDispoText();
  const [mine, setMine] = useState<AvailabilityView | null>(null);
  const [open, setOpen] = useState(false);
  const [activity, setActivity] = useState<AvailabilityView["activity"]>("coffee");
  const [area, setArea] = useState<AvailabilityView["area"]>("campus");
  const [duration, setDuration] = useState<number>(60);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void api.matches
      .availability()
      .then((result) => setMine(result.availability))
      .catch(() => undefined);
  }, []);

  const save = async (value: AvailabilityView | null) => {
    setBusy(true);
    setError(null);
    try {
      setMine((await api.matches.setAvailability({ availability: value })).availability);
      setOpen(false);
    } catch (failure) {
      setError(
        failure instanceof ORPCError && failure.code === "BAD_REQUEST"
          ? t("errors.duration")
          : t("errors.generic"),
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mb-6 flex flex-wrap items-center gap-2">
      {mine ? (
        <>
          <p className="flex items-center gap-2 rounded-full bg-volt/15 px-3 py-1.5 text-sm text-volt">
            <span aria-hidden="true" className="size-2 rounded-full bg-volt" />
            {text(mine)}
          </p>
          <button
            type="button"
            disabled={busy}
            onClick={() => void save(null)}
            className="rounded-full px-3 py-1.5 text-paper/75 text-sm underline-offset-4 hover:underline"
          >
            {t("clear")}
          </button>
        </>
      ) : (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="rounded-full border border-volt/50 px-4 py-2 text-sm text-volt"
        >
          {t("set")}
        </button>
      )}
      <Sheet open={open} onClose={() => setOpen(false)} labelledBy="dispo-title">
        <h2 id="dispo-title" className="font-display font-semibold text-xl">
          {t("title")}
        </h2>
        <p className="text-paper/75 text-sm">{t("lead")}</p>
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1 font-semibold text-sm">{t("what")}</legend>
          <div className="flex flex-wrap gap-2">
            {AVAILABILITY_ACTIVITIES.map((value) => (
              <button
                key={value}
                type="button"
                aria-pressed={activity === value}
                onClick={() => setActivity(value)}
                className="rounded-full border border-paper/20 px-3 py-1.5 text-sm aria-pressed:border-volt aria-pressed:text-volt"
              >
                {t(`activities.${value}`)}
              </button>
            ))}
          </div>
        </fieldset>
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1 font-semibold text-sm">{t("where")}</legend>
          <div className="flex flex-wrap gap-2">
            {AVAILABILITY_AREAS.map((value) => (
              <button
                key={value}
                type="button"
                aria-pressed={area === value}
                onClick={() => setArea(value)}
                className="rounded-full border border-paper/20 px-3 py-1.5 text-sm aria-pressed:border-volt aria-pressed:text-volt"
              >
                {t(`areas.${value}`)}
              </button>
            ))}
          </div>
        </fieldset>
        <label className="flex flex-col gap-1.5">
          <span className="font-semibold text-sm">{t("forHowLong")}</span>
          <select
            value={duration}
            onChange={(event) => setDuration(Number(event.target.value))}
            className="rounded-xl border border-paper/20 bg-ink px-3 py-2"
          >
            {DURATIONS.map((minutes) => (
              <option key={minutes} value={minutes}>
                {t("duration", { minutes })}
              </option>
            ))}
          </select>
        </label>
        {error && (
          <p role="alert" className="text-plasma text-sm">
            {error}
          </p>
        )}
        <button
          type="button"
          disabled={busy}
          onClick={() =>
            void save({ activity, area, until: new Date(Date.now() + duration * 60_000).toISOString() })
          }
          className="self-start rounded-full bg-volt px-5 py-3 font-semibold text-ink disabled:opacity-50"
        >
          {t("save")}
        </button>
      </Sheet>
    </div>
  );
}
