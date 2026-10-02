/**
 * The mark (an ion in orbit, apps/web/app/icon.svg) and the lowercase logotype.
 * The electron travels along the orbit; reduced motion freezes it.
 */
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 64 64" className={className}>
      <ellipse
        cx="32"
        cy="32"
        rx="22"
        ry="9"
        fill="none"
        stroke="currentColor"
        strokeOpacity="0.45"
        strokeWidth="2.5"
        transform="rotate(-30 32 32)"
      />
      <circle cx="32" cy="32" r="6.5" className="fill-plasma" />
      <circle r="4" className="logo-electron fill-volt" />
    </svg>
  );
}

/** `compact`: the wordmark gives way to the mark alone on very narrow screens. */
export function Logotype({ className, compact = false }: { className?: string; compact?: boolean }) {
  return (
    <span className={`inline-flex items-center gap-2 ${className ?? ""}`}>
      <LogoMark className="size-8 text-paper" />
      <span
        className={`${compact ? "max-[419px]:hidden " : ""}font-semibold font-[family-name:var(--font-headline,var(--font-display))] text-xl lowercase tracking-tight [font-variation-settings:'wdth'_90]`}
      >
        epilove
      </span>
    </span>
  );
}
