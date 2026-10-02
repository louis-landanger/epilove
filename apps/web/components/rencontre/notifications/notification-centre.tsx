"use client";

import type { NotificationItem } from "@epilove/contracts";
import { useFormatter, useNow, useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { api } from "@/lib/rencontre/api.client";
import { useRealtime } from "@/lib/rencontre/realtime";

const KNOWN = [
  "like_received",
  "superlike_received",
  "match_created",
  "message_received",
  "drop_ready",
  "pact_reveal",
] as const;
type Known = (typeof KNOWN)[number];
const isKnown = (type: string): type is Known => (KNOWN as readonly string[]).includes(type);

const ICONS: Record<Known, string> = {
  like_received: "♥",
  superlike_received: "★",
  match_created: "⚡",
  message_received: "✉",
  drop_ready: "◎",
  pact_reveal: "⚛",
};

/** Notification centre (NOT-02): history, unread markers, everything marked read once seen. */
export function NotificationCentre({
  initial,
}: {
  initial: { items: NotificationItem[]; hasMore: boolean; unread: number };
}) {
  const t = useTranslations("notifications");
  const format = useFormatter();
  const now = useNow({ updateInterval: 60_000 });
  const [items, setItems] = useState(initial.items);
  const [hasMore, setHasMore] = useState(initial.hasMore);

  // Opening the centre marks everything as read; the unread markers stay visible for this visit.
  useEffect(() => {
    if (initial.unread > 0) {
      void api.notifications.markRead({ ids: "all" }).catch(() => undefined);
    }
  }, [initial.unread]);

  useRealtime(async (signal) => {
    if (["like.received", "match.created", "message.created", "resync"].includes(signal.type)) {
      const fresh = await api.notifications.list({ limit: 30 }).catch(() => null);
      if (fresh) {
        setItems((current) => {
          const known = new Set(current.map((i) => i.id));
          return [...fresh.items.filter((i) => !known.has(i.id)), ...current];
        });
      }
    }
  });

  const loadMore = async () => {
    const last = items.at(-1);
    if (!last) {
      return;
    }
    const page = await api.notifications.list({ before: last.id, limit: 30 });
    setItems((current) => [...current, ...page.items]);
    setHasMore(page.hasMore);
  };

  if (items.length === 0) {
    return (
      <section className="flex flex-col items-center gap-3 rounded-3xl border border-paper/10 px-6 py-16 text-center">
        <h2 className="font-display font-semibold text-2xl">{t("empty")}</h2>
        <p className="text-paper/70">{t("emptyLead")}</p>
      </section>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <ul className="flex flex-col gap-1">
        {items.map((item) => (
          <li key={item.id}>
            <a
              href={item.url}
              className="-mx-2 flex items-center gap-3 rounded-2xl p-3 transition-colors hover:bg-paper/5"
            >
              <span
                aria-hidden="true"
                className="grid size-11 shrink-0 place-items-center rounded-full bg-paper/10 text-lg text-plasma"
              >
                {isKnown(item.type) ? ICONS[item.type] : "•"}
              </span>
              <span className="flex min-w-0 flex-1 flex-col">
                <span className={item.read ? "text-paper/80" : "font-semibold"}>
                  {isKnown(item.type) ? t(`types.${item.type}`) : item.type}
                </span>
                <time
                  dateTime={item.createdAt}
                  suppressHydrationWarning
                  className="font-mono text-paper/60 text-xs"
                >
                  {format.relativeTime(new Date(item.createdAt), now)}
                </time>
              </span>
              {!item.read && (
                <span className="size-2.5 shrink-0 rounded-full bg-plasma">
                  <span className="sr-only">{t("unread")}</span>
                </span>
              )}
            </a>
          </li>
        ))}
      </ul>
      {hasMore && (
        <button
          type="button"
          onClick={loadMore}
          className="self-center rounded-full border border-paper/15 px-4 py-2 text-sm"
        >
          {t("loadMore")}
        </button>
      )}
    </div>
  );
}
