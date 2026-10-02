"use client";

import { Switch } from "@base-ui/react/switch";
import { type ReactNode, useId } from "react";
import { cn } from "../cn";

export interface SwitchFieldProps {
  readonly label: ReactNode;
  readonly description?: ReactNode;
  readonly checked: boolean;
  readonly onCheckedChange: (checked: boolean) => void;
  readonly disabled?: boolean;
  readonly className?: string;
}

export function SwitchField({
  label,
  description,
  checked,
  onCheckedChange,
  disabled,
  className,
}: SwitchFieldProps) {
  const id = useId();
  return (
    <div className={cn("flex items-start justify-between gap-6", className)}>
      <div className="flex flex-col gap-1">
        <label htmlFor={id} className="font-medium text-paper">
          {label}
        </label>
        {description ? (
          <span id={`${id}-description`} className="text-paper/60 text-sm">
            {description}
          </span>
        ) : null}
      </div>
      <Switch.Root
        id={id}
        checked={checked}
        onCheckedChange={(next) => onCheckedChange(next)}
        disabled={disabled}
        aria-describedby={description ? `${id}-description` : undefined}
        className={cn(
          "relative mt-0.5 inline-flex h-7 w-12 shrink-0 rounded-full bg-paper/15 p-0.5 transition-colors duration-200",
          "data-[checked]:bg-plasma focus-visible:outline-2 focus-visible:outline-offset-3 focus-visible:outline-volt",
          "disabled:opacity-50",
        )}
      >
        <Switch.Thumb className="size-6 rounded-full bg-paper shadow transition-transform duration-200 ease-out data-[checked]:translate-x-5" />
      </Switch.Root>
    </div>
  );
}
