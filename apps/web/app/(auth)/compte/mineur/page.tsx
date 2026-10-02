import type { Locale } from "@epilove/core";
import { buttonVariants } from "@epilove/ui";
import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { getLocale, getTranslations } from "next-intl/server";
import { publicHref } from "@/i18n/paths";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("onboarding.underage");
  return { title: t("metaTitle") };
}

/** Shown after an under-18 declaration: the account no longer exists (ONB-04). */
export default async function UnderagePage() {
  // Rendered per request: pages under /compte carry a nonce-based CSP (proxy.ts).
  await connection();
  const t = await getTranslations("onboarding.underage");
  return (
    <main id="contenu" className="mx-auto flex max-w-xl flex-col gap-6 px-4 py-16">
      <h1 className="text-balance font-display font-semibold text-4xl tracking-tight">{t("title")}</h1>
      <p className="text-lg text-paper/75">{t("body")}</p>
      <p className="text-paper/60">{t("help")}</p>
      <Link
        href={publicHref((await getLocale()) as Locale, "/")}
        className={buttonVariants({ variant: "secondary", className: "w-fit" })}
      >
        {t("home")}
      </Link>
    </main>
  );
}
