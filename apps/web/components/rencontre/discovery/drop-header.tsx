"use client";

import { countdown } from "@epilove/core";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { orpc } from "@/lib/rencontre/api.client";
import { useRealtime } from "@/lib/rencontre/realtime";
import { SchoolGlyph, schoolColor } from "./school";

/**
 * Header of the Discover tab (DEC-07, docs/02-design.md): the evening Drop.
 * Before 21:00 a countdown, then the five profiles for 24 hours. Opening a
 * profile is where one likes or passes; the deck no longer shows them.
 */
export function DropHeader() {
  const t = useTranslations("discovery.drop");
  const queryClient = useQueryClient();
  const options = orpc.discovery.drop.queryOptions({ input: { locale: "fr" } });
  const { data } = useQuery({ ...options, refetchOnWindowFocus: true });
  const [now, setNow] = useState<number | null>(null);
  const [offset, setOffset] = useState(0);

  useEffect(() => {
    setNow(Date.now());
    const interval = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(interval);
  }, []);
  useEffect(() => {
    if (data) {
      setOffset(Date.parse(data.serverNow) - Date.now());
    }
  }, [data]);

  useRealtime((signal) => {
    if (signal.type === "drop.ready" || signal.type === "resync") {
      void queryClient.invalidateQueries({ queryKey: options.queryKey });
    }
  });

  // Refetch when the next Drop is due.
  const nextAt = data ? Date.parse(data.nextAt) : null;
  useEffect(() => {
    if (nextAt === null) {
      return;
    }
    const delay = nextAt - (Date.now() + offset) + 2000 + Math.random() * 8000;
    const timer = setTimeout(
      () => queryClient.invalidateQueries({ queryKey: options.queryKey }),
      Math.max(delay, 1000),
    );
    return () => clearTimeout(timer);
  }, [nextAt, offset, queryClient, options.queryKey]);

  if (!data || now === null) {
    return <div className="h-20 animate-pulse rounded-3xl bg-paper/5" aria-hidden="true" />;
  }
  const until =
    data.cards.length > 0 && data.expiresAt ? Date.parse(data.expiresAt) : Date.parse(data.nextAt);
  const left = countdown(until - (now + offset));
  const duration = t("duration", { hours: left.days * 24 + left.hours, minutes: left.minutes });

  return (
    <section
      aria-labelledby="drop-title"
      className="flex flex-col gap-3 rounded-3xl border border-paper/10 bg-paper/[0.03] p-4"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="drop-title" className="font-display font-semibold text-xl">
          {t("title")}
        </h2>
        <p className="font-mono text-paper/70 text-xs">
          {data.cards.length > 0 ? t("expires", { duration }) : t("next", { duration })}
        </p>
      </div>
      {data.cards.length > 0 ? (
        <ul className="-mx-1 flex snap-x gap-3 overflow-x-auto px-1 pb-1">
          {data.cards.map((card) => {
            const photo = card.photos[0];
            const score = card.compatibility?.score;
            return (
              <li key={card.userId} className="w-28 shrink-0 snap-start">
                <Link
                  href={`/membres/${card.userId}`}
                  className="group flex flex-col gap-1.5 rounded-2xl focus-visible:outline-2 focus-visible:outline-volt focus-visible:outline-offset-2"
                >
                  <span
                    className="relative block aspect-[3/4] overflow-hidden rounded-2xl bg-ink ring-1 ring-paper/10 transition group-hover:ring-2"
                    style={{ ["--tw-ring-color" as string]: schoolColor(card.school.slug) }}
                  >
                    {photo && (
                      // biome-ignore lint/performance/noImgElement: signed imgproxy URLs are already resized and encoded.
                      <img
                        src={photo.url}
                        alt=""
                        className="size-full object-cover"
                        width={112}
                        height={150}
                      />
                    )}
                    {score != null && (
                      <span className="absolute right-1.5 bottom-1.5 rounded-full bg-ink/80 px-2 py-0.5 font-mono text-[11px] text-volt">
                        {Math.round(score * 100)} %
                      </span>
                    )}
                  </span>
                  <span className="flex items-center gap-1 text-sm">
                    <span style={{ color: schoolColor(card.school.slug) }}>
                      <SchoolGlyph slug={card.school.slug} className="size-3" />
                    </span>
                    <span className="truncate font-semibold">{card.firstName}</span>
                    <span className="text-paper/70">{card.age}</span>
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="text-paper/70 text-sm">{data.total > 0 ? t("done") : t("empty")}</p>
      )}
    </section>
  );
}
