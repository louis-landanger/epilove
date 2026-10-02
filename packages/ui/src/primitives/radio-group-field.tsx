"use client";

import { Radio } from "@base-ui/react/radio";
import { RadioGroup } from "@base-ui/react/radio-group";
import { type ReactNode, useId } from "react";
import { cn } from "../cn";

export interface RadioOption<T extends string> {
  readonly value: T;
  readonly label: ReactNode;
  readonly description?: ReactNode;
  readonly disabled?: boolean;
}

export interface RadioGroupFieldProps<T extends string> {
  readonly label: ReactNode;
  readonly options: readonly RadioOption<T>[];
  readonly value: T | null;
  readonly onChange: (value: T) => void;
  readonly error?: string | null;
  readonly className?: string;
}

/** A single choice among a few options, as radio rows (report reasons…). */
export function RadioGroupField<T extends string>({
  label,
  options,
  value,
  onChange,
  error,
  className,
}: RadioGroupFieldProps<T>) {
  const id = useId();
  return (
    <div className={cn("flex flex-col gap-3", className)}>
      <span id={id} className="font-medium text-paper/90 text-sm">
        {label}
      </span>
      <RadioGroup
        aria-labelledby={id}
        value={value ?? ""}
        onValueChange={(next) => onChange(next as T)}
        className="flex flex-col gap-1.5"
      >
        {options.map((option) => (
          // biome-ignore lint/a11y/noLabelWithoutControl: Radio.Root renders the control inside the label
          <label
            key={option.value}
            className={cn(
              "flex cursor-pointer items-start gap-3 rounded-2xl border border-paper/10 px-4 py-3 transition-colors hover:border-paper/30 has-[[data-checked]]:border-plasma has-[[data-checked]]:bg-plasma/10",
              option.disabled && "cursor-not-allowed opacity-60 hover:border-paper/10",
            )}
          >
            <Radio.Root
              value={option.value}
              disabled={option.disabled}
              className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full border border-paper/40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-volt data-[checked]:border-plasma"
            >
              <Radio.Indicator className="size-2.5 rounded-full bg-plasma data-[unchecked]:hidden" />
            </Radio.Root>
            <span className="flex flex-col gap-0.5">
              <span className="text-paper">{option.label}</span>
              {option.description ? (
                <span className="text-paper/60 text-sm">{option.description}</span>
              ) : null}
            </span>
          </label>
        ))}
      </RadioGroup>
      {error ? (
        <span role="alert" className="text-danger text-sm">
          {error}
        </span>
      ) : null}
    </div>
  );
}
