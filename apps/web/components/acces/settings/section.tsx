import type { ReactNode } from "react";

/** A titled card of settings. */
export function Section({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section aria-labelledby={id} className="flex flex-col gap-4">
      <h2 id={id} className="font-display font-semibold text-2xl tracking-tight">
        {title}
      </h2>
      <div className="flex flex-col gap-5 rounded-[2rem] border border-paper/10 bg-paper/[0.03] p-5">
        {children}
      </div>
    </section>
  );
}
