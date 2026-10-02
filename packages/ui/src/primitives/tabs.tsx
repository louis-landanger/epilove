"use client";

import { Tabs as BaseTabs } from "@base-ui/react/tabs";
import type { ReactNode } from "react";
import { cn } from "../cn";

export interface TabItem<T extends string> {
  readonly value: T;
  readonly label: ReactNode;
  readonly content: ReactNode;
}

export interface TabsProps<T extends string> {
  readonly label: string;
  readonly items: readonly TabItem<T>[];
  readonly value?: T;
  readonly defaultValue?: T;
  readonly onValueChange?: (value: T) => void;
  readonly className?: string;
}

/** Segmented tabs with a sliding indicator. */
export function Tabs<T extends string>({
  label,
  items,
  value,
  defaultValue,
  onValueChange,
  className,
}: TabsProps<T>) {
  return (
    <BaseTabs.Root
      value={value}
      defaultValue={defaultValue ?? items[0]?.value}
      onValueChange={(next) => onValueChange?.(next as T)}
      className={cn("flex flex-col gap-6", className)}
    >
      <BaseTabs.List
        aria-label={label}
        className="relative z-0 flex w-full rounded-full border border-paper/10 bg-paper/[0.04] p-1"
      >
        {items.map((item) => (
          <BaseTabs.Tab
            key={item.value}
            value={item.value}
            className={cn(
              "relative z-10 flex h-10 flex-1 items-center justify-center rounded-full px-4 font-semibold text-paper/60 text-sm outline-none transition-colors",
              "hover:text-paper focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-volt data-[active]:text-ink",
            )}
          >
            {item.label}
          </BaseTabs.Tab>
        ))}
        <BaseTabs.Indicator className="absolute top-1 left-0 -z-0 h-10 w-(--active-tab-width) translate-x-(--active-tab-left) rounded-full bg-paper transition-[translate,width] duration-300 ease-[cubic-bezier(0.16,1,0.3,1)]" />
      </BaseTabs.List>
      {items.map((item) => (
        <BaseTabs.Panel key={item.value} value={item.value} className="outline-none">
          {item.content}
        </BaseTabs.Panel>
      ))}
    </BaseTabs.Root>
  );
}
