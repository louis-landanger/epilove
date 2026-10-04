import type { CompatibilityView } from "@atomes/contracts";
import { getTranslations } from "next-intl/server";

/** Compatibility explained (DEC-05): a gauge, two shared answers and one harmless disagreement. */
export async function CompatibilityPanel({ compatibility }: { compatibility: CompatibilityView | null }) {
  const t = await getTranslations("matches.profile");
  const score = compatibility?.score;
  const percent = typeof score === "number" ? Math.round(score * 100) : null;
  const circumference = 2 * Math.PI * 42;

  return (
    <section
      aria-labelledby="compatibility"
      className="rounded-3xl border border-paper/10 bg-paper/[0.03] p-5"
    >
      <div className="flex items-center gap-5">
        <svg viewBox="0 0 100 100" className="size-24 shrink-0 -rotate-90" aria-hidden="true">
          <circle
            cx="50"
            cy="50"
            r="42"
            fill="none"
            stroke="currentColor"
            strokeOpacity="0.1"
            strokeWidth="8"
          />
          {percent !== null && (
            <circle
              cx="50"
              cy="50"
              r="42"
              fill="none"
              stroke="var(--color-volt)"
              strokeWidth="8"
              strokeLinecap="round"
              strokeDasharray={circumference}
              strokeDashoffset={circumference * (1 - percent / 100)}
            />
          )}
        </svg>
        <div className="flex flex-col gap-1">
          <h2 id="compatibility" className="font-semibold">
            {t("compatibility")}
          </h2>
          <p className="font-mono text-3xl text-volt">{percent !== null ? `${percent} %` : "—"}</p>
          <p className="text-paper/60 text-xs">{t("compatibilityLead")}</p>
        </div>
      </div>
      {compatibility === null ? (
        <a
          href="/campus/questionnaire"
          className="mt-4 inline-block text-sm text-volt underline underline-offset-4"
        >
          {t("fillQuestionnaire")}
        </a>
      ) : (
        <ul className="mt-4 flex flex-col gap-2 text-paper/85 text-sm">
          {percent === null && <li className="text-paper/60">{t("notEnough")}</li>}
          {compatibility.agreements.map((agreement) => (
            <li key={agreement.question} className="flex gap-2">
              <span aria-hidden="true" className="text-volt">
                ✓
              </span>
              {t("agreement", agreement)}
            </li>
          ))}
          {compatibility.quirk && (
            <li className="flex gap-2 text-paper/70">
              <span aria-hidden="true">≠</span>
              {t("quirk", compatibility.quirk)}
            </li>
          )}
        </ul>
      )}
    </section>
  );
}
