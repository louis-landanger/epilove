import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("notifications.offline");
  return { title: t("title") };
}

/** Shown by the service worker when a page is requested without network. Static, cached. */
export default async function OfflinePage() {
  const t = await getTranslations("notifications.offline");
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-4 px-6 text-center">
      <span aria-hidden="true" className="relative block size-20">
        <span className="absolute inset-0 rounded-full border border-paper/20" />
        <span className="absolute top-1/2 left-0 size-2.5 -translate-y-1/2 rounded-full bg-plasma" />
      </span>
      <h1 className="font-display font-semibold text-3xl">{t("title")}</h1>
      <p className="text-paper/70">{t("lead")}</p>
    </main>
  );
}
