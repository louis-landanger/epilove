"use client";

import type { WaitlistStats } from "@atomes/contracts";
import { useTranslations } from "next-intl";
import { useWaitlistStats } from "./stats-store";

/** Below this, a count would undersell the list: the hero leaves it out. */
export const LIVE_COUNT_FROM = 100;

/** "N personnes déjà dans la liste", refreshed with the shared poller, once the list is worth showing. */
export function LiveCount({ initial }: { initial: WaitlistStats | null }) {
  const t = useTranslations("home");
  const stats = useWaitlistStats(initial);
  if (!stats || stats.total < LIVE_COUNT_FROM) {
    return null;
  }
  return (
    <p className="text-paper/70 text-sm" data-testid="live-count">
      {t("count", { count: stats.total })}
    </p>
  );
}
