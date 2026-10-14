/**
 * The mark (an ion in orbit, apps/web/app/icon.svg) and the lowercase logotype.
 * The electron rests at the orbit's right end; on the landing it travels along
 * the orbit (marketing.css) and reduced motion freezes it. It is drawn over the
 * mark rather than in it: moved by a transform, it is animated by the
 * compositor alone, where an element of the SVG would be laid out and painted
 * again at every frame. `className` sizes the mark and must position it
 * (`relative`, `absolute`…): the electron is placed within it.
 */
export function LogoMark({ className }: { className?: string }) {
  return (
    <span aria-hidden="true" className={`inline-block ${className ?? ""}`}>
      <svg aria-hidden="true" viewBox="0 0 64 64" className="block size-full">
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
      </svg>
      {/* Drawn as the mark is (the same box, the electron on the nucleus), then carried to the
          orbit's right end (51.05, 21). */}
      <svg
        aria-hidden="true"
        viewBox="0 0 64 64"
        className="logo-electron absolute inset-0 size-full [transform:translate(29.7656%,-17.1875%)]"
      >
        <circle cx="32" cy="32" r="4" className="fill-volt" />
      </svg>
    </span>
  );
}

/** `compact`: the wordmark gives way to the mark alone on very narrow screens. */
export function Logotype({ className, compact = false }: { className?: string; compact?: boolean }) {
  return (
    <span className={`inline-flex items-center gap-2 ${className ?? ""}`}>
      <LogoMark className="relative size-8 text-paper" />
      <span
        className={`${compact ? "max-[419px]:hidden " : ""}font-semibold font-[family-name:var(--font-headline,var(--font-display))] text-xl lowercase tracking-tight [font-variation-settings:'wdth'_90]`}
      >
        atomes
      </span>
    </span>
  );
}
