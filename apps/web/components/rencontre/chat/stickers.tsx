import type { StickerId } from "@atomes/core";
import { colors, schoolColors } from "@atomes/tokens";
import type { ReactNode } from "react";
import { SchoolGlyph } from "../discovery/school";

/**
 * House stickers (CHAT-05), drawn in the app's "lab" style: atoms, bonds,
 * sparks. The school stickers use the app's school colours and glyphs, never
 * a school's logo. Every sticker has a die-cut white outline.
 */
const OUTLINE = colors.paper;
const INK = colors.ink;

function Frame({ children, label }: { children: ReactNode; label: string }) {
  return (
    <svg viewBox="0 0 120 120" role="img" aria-label={label} className="size-full">
      <title>{label}</title>
      <g strokeLinejoin="round" strokeLinecap="round">
        {children}
      </g>
    </svg>
  );
}

function Face({ fill, children }: { fill: string; children: ReactNode }) {
  return (
    <>
      <circle cx="60" cy="60" r="46" fill={fill} stroke={OUTLINE} strokeWidth="7" />
      {children}
    </>
  );
}

const SCHOOL_STICKERS = {
  "school-epita": "epita",
  "school-esme": "esme",
  "school-supbiotech": "supbiotech",
  "school-isg": "isg",
  "school-ipsa": "ipsa",
} as const;

