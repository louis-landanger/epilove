import type { CrossSchoolView } from "@atomes/contracts";
import { SCHOOLS } from "@atomes/core";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { schoolColor } from "../discovery/school";

const nameOf = (slug: string) => SCHOOLS.find((s) => s.slug === slug)?.name ?? slug;

/** Cross-school index (COM-02): pairs of schools with ten new bonds or more this week, no totals. */
export async function CrossSchoolScreen({ index }: { index: CrossSchoolView }) {
  const t = await getTranslations("campus.crossSchool");
  const max = Math.max(1, ...index.pairs.map((p) => p.count));
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-2xl flex-col gap-6 px-4 pt-6 pb-10">
      <header className="flex flex-col gap-2">
        <Link href="/campus" className="self-start text-paper/70 text-sm underline-offset-4 hover:underline">
          {t("back")}
        </Link>
        <h1 className="font-display font-semibold text-3xl tracking-tight">{t("title")}</h1>
        <p className="text-paper/75">{t("lead")}</p>
      </header>
      {index.pairs.length === 0 ? (
        <p className="rounded-3xl border border-paper/15 border-dashed px-5 py-10 text-center text-paper/70">
          {t("empty")}
        </p>
      ) : (
        <ol className="flex flex-col gap-3">
          {index.pairs.map((pair) => (
            <li
              key={`${pair.a}-${pair.b}`}
              className="flex flex-col gap-2 rounded-3xl border border-paper/10 p-4"
            >
              <p className="flex flex-wrap items-baseline justify-between gap-2">
                <span className="font-display font-semibold text-lg">
                  {t("pair", { a: nameOf(pair.a), b: nameOf(pair.b) })}
                </span>
                <span className="font-mono text-paper/75 text-sm">{t("count", { count: pair.count })}</span>
              </p>
              <span aria-hidden="true" className="flex h-2.5 overflow-hidden rounded-full bg-paper/10">
                <span
                  className="h-full"
                  style={{ width: `${(pair.count / max) * 50}%`, background: schoolColor(pair.a) }}
                />
                <span
                  className="h-full"
                  style={{ width: `${(pair.count / max) * 50}%`, background: schoolColor(pair.b) }}
                />
              </span>
            </li>
          ))}
        </ol>
      )}
      <p className="text-paper/60 text-sm">{t("threshold")}</p>
    </main>
  );
}
