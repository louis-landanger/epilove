import type { ReactNode } from "react";

/** Small mono label above section titles, with a glowing "ion". */
export function Eyebrow({ children, tone = "dark" }: { children: ReactNode; tone?: "dark" | "light" }) {
  return (
    <p
      className={`flex items-center gap-3 font-mono text-xs uppercase tracking-[0.22em] ${
        tone === "dark" ? "text-paper/70" : "text-ink/70"
      }`}
    >
      <span
        aria-hidden="true"
        className={`size-1.5 rounded-full ${tone === "dark" ? "bg-volt shadow-[0_0_12px_var(--color-volt)]" : "bg-plasma"}`}
      />
      {children}
    </p>
  );
}

/** Renders `<em>` tags of rich messages as the serif italic accent in plasma. */
export const accent = {
  em: (chunks: ReactNode) => <em className="font-normal font-serif text-plasma italic">{chunks}</em>,
};
