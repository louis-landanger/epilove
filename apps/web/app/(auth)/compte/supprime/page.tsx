import type { Locale } from "@atomes/core";
import { buttonVariants } from "@atomes/ui";
import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { getLocale, getTranslations } from "next-intl/server";
import { publicHref } from "@/i18n/paths";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("settings.deleted");
  return { title: t("metaTitle") };
}

/** After a deletion request (SAF-14). Pages under /compte carry a nonce-based CSP: rendered per request. */
export default async function DeletedPage() {
  await connection();
  const t = await getTranslations("settings.deleted");
  return (
    <main id="contenu" className="mx-auto flex max-w-xl flex-col gap-6 px-4 py-16">
      <h1 className="text-balance font-display font-semibold text-4xl tracking-tight">{t("title")}</h1>
      <p className="text-lg text-paper/75">{t("body")}</p>
      <Link
        href={publicHref((await getLocale()) as Locale, "/")}
        className={buttonVariants({ variant: "secondary", className: "w-fit" })}
      >
        {t("home")}
      </Link>
    </main>
  );
}
