"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocale } from "next-intl";
import { orpc } from "@/lib/rencontre/api.client";
import { contentLocale } from "@/lib/rencontre/locale";
import { useRealtime } from "@/lib/rencontre/realtime";

const REFRESHING = ["message.created", "match.created", "match.closed", "message.read", "resync"];

/**
 * Conversations with unread messages, for the badge of the Messages tab.
 * Shares its query with the conversation list, refreshed by realtime events.
 */
export function useUnreadConversations(): number {
  const locale = contentLocale(useLocale());
  const client = useQueryClient();
  const options = orpc.matches.list.queryOptions({ input: { locale } });
  const { data } = useQuery({ ...options, retry: false });
  useRealtime((signal) => {
    if (REFRESHING.includes(signal.type)) {
      void client.invalidateQueries({ queryKey: options.queryKey });
    }
  });
  return data?.matches.filter((match) => match.unread > 0).length ?? 0;
}
