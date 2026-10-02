import { schoolColors, schoolFoils } from "@epilove/tokens";
import type { ReactNode } from "react";

type SchoolSlug = keyof typeof schoolColors;

export const isSchoolSlug = (slug: string): slug is SchoolSlug => slug in schoolColors;
export const schoolColor = (slug: string) => (isSchoolSlug(slug) ? schoolColors[slug] : "var(--color-paper)");
export const schoolFoil = (slug: string) => (isSchoolSlug(slug) ? schoolFoils[slug] : "kernel");

/**
 * Glyph of each school (not a logo: a sign of the "element family" of the
 * atomes crochus concept). Colour plus glyph, never colour alone.
 */
function Svg({ className, children }: { className: string; children: ReactNode }) {
  return (
    <svg
      className={className}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}

export function SchoolGlyph({ slug, className = "size-3.5" }: { slug: string; className?: string }) {
  switch (slug) {
    case "epita":
      return (
        <Svg className={className}>
          <path d="M6 2.5c-2 0-2 1.5-2 3s-1 2.5-2 2.5c1 0 2 1 2 2.5s0 3 2 3M10 2.5c2 0 2 1.5 2 3s1 2.5 2 2.5c-1 0-2 1-2 2.5s0 3-2 3" />
        </Svg>
      );
    case "esme":
      return (
        <Svg className={className}>
          <circle cx="8" cy="8" r="2.2" />
          <path d="M8 1.5v4.3M8 10.2v4.3M1.5 8h4.3M10.2 8h4.3" />
        </Svg>
      );
    case "supbiotech":
      return (
        <Svg className={className}>
          <path d="M8 1.8 13.4 4.9v6.2L8 14.2 2.6 11.1V4.9z" />
          <circle cx="8" cy="8" r="1.6" />
        </Svg>
      );
    case "isg":
      return (
        <Svg className={className}>
          <circle cx="8" cy="8" r="5.8" />
          <path d="M8 2.2c2.2 2 2.2 9.6 0 11.6M8 2.2c-2.2 2-2.2 9.6 0 11.6M2.2 8h11.6" />
        </Svg>
      );
    default:
      return (
        <Svg className={className}>
          <ellipse cx="8" cy="8" rx="6.4" ry="2.6" transform="rotate(-25 8 8)" />
          <circle cx="8" cy="8" r="1.6" fill="currentColor" stroke="none" />
        </Svg>
      );
  }
}

export function SchoolBadge({
  slug,
  name,
  className = "",
}: {
  slug: string;
  name: string;
  className?: string;
}) {
  const color = schoolColor(slug);
  return (
    <span
      className={`relative inline-flex items-center gap-1.5 overflow-hidden rounded-full border px-2.5 py-1 font-mono text-[11px] uppercase tracking-wider ${className}`}
      style={{ borderColor: `color-mix(in oklch, ${color} 60%, transparent)`, color }}
    >
      <SchoolGlyph slug={slug} />
      <span className="text-paper">{name}</span>
      <span
        aria-hidden="true"
        className="foil"
        data-foil={schoolFoil(slug)}
        style={{ ["--foil-strength" as string]: 0.28 }}
      />
    </span>
  );
}
