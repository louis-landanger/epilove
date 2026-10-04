import { calendarDateIn, LYON_CAMPUS, reverificationState } from "@atomes/core";
import { ShieldCheck } from "lucide-react";
import type { Route } from "next";
import Link from "next/link";
import { getFormatter, getTranslations } from "next-intl/server";

/** ONB-09: shown from 1 September until the member signs in with a code again. */
export async function ReverifyBanner({ due, paused }: { due: Date | null; paused: boolean }) {
  const today = calendarDateIn(LYON_CAMPUS.timeZone, new Date());
  const state = due ? reverificationState(today, calendarDateIn(LYON_CAMPUS.timeZone, due)) : "ok";
  if (state === "ok" && !paused) {
    return null;
  }
  const t = await getTranslations("settings.reverify");
  const format = await getFormatter();
  return (
    <div
      role="status"
      className="flex flex-wrap items-center gap-3 border-volt/30 border-b bg-volt/10 px-4 py-3 text-sm"
    >
      <ShieldCheck className="size-4 shrink-0 text-volt" aria-hidden="true" />
      <span className="flex-1">
        {paused || state === "overdue"
          ? t("paused")
          : t("banner", { date: format.dateTime(due ?? new Date(), { dateStyle: "long" }) })}
      </span>
      <Link
        href={"/compte/verifier" as Route}
        className="font-semibold text-volt underline underline-offset-4"
      >
        {t("action")}
      </Link>
    </div>
  );
}
