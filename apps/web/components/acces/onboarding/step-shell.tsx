"use client";

import { cn } from "@atomes/ui";
import { type FormEvent, type ReactNode, useEffect, useRef } from "react";

export interface StepShellProps {
  readonly eyebrow?: ReactNode;
  readonly title: ReactNode;
  readonly lead?: ReactNode;
  readonly children: ReactNode;
  /** Primary actions, pinned to the bottom on small screens. */
  readonly actions: ReactNode;
  readonly onSubmit?: () => void;
  /** Moves focus to the title when the step appears after a navigation. */
  readonly focusTitle?: boolean;
  readonly className?: string;
}

/** Common frame of an onboarding step: title, content, actions. */
export function StepShell({
  eyebrow,
  title,
  lead,
  children,
  actions,
  onSubmit,
  focusTitle,
  className,
}: StepShellProps) {
  const heading = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    if (focusTitle) {
      heading.current?.focus({ preventScroll: true });
    }
  }, [focusTitle]);

  return (
    <form
      noValidate
      onSubmit={(event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        onSubmit?.();
      }}
      className={cn("flex min-h-full flex-col gap-8", className)}
    >
      <div className="flex flex-col gap-3">
        {eyebrow ? (
          <p className="font-mono text-plasma text-xs uppercase tracking-[0.2em]">{eyebrow}</p>
        ) : null}
        <h1
          ref={heading}
          tabIndex={-1}
          className="text-balance font-display font-semibold text-4xl tracking-tight outline-none sm:text-5xl"
        >
          {title}
        </h1>
        {lead ? <p className="max-w-prose text-pretty text-lg text-paper/70">{lead}</p> : null}
      </div>
      <div className="flex flex-1 flex-col gap-6">{children}</div>
      <div className="sticky bottom-0 -mx-4 mt-auto flex flex-col gap-3 bg-gradient-to-t from-ink/85 via-ink/60 to-transparent px-4 pt-6 pb-[max(1rem,env(safe-area-inset-bottom))] sm:static sm:mx-0 sm:bg-none sm:px-0 sm:pb-0">
        {actions}
      </div>
    </form>
  );
}
