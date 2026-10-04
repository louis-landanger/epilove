"use client";

import type { MatchSummary } from "@atomes/contracts";
import { useSelectedLayoutSegment } from "next/navigation";
import { useTranslations } from "next-intl";
import type { ReactNode } from "react";
import { ConversationList } from "./conversation-list";
import { DispoControl } from "./dispo";

/**
 * Messages tab: list and conversation side by side on desktop (split view),
 * one at a time on mobile (docs/02-design.md, section 6).
 */
export function MessagesShell({ initial, children }: { initial: MatchSummary[]; children: ReactNode }) {
  const t = useTranslations("chat");
  const segment = useSelectedLayoutSegment();
  const inConversation = segment !== null;
  return (
    <div className="mx-auto flex h-dvh w-full max-w-6xl">
      <aside
        className={`w-full shrink-0 overflow-y-auto border-paper/10 px-4 pt-6 pb-10 lg:block lg:w-96 lg:border-r ${
          inConversation ? "hidden" : "block"
        }`}
      >
        <h1 className="mb-4 font-display font-semibold text-3xl tracking-tight">{t("title")}</h1>
        <DispoControl />
        <ConversationList initial={initial} activeMatchId={segment} />
      </aside>
      <div className={`min-w-0 flex-1 ${inConversation ? "flex" : "hidden lg:flex"}`}>{children}</div>
    </div>
  );
}
