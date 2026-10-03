"use client";

import type { SpotView } from "@epilove/contracts";
import { DATE_RULES } from "@epilove/core";
import { Sheet } from "@epilove/ui";
import { ORPCError } from "@orpc/client";
import { useLocale, useTranslations } from "next-intl";
import { useEffect, useId, useState } from "react";
import { api } from "@/lib/api-client";
import { contentLocale } from "@/lib/rencontre/locale";

export interface DateDraft {
  readonly spotId: string | null;
  readonly place: string | null;
  readonly startsAt: string;
  readonly note: string;
}

/** `datetime-local` value (local time) for an instant. */
function localInput(date: Date): string {
  const shifted = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return shifted.toISOString().slice(0, 16);
}

/**
 * Date proposal form (CHAT-10): a Spot (public place) or another place, a
 * time, a word. Opened from the composer or to answer a proposal.
 */
export function DateSheet({
  open,
  counter,
  onClose,
  onSubmit,
}: {
  open: boolean;
  /** Answering another proposal ("autre chose"). */
  counter: boolean;
  onClose: () => void;
  onSubmit: (draft: DateDraft) => Promise<void>;
}) {
  const t = useTranslations("chat.date");
  const locale = contentLocale(useLocale());
  const titleId = useId();
  const [spots, setSpots] = useState<SpotView[]>([]);
  const [spotId, setSpotId] = useState<string>("");
  const [place, setPlace] = useState("");
  const [when, setWhen] = useState("");
  const [note, setNote] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open && spots.length === 0) {
      api.campusLife
        .spots({ locale })
        .then((result) => setSpots(result.spots))
        .catch(() => setSpots([]));
    }
  }, [open, spots.length, locale]);

  const min = localInput(new Date(Date.now() + DATE_RULES.minLeadMinutes * 60_000));

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    if (!spotId && !place.trim()) {
      setError(t("errors.no_place"));
      return;
    }
    setPending(true);
    try {
      await onSubmit({
        spotId: spotId || null,
        place: spotId ? null : place.trim(),
        startsAt: new Date(when).toISOString(),
        note: note.trim(),
      });
      setSpotId("");
      setPlace("");
      setWhen("");
      setNote("");
    } catch (cause) {
      const code = cause instanceof ORPCError ? cause.message : "generic";
      setError(t(`errors.${code}` as "errors.generic"));
    } finally {
      setPending(false);
    }
  };

  return (
    <Sheet open={open} onClose={onClose} labelledBy={titleId}>
      <h2 id={titleId} className="font-display font-semibold text-xl">
        {counter ? t("counterTitle") : t("title")}
      </h2>
      <form onSubmit={submit} className="flex flex-col gap-4">
        <label className="flex flex-col gap-1.5 text-sm">
          <span className="font-semibold">{t("spot")}</span>
          <select
            value={spotId}
            onChange={(event) => setSpotId(event.target.value)}
            className="rounded-2xl border border-paper/20 bg-ink px-3 py-2.5"
          >
            <option value="">{t("otherPlace")}</option>
            {spots.map((spot) => (
              <option key={spot.id} value={spot.id}>
                {spot.name}
              </option>
            ))}
          </select>
        </label>
        {!spotId && (
          <label className="flex flex-col gap-1.5 text-sm">
            <span className="font-semibold">{t("place")}</span>
            <input
              value={place}
              onChange={(event) => setPlace(event.target.value)}
              maxLength={DATE_RULES.placeMaxLength}
              placeholder={t("placePlaceholder")}
              className="rounded-2xl border border-paper/20 bg-transparent px-3 py-2.5"
            />
          </label>
        )}
        <label className="flex flex-col gap-1.5 text-sm">
          <span className="font-semibold">{t("when")}</span>
          <input
            type="datetime-local"
            required
            min={min}
            value={when}
            onChange={(event) => setWhen(event.target.value)}
            className="rounded-2xl border border-paper/20 bg-transparent px-3 py-2.5 [color-scheme:dark]"
          />
        </label>
        <label className="flex flex-col gap-1.5 text-sm">
          <span className="font-semibold">{t("note")}</span>
          <textarea
            value={note}
            onChange={(event) => setNote(event.target.value)}
            maxLength={DATE_RULES.noteMaxLength}
            rows={2}
            placeholder={t("notePlaceholder")}
            className="resize-none rounded-2xl border border-paper/20 bg-transparent px-3 py-2.5"
          />
        </label>
        <p className="text-paper/70 text-xs">{t("safety")}</p>
        {error && (
          <p role="alert" className="rounded-2xl bg-plasma/15 px-4 py-3 text-sm">
            {error}
          </p>
        )}
        <div className="flex flex-wrap gap-3">
          <button
            type="submit"
            disabled={pending || !when}
            className="rounded-full bg-paper px-5 py-3 font-semibold text-ink disabled:opacity-50"
          >
            {t("send")}
          </button>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full border border-paper/25 px-5 py-3 font-semibold"
          >
            {t("cancel")}
          </button>
        </div>
      </form>
    </Sheet>
  );
}
