"use client";

import type { ReportContext } from "@atomes/core";
import { ActionMenu, type ActionMenuItem } from "@atomes/ui";
import { Ban, Flag, HeartOff } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { BlockDialog, ReportDialog, type SafetyTarget, UnmatchDialog } from "./safety-dialogs";

type Panel = "report" | "block" | "unmatch" | null;

export interface SafetyMenuProps {
  readonly target: SafetyTarget;
  /** The active match with this person, if any: adds "unmatch". */
  readonly matchId?: string | null;
  readonly context?: ReportContext;
  readonly contextRef?: string;
  readonly className?: string;
  readonly onDone?: (action: "blocked" | "reported" | "unmatched") => void;
}

/**
 * Safety actions on someone, from a profile or a conversation (SAF-01,
 * SAF-02, CHAT-13): unmatch, block and report, each confirmed in a dialog.
 */
export function SafetyMenu({
  target,
  matchId,
  context = "profile",
  contextRef,
  className,
  onDone,
}: SafetyMenuProps) {
  const t = useTranslations("safety");
  const [panel, setPanel] = useState<Panel>(null);
  const items: ActionMenuItem[] = [
    ...(matchId
      ? [
          {
            label: t("unmatch.action"),
            icon: <HeartOff className="size-4" aria-hidden="true" />,
            onSelect: () => setPanel("unmatch"),
          },
        ]
      : []),
    {
      label: t("block.action"),
      icon: <Ban className="size-4" aria-hidden="true" />,
      onSelect: () => setPanel("block"),
    },
    {
      label: t("report.action"),
      icon: <Flag className="size-4" aria-hidden="true" />,
      tone: "danger",
      onSelect: () => setPanel("report"),
    },
  ];
  const onOpenChange = (open: boolean) => {
    if (!open) setPanel(null);
  };

  return (
    <>
      <ActionMenu label={t("more")} items={items} className={className} />
      <ReportDialog
        target={target}
        context={context}
        contextRef={contextRef}
        open={panel === "report"}
        onOpenChange={onOpenChange}
        // "Also block" is ticked by default: the caller then leaves the profile or the conversation.
        onReported={({ blocked }) => onDone?.(blocked ? "blocked" : "reported")}
      />
      <BlockDialog
        target={target}
        open={panel === "block"}
        onOpenChange={onOpenChange}
        onBlocked={() => onDone?.("blocked")}
      />
      {matchId ? (
        <UnmatchDialog
          target={target}
          matchId={matchId}
          open={panel === "unmatch"}
          onOpenChange={onOpenChange}
          onUnmatched={() => onDone?.("unmatched")}
        />
      ) : null}
    </>
  );
}
