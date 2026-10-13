import type { SchoolSlug } from "@atomes/core";
import { schoolColors, schoolGlyphs } from "@atomes/tokens";

/**
 * Our own glyph per school (docs/02-design.md, `schoolGlyphs` in the design
 * tokens): colour never carries the information alone. These are the "element
 * families" of Atomes, not school logos.
 */
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
      <path d={schoolGlyphs[slug]} />
    </svg>
  );
}
