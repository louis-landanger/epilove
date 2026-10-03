"use client";

import { useUnreadConversations } from "@/components/rencontre/chat/unread";
import { AppNav } from "./app-nav";

/** The app navigation with its live counters (unread conversations). */
export function LiveAppNav() {
  const unread = useUnreadConversations();
  return <AppNav counts={{ messages: unread }} />;
}
