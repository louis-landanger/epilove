import type { SchoolSlug } from "@epilove/core";
import { schoolColors } from "@epilove/tokens";

/**
 * Our own glyph per school (docs/02-design.md): colour never carries the
 * information alone. These are Epilove's "element families", not school logos.
 * EPITA "Kernel" brackets, ESME "Ampère" bolt, Sup'Biotech "Enzyme" hexagon,
 * ISG "Capital" guilloché rings, IPSA "Stratosphère" star.
 */
const PATHS: Record<SchoolSlug, string> = {
  epita: "M8 4 3 10l5 6M12 4l5 6-5 6",
  esme: "M11.5 2 4.5 11h5l-1 7 7-9h-5l1-7Z",
  supbiotech: "M10 2.5 16.5 6.25v7.5L10 17.5l-6.5-3.75v-7.5L10 2.5Z",
  isg: "M7 10a3 3 0 1 0 6 0 3 3 0 1 0-6 0M3.5 10a6.5 6.5 0 1 0 13 0 6.5 6.5 0 1 0-13 0",
  ipsa: "M10 2c.6 4.2 3.8 7.4 8 8-4.2.6-7.4 3.8-8 8-.6-4.2-3.8-7.4-8-8 4.2-.6 7.4-3.8 8-8Z",
};

export function SchoolGlyph({
  slug,
  className,
  colored = true,
}: {
  slug: SchoolSlug;
  className?: string;
  colored?: boolean;
}) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 20 20"
      fill="none"
      stroke={colored ? schoolColors[slug] : "currentColor"}
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <path d={PATHS[slug]} />
    </svg>
  );
}
