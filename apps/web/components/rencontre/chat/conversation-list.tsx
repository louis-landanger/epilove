"use client";

import type { MatchSummary } from "@epilove/contracts";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useFormatter, useNow, useTranslations } from "next-intl";
import { orpc } from "@/lib/rencontre/api.client";
import { useRealtime } from "@/lib/rencontre/realtime";
import { Avatar } from "./avatar";
import { DispoChip } from "./dispo";

/** New bonds (no message yet) on top, then conversations by latest activity (docs/02, "Messages"). */
export function ConversationList({
  initial,
  activeMatchId,
}: {
  initial: MatchSummary[];
  activeMatchId: string | null;
}) {
  const t = useTranslations("chat");
  const format = useFormatter();
  const now = useNow({ updateInterval: 60_000 });
  // A message newer than the last tick of `now` is "just now", never "in 5 seconds".
  const relative = (iso: string) => {
    const at = new Date(iso);
    return format.relativeTime(at, at > now ? at : now);
  };
  const client = useQueryClient();
  const options = orpc.matches.list.queryOptions({ input: { locale: "fr" } });
  const { data } = useQuery({ ...options, initialData: { matches: initial } });

  useRealtime((signal) => {
    if (
      ["message.created", "match.created", "match.closed", "message.read", "resync"].includes(signal.type)
    ) {
      void client.invalidateQueries({ queryKey: options.queryKey });
    }
  });

  const fresh = data.matches.filter((m) => m.lastMessage === null);
  const conversations = data.matches.filter((m) => m.lastMessage !== null);

  return (
    <div className="flex flex-col gap-6">
      <section aria-labelledby="new-matches" className="flex flex-col gap-3">
        <h2 id="new-matches" className="font-mono text-paper/60 text-xs uppercase tracking-[0.2em]">
          {t("newMatches")}
        </h2>
        {fresh.length === 0 ? (
          <p className="text-paper/60 text-sm">{t("newMatchesEmpty")}</p>
        ) : (
          <ul className="-mx-4 flex snap-x gap-4 overflow-x-auto px-4 pb-2">
            {fresh.map((m) => (
              <li key={m.matchId} className="snap-start">
                <a
                  href={`/messages/${m.matchId}`}
                  className="flex w-20 flex-col items-center gap-2 text-center"
                >
                  <Avatar photoUrl={m.other.photoUrl} schoolSlug={m.other.school.slug} size="lg" />
                  <span className="w-full truncate text-sm">{m.other.firstName}</span>
                  {m.other.available && <DispoChip available={m.other.available} />}
                </a>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="conversations" className="flex flex-col gap-1">
        <h2 id="conversations" className="mb-2 font-mono text-paper/60 text-xs uppercase tracking-[0.2em]">
          {t("conversations")}
        </h2>
        {conversations.length === 0 ? (
          <p className="text-paper/60 text-sm">{t("conversationsEmpty")}</p>
        ) : (
          <ul className="flex flex-col">
            {conversations.map((m) => {
              const active = m.matchId === activeMatchId;
              const text =
                m.lastMessage && m.lastMessage.kind !== "text"
                  ? t(`previewKinds.${m.lastMessage.kind}` as "previewKinds.sticker")
                  : (m.lastMessage?.preview ?? "");
              const preview = m.lastMessage?.fromMe ? t("you", { text }) : text;
              return (
                <li key={m.matchId}>
                  <a
                    href={`/messages/${m.matchId}`}
                    aria-current={active ? "page" : undefined}
                    className={`-mx-2 flex items-center gap-3 rounded-2xl p-2 transition-colors ${
                      active ? "bg-paper/10" : "hover:bg-paper/5"
                    }`}
                  >
                    <Avatar photoUrl={m.other.photoUrl} schoolSlug={m.other.school.slug} />
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span className="flex items-center gap-2">
                        <span className={`truncate ${m.unread > 0 ? "font-semibold" : ""}`}>
                          {m.other.firstName}
                        </span>
                        {m.mode === "friends" && (
                          <span className="rounded-full bg-paper/10 px-2 py-0.5 font-mono text-[10px] uppercase">
                            {t("friendsMode")}
                          </span>
                        )}
                        {m.other.available && <DispoChip available={m.other.available} />}
                        {m.lastMessage && (
                          <time
                            dateTime={m.lastMessage.at}
                            suppressHydrationWarning
                            className="ml-auto shrink-0 font-mono text-paper/60 text-xs"
                          >
                            {relative(m.lastMessage.at)}
                          </time>
                        )}
                      </span>
                      <span className={`truncate text-sm ${m.unread > 0 ? "text-paper" : "text-paper/60"}`}>
                        {preview}
                      </span>
                    </span>
                    {m.unread > 0 && (
                      <span className="grid min-w-6 place-items-center rounded-full bg-plasma px-1.5 font-mono text-ink text-xs">
                        <span aria-hidden="true">{m.unread}</span>
                        <span className="sr-only">{t("unread", { count: m.unread })}</span>
                      </span>
                    )}
                  </a>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
