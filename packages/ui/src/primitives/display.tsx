import type { ComponentProps, ReactNode } from "react";
import { cn } from "../cn";

export function Card({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      className={cn("rounded-[1.75rem] border border-paper/10 bg-paper/[0.04] p-6", className)}
      {...props}
    />
  );
}

export function Badge({
  tone = "neutral",
  className,
  ...props
}: ComponentProps<"span"> & { tone?: "neutral" | "plasma" | "volt" | "success" | "danger" }) {
  const tones = {
    neutral: "bg-paper/10 text-paper/85",
    plasma: "bg-plasma/15 text-plasma",
    volt: "bg-volt/15 text-volt",
    success: "bg-success/15 text-success",
    danger: "bg-danger/15 text-danger",
  } as const;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2.5 py-1 font-medium text-xs",
        tones[tone],
        className,
      )}
      {...props}
    />
  );
}

export function Skeleton({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      aria-hidden="true"
      className={cn("animate-pulse rounded-2xl bg-paper/[0.08]", className)}
      {...props}
    />
  );
}

export function EmptyState({
  icon,
  title,
  titleAs: Title = "p",
  description,
  action,
  className,
}: {
  icon?: ReactNode;
  title: ReactNode;
  /** `h1` when the state replaces the whole page. */
  titleAs?: "p" | "h1" | "h2";
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn("mx-auto flex max-w-sm flex-col items-center gap-3 px-6 py-16 text-center", className)}
    >
      {icon ? (
        <div className="mb-2 flex size-16 items-center justify-center rounded-full bg-paper/[0.06] text-plasma">
          {icon}
        </div>
      ) : null}
      <Title className="font-display font-semibold text-2xl tracking-tight">{title}</Title>
      {description ? <p className="text-paper/65">{description}</p> : null}
      {action ? <div className="mt-3">{action}</div> : null}
    </div>
  );
}

export function ProgressBar({ value, max, label }: { value: number; max: number; label: string }) {
  const ratio = Math.min(1, Math.max(0, value / max));
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={max}
      aria-valuenow={value}
      className="h-1.5 w-full overflow-hidden rounded-full bg-paper/10"
    >
      <div
        className="h-full rounded-full bg-gradient-to-r from-plasma to-volt transition-[width] duration-500 ease-out"
        style={{ width: `${ratio * 100}%` }}
      />
    </div>
  );
}

export function VisuallyHidden({ children }: { children: ReactNode }) {
  return <span className="sr-only">{children}</span>;
}
