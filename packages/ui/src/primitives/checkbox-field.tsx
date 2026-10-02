"use client";

import { Checkbox } from "@base-ui/react/checkbox";
import { Check } from "lucide-react";
import { type ReactNode, useId } from "react";
import { cn } from "../cn";

export interface CheckboxFieldProps {
  readonly label: ReactNode;
  readonly description?: ReactNode;
  readonly checked: boolean;
  readonly onCheckedChange: (checked: boolean) => void;
  readonly error?: string | null;
  readonly required?: boolean;
  readonly className?: string;
}

/** A checkbox that is never pre-ticked by default (explicit consent). */
export function CheckboxField({
  label,
  description,
  checked,
  onCheckedChange,
  error,
  required,
  className,
}: CheckboxFieldProps) {
  const id = useId();
  return (
    <div className={cn("flex flex-col gap-2", className)}>
      <div className="flex items-start gap-3">
        <Checkbox.Root
          id={id}
          checked={checked}
          onCheckedChange={(next) => onCheckedChange(next === true)}
          required={required}
          aria-invalid={error ? true : undefined}
          aria-describedby={description ? `${id}-description` : undefined}
          className={cn(
            "mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-lg border border-paper/30 transition-colors",
            "data-[checked]:border-plasma data-[checked]:bg-plasma focus-visible:outline-2 focus-visible:outline-offset-3 focus-visible:outline-volt",
          )}
        >
          <Checkbox.Indicator className="text-ink">
            <Check className="size-4" strokeWidth={3} aria-hidden="true" />
          </Checkbox.Indicator>
        </Checkbox.Root>
        <div className="flex flex-col gap-1">
          <label htmlFor={id} className="text-paper leading-snug">
            {label}
          </label>
          {description ? (
            <span id={`${id}-description`} className="text-paper/60 text-sm">
              {description}
            </span>
          ) : null}
        </div>
      </div>
      {error ? (
        <span role="alert" className="text-danger text-sm">
          {error}
        </span>
      ) : null}
    </div>
  );
}
