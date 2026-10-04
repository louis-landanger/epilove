import type { MemberCard } from "@atomes/contracts";
import { useTranslations } from "next-intl";

const ICONS: Record<MemberCard["badges"][number], string> = {
  founder: "M12 3l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.4 6.8 19.1l1-5.8L3.5 9.2l5.9-.9z",
  photo_verified: "M5 12.5l4.2 4.2L19 7",
  campus_verified: "M12 21s-7-6-7-11.5a7 7 0 0 1 14 0C19 15 12 21 12 21zM9.3 10l1.9 1.9L15 8.1",
  ambassador: "M6 21V4M6 4h11l-2 3.5 2 3.5H6",
};

/** Discreet badges (COM-04): small and quiet, never about popularity. */
export function MemberBadges({ badges }: { badges: MemberCard["badges"] }) {
  const t = useTranslations("discovery.badges");
  if (badges.length === 0) {
    return null;
  }
  return (
    <ul aria-label={t("label")} className="flex flex-wrap gap-1.5">
      {badges.map((badge) => (
        <li
          key={badge}
          className="flex items-center gap-1 rounded-full border border-paper/20 bg-ink/40 px-2 py-0.5 text-paper/85 text-xs"
        >
          <svg
            viewBox="0 0 24 24"
            className="size-3"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            strokeLinejoin="round"
            strokeLinecap="round"
            aria-hidden="true"
          >
            <path d={ICONS[badge]} />
          </svg>
          {t(badge)}
        </li>
      ))}
    </ul>
  );
}
