import { schoolColors } from "@atomes/tokens";
import { cn } from "../cn";

type SchoolSlug = keyof typeof schoolColors;

/**
 * Each school has a colour AND a glyph, so the information never relies on
 * colour alone (docs/02-design.md). Glyphs are original shapes, not school logos.
 */
const GLYPHS: Record<SchoolSlug, string> = {
  epita: "M8 5 4 12l4 7M16 5l4 7-4 7",
  esme: "M13 3 6 13h5l-1 8 7-10h-5l1-8Z",
  supbiotech: "M7 3c0 6 10 6 10 12s-10 3-10 6M17 3c0 6-10 6-10 12",
  isg: "M12 3 20 12 12 21 4 12Z",
  ipsa: "M12 3l2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5Z",
};

export function SchoolGlyph({ school, className }: { school: SchoolSlug; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className={cn("size-4 shrink-0", className)}>
      <path
        d={GLYPHS[school]}
        fill="none"
        stroke={schoolColors[school]}
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2.2"
      />
    </svg>
  );
}

export function SchoolChip({
  school,
  name,
  className,
}: {
  school: SchoolSlug;
  name: string;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border border-paper/15 px-3 py-1 font-mono text-paper/90 text-xs",
        className,
      )}
    >
      <SchoolGlyph school={school} />
      {name}
    </span>
  );
}
