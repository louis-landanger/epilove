"use client";

import { Menu } from "@base-ui/react/menu";
import { MoreHorizontal } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "../cn";

export interface ActionMenuItem {
  readonly label: string;
  readonly icon?: ReactNode;
  readonly onSelect: () => void;
  readonly tone?: "default" | "danger";
  readonly disabled?: boolean;
}

export interface ActionMenuProps {
  /** Accessible name of the trigger button. */
  readonly label: string;
  readonly items: readonly ActionMenuItem[];
  readonly icon?: ReactNode;
  readonly className?: string;
}

/** A compact "…" menu of actions (photo tiles, list rows). */
export function ActionMenu({ label, items, icon, className }: ActionMenuProps) {
  return (
    <Menu.Root>
      <Menu.Trigger
        aria-label={label}
        className={cn(
          "inline-flex size-9 items-center justify-center rounded-full bg-ink/70 text-paper backdrop-blur transition-colors",
          "hover:bg-ink/90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-volt data-[popup-open]:bg-ink",
          className,
        )}
      >
        {icon ?? <MoreHorizontal className="size-5" aria-hidden="true" />}
      </Menu.Trigger>
      <Menu.Portal>
        <Menu.Positioner sideOffset={6} align="end" className="z-50 outline-none">
          <Menu.Popup
            className={cn(
              "min-w-52 origin-[var(--transform-origin)] rounded-2xl border border-paper/10 bg-ink2 p-1.5 text-paper shadow-2xl outline-none",
              "transition-[scale,opacity] duration-150 ease-out data-[ending-style]:scale-95 data-[ending-style]:opacity-0 data-[starting-style]:scale-95 data-[starting-style]:opacity-0",
            )}
          >
            {items.map((item) => (
              <Menu.Item
                key={item.label}
                onClick={item.onSelect}
                disabled={item.disabled}
                className={cn(
                  "flex cursor-default select-none items-center gap-3 rounded-xl px-3 py-2.5 text-sm outline-none",
                  "data-[highlighted]:bg-paper/10 data-[disabled]:opacity-40",
                  item.tone === "danger" ? "text-danger" : "text-paper",
                )}
              >
                {item.icon}
                {item.label}
              </Menu.Item>
            ))}
          </Menu.Popup>
        </Menu.Positioner>
      </Menu.Portal>
    </Menu.Root>
  );
}
