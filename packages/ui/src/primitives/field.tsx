"use client";

import { Field } from "@base-ui/react/field";
import { type ComponentProps, type ReactNode, useState } from "react";
import { cn } from "../cn";

export const inputStyles = cn(
  "w-full rounded-2xl border border-paper/12 bg-paper/[0.06] px-4 text-base text-paper",
  "placeholder:text-paper/50 transition-[border-color,box-shadow,background-color] duration-150",
  "hover:border-paper/25 focus:border-plasma focus:bg-paper/[0.08] focus:outline-none focus:ring-4 focus:ring-plasma/20",
  "data-[invalid]:border-danger data-[invalid]:focus:ring-danger/20 disabled:opacity-50",
);

interface FieldShellProps {
  readonly label: ReactNode;
  readonly description?: ReactNode;
  readonly error?: string | null;
  readonly className?: string;
  readonly children: ReactNode;
  readonly name?: string;
  readonly disabled?: boolean;
}

function FieldShell({ label, description, error, className, children, name, disabled }: FieldShellProps) {
  return (
    <Field.Root
      name={name}
      invalid={Boolean(error)}
      disabled={disabled}
      className={cn("flex flex-col gap-2", className)}
    >
      <Field.Label className="font-medium text-paper/90 text-sm">{label}</Field.Label>
      {children}
      {description ? (
        <Field.Description className="text-paper/60 text-sm">{description}</Field.Description>
      ) : null}
      {error ? (
        <Field.Error match className="text-danger text-sm" role="alert">
          {error}
        </Field.Error>
      ) : null}
    </Field.Root>
  );
}

export interface TextFieldProps extends Omit<ComponentProps<"input">, "size"> {
  readonly label: ReactNode;
  readonly description?: ReactNode;
  readonly error?: string | null;
  readonly inputClassName?: string;
}

export function TextField({
  label,
  description,
  error,
  className,
  inputClassName,
  name,
  disabled,
  ...props
}: TextFieldProps) {
  return (
    <FieldShell
      label={label}
      description={description}
      error={error}
      className={className}
      name={name}
      disabled={disabled}
    >
      <Field.Control className={cn(inputStyles, "h-12", inputClassName)} {...props} />
    </FieldShell>
  );
}

export interface TextAreaFieldProps extends ComponentProps<"textarea"> {
  readonly label: ReactNode;
  readonly description?: ReactNode;
  readonly error?: string | null;
  /** Shows a live character counter when set. */
  readonly maxLength?: number;
}

export function TextAreaField({
  label,
  description,
  error,
  className,
  maxLength,
  name,
  disabled,
  value,
  defaultValue,
  onChange,
  ...props
}: TextAreaFieldProps) {
  const [length, setLength] = useState(String(value ?? defaultValue ?? "").length);
  const currentLength = value === undefined ? length : String(value).length;
  return (
    <FieldShell
      label={label}
      description={description}
      error={error}
      className={className}
      name={name}
      disabled={disabled}
    >
      <div className="relative">
        <Field.Control
          render={
            <textarea
              className={cn(inputStyles, "min-h-28 resize-y py-3 pb-8 leading-relaxed")}
              maxLength={maxLength}
              value={value}
              defaultValue={defaultValue}
              onChange={(event) => {
                setLength(event.target.value.length);
                onChange?.(event);
              }}
              {...props}
            />
          }
        />
        {maxLength ? (
          <span
            aria-hidden="true"
            className={cn(
              "pointer-events-none absolute right-3 bottom-2 font-mono text-xs",
              currentLength >= maxLength ? "text-danger" : "text-paper/45",
            )}
          >
            {currentLength}/{maxLength}
          </span>
        ) : null}
      </div>
    </FieldShell>
  );
}
