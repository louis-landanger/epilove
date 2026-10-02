import type { Locale } from "@epilove/core";
import { buttonVariants } from "@epilove/ui";
import type { Metadata } from "next";
import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { IonCatcher } from "@/components/acces/fun/ion-catcher";
import { publicHref } from "@/i18n/paths";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("common.notFound");
  return { title: t("metaTitle") };
}

/** COM-05: a 404 worth getting lost for. */
export default async function NotFound() {
  const t = await getTranslations("common.notFound");
  return (
    <main
      id="contenu"
      className="mx-auto flex min-h-dvh w-full max-w-3xl flex-col justify-center gap-8 px-4 py-16"
    >
      <div className="flex flex-col gap-3">
        <p className="font-mono text-plasma text-xs uppercase tracking-[0.2em]">{t("code")}</p>
        <h1 className="text-balance font-display font-semibold text-4xl tracking-tight sm:text-6xl">
          {t("title")}
        </h1>
        <p className="max-w-prose text-lg text-paper/70">{t("lead")}</p>
      </div>
      <IonCatcher />
      <Link
        href={publicHref((await getLocale()) as Locale, "/")}
        className={buttonVariants({ variant: "secondary", className: "w-fit" })}
      >
        {t("home")}
      </Link>
    </main>
  );
}