export function StickerArt({ id, label }: { id: StickerId; label: string }) {
  if (id in SCHOOL_STICKERS) {
    const slug = SCHOOL_STICKERS[id as keyof typeof SCHOOL_STICKERS];
    const color = schoolColors[slug];
    return (
      <Frame label={label}>
        <rect x="14" y="14" width="92" height="92" rx="26" fill={color} stroke={OUTLINE} strokeWidth="7" />
        <ellipse
          cx="60"
          cy="60"
          rx="38"
          ry="14"
          fill="none"
          stroke={INK}
          strokeOpacity="0.35"
          strokeWidth="3"
          transform="rotate(-25 60 60)"
        />
        <foreignObject x="34" y="34" width="52" height="52">
          <div style={{ color: INK, width: "100%", height: "100%" }}>
            <SchoolGlyph slug={slug} className="size-full" />
          </div>
        </foreignObject>
      </Frame>
    );
  }
  switch (id) {
    case "atom-heart":
      return (
        <Frame label={label}>
          {[0, 60, 120].map((angle) => (
            <ellipse
              key={angle}
              cx="60"
              cy="60"
              rx="50"
              ry="18"
              fill="none"
              stroke={OUTLINE}
              strokeWidth="9"
              transform={`rotate(${angle} 60 60)`}
            />
          ))}
          {[0, 60, 120].map((angle) => (
            <ellipse
              key={angle}
              cx="60"
              cy="60"
              rx="50"
              ry="18"
              fill="none"
              stroke={colors.plasma}
              strokeWidth="4"
              transform={`rotate(${angle} 60 60)`}
            />
          ))}
          <path
            d="M60 78 C38 64 40 46 52 46 C57 46 60 50 60 53 C60 50 63 46 68 46 C80 46 82 64 60 78Z"
            fill={colors.plasma}
            stroke={OUTLINE}
            strokeWidth="5"
          />
        </Frame>
      );
    case "bond":
      return (
        <Frame label={label}>
          <path d="M42 54 H78 M42 66 H78" stroke={OUTLINE} strokeWidth="14" />
          <path d="M42 54 H78 M42 66 H78" stroke={INK} strokeWidth="5" />
          <circle cx="32" cy="60" r="22" fill={colors.volt} stroke={OUTLINE} strokeWidth="7" />
          <circle cx="88" cy="60" r="22" fill={colors.plasma} stroke={OUTLINE} strokeWidth="7" />
          <path d="M60 22 v10 M54 27 h12 M92 24 l5 5 M97 24 l-5 5" stroke={colors.volt} strokeWidth="3.5" />
        </Frame>
      );
    case "spark":
      return (
        <Frame label={label}>
          <path
            d="M66 10 L30 66 H56 L48 110 L90 48 H62 Z"
            fill={colors.volt}
            stroke={OUTLINE}
            strokeWidth="7"
          />
          <circle cx="24" cy="30" r="5" fill={colors.plasma} />
          <circle cx="98" cy="88" r="6" fill={colors.plasma} />
        </Frame>
      );
    case "coffee":
      return (
        <Frame label={label}>
          <path
            d="M28 52 H84 V78 C84 94 72 102 56 102 C40 102 28 94 28 78 Z"
            fill={OUTLINE}
            stroke={OUTLINE}
            strokeWidth="7"
          />
          <path d="M28 52 H84 V78 C84 94 72 102 56 102 C40 102 28 94 28 78 Z" fill={colors.plasma} />
          <path d="M84 60 C100 60 100 82 84 82" fill="none" stroke={OUTLINE} strokeWidth="7" />
          <path
            d="M46 40 C40 32 52 26 46 16 M62 40 C56 32 68 26 62 16"
            fill="none"
            stroke={colors.volt}
            strokeWidth="5"
          />
          <path d="M44 74 C48 80 64 80 68 74" fill="none" stroke={INK} strokeWidth="4" />
        </Frame>
      );
    case "laugh":
      return (
        <Frame label={label}>
          <Face fill={colors.volt}>
            <path d="M36 50 l10 -6 l10 6 M64 50 l10 -6 l10 6" fill="none" stroke={INK} strokeWidth="5" />
            <path d="M36 66 H84 C84 84 72 92 60 92 C48 92 36 84 36 66 Z" fill={INK} />
            <path d="M48 80 C54 86 66 86 72 80" fill="none" stroke={colors.plasma} strokeWidth="5" />
            <path
              d="M22 48 c-6 6 -6 14 0 18 M98 48 c6 6 6 14 0 18"
              fill="none"
              stroke="#7dd3fc"
              strokeWidth="4"
            />
          </Face>
        </Frame>
      );
    case "blush":
      return (
        <Frame label={label}>
          <Face fill="#ffd6a5">
            <path
              d="M40 52 c4 -4 10 -4 14 0 M66 52 c4 -4 10 -4 14 0"
              fill="none"
              stroke={INK}
              strokeWidth="5"
            />
            <ellipse cx="38" cy="68" rx="9" ry="6" fill={colors.plasma} opacity="0.7" />
            <ellipse cx="82" cy="68" rx="9" ry="6" fill={colors.plasma} opacity="0.7" />
            <path d="M52 76 C56 80 64 80 68 76" fill="none" stroke={INK} strokeWidth="4" />
          </Face>
          <path
            d="M96 22 C90 16 82 22 88 30 L96 38 L104 30 C110 22 102 16 96 22 Z"
            fill={colors.plasma}
            stroke={OUTLINE}
            strokeWidth="4"
          />
        </Frame>
      );
    case "wow":
      return (
        <Frame label={label}>
          <Face fill="#a5b4fc">
            <circle cx="44" cy="52" r="7" fill={INK} />
            <circle cx="76" cy="52" r="7" fill={INK} />
            <ellipse cx="60" cy="80" rx="9" ry="12" fill={INK} />
          </Face>
          <path d="M100 14 l4 10 l10 4 l-10 4 l-4 10 l-4 -10 l-10 -4 l10 -4 Z" fill={colors.volt} />
        </Frame>
      );
    case "cheers":
      return (
        <Frame label={label}>
          <g transform="rotate(-16 42 66)">
            <path d="M24 34 H58 L54 96 H28 Z" fill={OUTLINE} stroke={OUTLINE} strokeWidth="7" />
            <path d="M27 50 H55 L53 94 H29 Z" fill={colors.volt} />
          </g>
          <g transform="rotate(16 78 66)">
            <path d="M62 34 H96 L92 96 H66 Z" fill={OUTLINE} stroke={OUTLINE} strokeWidth="7" />
            <path d="M65 50 H93 L91 94 H67 Z" fill={colors.plasma} />
          </g>
          <path d="M60 10 v12 M46 16 l6 8 M74 16 l-6 8" stroke={colors.volt} strokeWidth="4" />
        </Frame>
      );
    default:
      return null;
  }
}
