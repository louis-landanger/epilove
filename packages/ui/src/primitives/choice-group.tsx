"use client";

import { Toggle } from "@base-ui/react/toggle";
import { ToggleGroup } from "@base-ui/react/toggle-group";
import { type ReactNode, useId } from "react";
import { cn } from "../cn";

export interface Choice<T extends string> {
  readonly value: T;
  readonly label: ReactNode;
  readonly description?: ReactNode;
}

export interface ChoiceGroupProps<T extends string> {
  readonly label: ReactNode;
  readonly choices: readonly Choice<T>[];
  readonly value: readonly T[];
  readonly onChange: (value: T[]) => void;
  readonly multiple?: boolean;
  readonly error?: string | null;
  readonly description?: ReactNode;
  readonly layout?: "chips" | "cards";
  readonly className?: string;
}

/** Selectable chips or cards (genders, modes, intentions…), single or multiple choice. */
export function ChoiceGroup<T extends string>({
  label,
  choices,
  value,
  onChange,
  multiple = false,
  error,
  description,
  layout = "chips",
  className,
}: ChoiceGroupProps<T>) {
  const id = useId();
  return (
    <div className={cn("flex flex-col gap-3", className)}>
      <span id={`${id}-label`} className="font-medium text-paper/90 text-sm">
        {label}
      </span>
      {description ? (
        <span id={`${id}-description`} className="-mt-1 text-paper/60 text-sm">
          {description}
        </span>
      ) : null}
      <ToggleGroup
        aria-labelledby={`${id}-label`}
        aria-describedby={description ? `${id}-description` : undefined}
        multiple={multiple}
        value={[...value]}
        onValueChange={(next) => onChange(next as T[])}
        className={cn(layout === "chips" ? "flex flex-wrap gap-2" : "grid gap-3 sm:grid-cols-2")}
      >
        {choices.map((choice) => (
          <Toggle
            key={choice.value}
            value={choice.value}
            className={cn(
              "border border-paper/15 text-left text-paper transition-[background-color,border-color,transform] duration-150",
              "hover:border-paper/35 active:scale-[0.98] focus-visible:outline-2 focus-visible:outline-offset-3 focus-visible:outline-volt",
              "data-[pressed]:border-plasma data-[pressed]:bg-plasma/15",
              layout === "chips" ? "rounded-full px-4 py-2.5 text-sm" : "flex flex-col gap-1 rounded-3xl p-5",
            )}
          >
            <span className={layout === "cards" ? "font-semibold text-base" : undefined}>{choice.label}</span>
            {layout === "cards" && choice.description ? (
              <span className="text-paper/65 text-sm">{choice.description}</span>
            ) : null}
          </Toggle>
        ))}
      </ToggleGroup>
      {error ? (
        <span role="alert" className="text-danger text-sm">
          {error}
        </span>
      ) : null}
    </div>
  );
}
