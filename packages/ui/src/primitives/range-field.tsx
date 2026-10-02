"use client";

import { Slider } from "@base-ui/react/slider";
import { type ReactNode, useId } from "react";
import { cn } from "../cn";

export interface RangeFieldProps {
  readonly label: ReactNode;
  readonly min: number;
  readonly max: number;
  readonly value: readonly [number, number];
  readonly onChange: (value: [number, number]) => void;
  readonly formatValue?: (value: number) => string;
  readonly thumbLabels: readonly [string, string];
  readonly className?: string;
}

/** Two-thumb range (age preferences). */
export function RangeField({
  label,
  min,
  max,
  value,
  onChange,
  formatValue = String,
  thumbLabels,
  className,
}: RangeFieldProps) {
  const id = useId();
  return (
    <div className={cn("flex flex-col gap-4", className)}>
      <div className="flex items-baseline justify-between">
        <span id={id} className="font-medium text-paper/90 text-sm">
          {label}
        </span>
        <span className="font-mono text-paper text-sm" aria-hidden="true">
          {formatValue(value[0])} – {formatValue(value[1])}
        </span>
      </div>
      <Slider.Root
        aria-labelledby={id}
        min={min}
        max={max}
        value={[...value]}
        minStepsBetweenValues={1}
        onValueChange={(next) => {
          if (Array.isArray(next) && next.length === 2) {
            onChange([next[0] as number, next[1] as number]);
          }
        }}
      >
        <Slider.Control className="flex h-8 w-full touch-none items-center">
          <Slider.Track className="relative h-1.5 w-full rounded-full bg-paper/15">
            <Slider.Indicator className="rounded-full bg-plasma" />
            {thumbLabels.map((thumbLabel) => (
              <Slider.Thumb
                key={thumbLabel}
                aria-label={thumbLabel}
                className="size-6 rounded-full border-2 border-plasma bg-paper shadow-lg focus-visible:outline-2 focus-visible:outline-offset-3 focus-visible:outline-volt"
              />
            ))}
          </Slider.Track>
        </Slider.Control>
      </Slider.Root>
    </div>
  );
}
