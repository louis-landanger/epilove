"use client";

import type { MessageAttachment } from "@atomes/contracts";
import { DATE_SAFETY_RULES, dateIcs } from "@atomes/core";
import { useFormatter, useTranslations } from "next-intl";

type DateAttachment = Extract<MessageAttachment, { type: "date" }>;

const CAMPUS_TIME_ZONE = "Europe/Paris";

/** A date proposal in the conversation (CHAT-10). */
export function DateCard({
  messageId,
  date,
  mine,
  onRespond,
  onCounter,
  onSafetyKit,
}: {
  messageId: string;
  date: DateAttachment;
  mine: boolean;
  onRespond: (response: "accept" | "decline") => void;
  onCounter: () => void;
  /** Accepted dates offer the safety kit (IRL-03) until a day after they start. */
  onSafetyKit?: () => void;
}) {
  const t = useTranslations("chat.date");
  const kit = useTranslations("chat.safetyKit");
  const format = useFormatter();
  const startsAt = new Date(date.startsAt);
  const where = date.spot?.name ?? date.place ?? "";
  const upcoming = startsAt.getTime() > Date.now();
  const kitOpen = startsAt.getTime() + DATE_SAFETY_RULES.expiresAfterHours * 3_600_000 > Date.now();

  const downloadIcs = () => {
    const ics = dateIcs({
      uid: messageId,
      startsAt,
      title: t("icsTitle"),
      location: where,
      description: date.note || undefined,
    });
    const url = URL.createObjectURL(new Blob([ics], { type: "text/calendar;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = "date-atomes.ics";
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="flex w-72 max-w-full flex-col gap-3 rounded-3xl border border-volt/40 bg-ink p-4 text-paper">
      <p className="font-mono text-volt text-xs uppercase tracking-widest">{t("cardTitle")}</p>
      <div className="flex flex-col gap-1">
        <p className="font-display font-semibold text-lg">{where}</p>
        <p className="text-paper/80 text-sm">
          {format.dateTime(startsAt, { dateStyle: "full", timeStyle: "short", timeZone: CAMPUS_TIME_ZONE })}
        </p>
        {date.note && <p className="text-paper/80 text-sm italic">« {date.note} »</p>}
      </div>
      <p className="text-sm">
        <span
          className={`rounded-full px-2.5 py-1 font-mono text-xs ${
            date.status === "accepted"
              ? "bg-volt/20 text-volt"
              : date.status === "proposed"
                ? "bg-paper/10"
                : "bg-paper/10 text-paper/70"
          }`}
        >
          {t(`status.${date.status}`)}
        </span>
      </p>
      {!mine && date.status === "proposed" && upcoming && (
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => onRespond("accept")}
            className="rounded-full bg-volt px-4 py-2 font-semibold text-ink text-sm"
          >
            {t("accept")}
          </button>
          <button
            type="button"
            onClick={onCounter}
            className="rounded-full border border-paper/25 px-4 py-2 text-sm"
          >
            {t("counter")}
          </button>
          <button
            type="button"
            onClick={() => onRespond("decline")}
            className="rounded-full px-3 py-2 text-paper/70 text-sm"
          >
            {t("decline")}
          </button>
        </div>
      )}
      {date.status === "accepted" && (upcoming || (kitOpen && onSafetyKit)) && (
        <div className="flex flex-wrap gap-2">
          {upcoming && (
            <button
              type="button"
              onClick={downloadIcs}
              className="rounded-full border border-volt/50 px-4 py-2 text-sm"
            >
              {t("calendar")}
            </button>
          )}
          {kitOpen && onSafetyKit && (
            <button
              type="button"
              onClick={onSafetyKit}
              className="rounded-full border border-paper/25 px-4 py-2 text-sm"
            >
              {kit("open")}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
