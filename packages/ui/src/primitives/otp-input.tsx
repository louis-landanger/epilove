"use client";

import { OTPField } from "@base-ui/react/otp-field";
import { type ReactNode, useId } from "react";
import { cn } from "../cn";

export interface OtpInputProps {
  readonly label: ReactNode;
  readonly length?: number;
  readonly value: string;
  readonly onChange: (value: string) => void;
  readonly onComplete?: (value: string) => void;
  readonly error?: string | null;
  readonly disabled?: boolean;
  readonly description?: ReactNode;
}

/** Six-digit one-time code with paste support and SMS/email autofill (`one-time-code`). */
export function OtpInput({
  label,
  length = 6,
  value,
  onChange,
  onComplete,
  error,
  disabled,
  description,
}: OtpInputProps) {
  const id = useId();
  return (
    <div className="flex flex-col gap-3">
      <label htmlFor={id} className="font-medium text-paper/90 text-sm">
        {label}
      </label>
      <OTPField.Root
        id={id}
        length={length}
        value={value}
        onValueChange={(next) => onChange(next)}
        onValueComplete={(next) => onComplete?.(next)}
        disabled={disabled}
        aria-invalid={error ? true : undefined}
        aria-describedby={description ? `${id}-description` : undefined}
        className="flex gap-2 sm:gap-3"
      >
        {Array.from({ length }, (_, index) => (
          <OTPField.Input
            // biome-ignore lint/suspicious/noArrayIndexKey: slots are positional and never reordered.
            key={index}
            aria-label={index === 0 ? undefined : `Chiffre ${index + 1} sur ${length}`}
            className={cn(
              "h-14 w-full min-w-0 max-w-14 rounded-2xl border border-paper/15 bg-paper/[0.06] text-center font-mono text-2xl text-paper",
              "transition-[border-color,box-shadow] focus:border-plasma focus:outline-none focus:ring-4 focus:ring-plasma/20",
              error ? "border-danger" : undefined,
            )}
          />
        ))}
      </OTPField.Root>
      {description ? (
        <span id={`${id}-description`} className="text-paper/60 text-sm">
          {description}
        </span>
      ) : null}
      {error ? (
        <span role="alert" className="text-danger text-sm">
          {error}
        </span>
      ) : null}
    </div>
  );
}
