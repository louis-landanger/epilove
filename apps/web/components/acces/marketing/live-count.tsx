"use client";

import type { WaitlistStats } from "@epilove/contracts";
import { useTranslations } from "next-intl";
import { useWaitlistStats } from "./stats-store";

/** "N personnes déjà dans la liste", refreshed with the shared poller. */
export function LiveCount({ initial }: { initial: WaitlistStats | null }) {
  const t = useTranslations("home");
  const stats = useWaitlistStats(initial);
  return (
    <p className="inline-flex items-center gap-3 font-mono text-paper/80 text-sm" data-testid="live-count">
      <span aria-hidden="true" className="relative flex size-2">
        <span className="absolute inset-0 animate-ping rounded-full bg-volt opacity-60" />
        <span className="relative size-2 rounded-full bg-volt" />
      </span>
      {stats ? t("count", { count: stats.total }) : t("countPending")}
    </p>
  );
}
