import type { TargetState } from "@epilove/core";
import { cn } from "@epilove/ui";
import type { ReactNode } from "react";

const STATE_LABEL: Record<TargetState, string> = {
  met: "Cible atteinte",
  missed: "Sous la cible",
  unknown: "Pas encore mesurable",
};

/** One indicator: value, label, optional target and its state. */
export function Kpi({
  label,
  value,
  detail,
  target,
  state,
}: {
  label: string;
  value: ReactNode;
  detail?: ReactNode;
  target?: string;
  state?: TargetState;
}) {
  return (
    <div
      className={cn(
        "flex flex-col gap-2 rounded-3xl border bg-paper/[0.03] p-5",
        state === "met" && "border-success/50",
        state === "missed" && "border-danger/50",
        (state === undefined || state === "unknown") && "border-paper/15",
      )}
    >
      <dt className="text-paper/70 text-sm">{label}</dt>
      <dd className="font-display font-semibold text-3xl tabular-nums">{value}</dd>
      {detail || target ? (
        <dd className="flex flex-wrap items-center gap-x-3 gap-y-1 text-paper/60 text-xs">
          {detail ? <span>{detail}</span> : null}
          {target ? (
            <span>
              Cible {target}
              {state ? <span className="sr-only"> : {STATE_LABEL[state]}</span> : null}
            </span>
          ) : null}
        </dd>
      ) : null}
    </div>
  );
}

export function KpiGrid({ children }: { children: ReactNode }) {
  return <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{children}</dl>;
}

export function DashboardSection({
  id,
  title,
  children,
}: {
  id: string;
  title: string;
  children: ReactNode;
}) {
  return (
    <section aria-labelledby={id} className="flex flex-col gap-4">
      <h2 id={id} className="font-display font-semibold text-2xl tracking-tight">
        {title}
      </h2>
      {children}
    </section>
  );
}
