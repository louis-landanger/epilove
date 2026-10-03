import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { NotificationCentre } from "@/components/rencontre/notifications/notification-centre";
import { GateScreen } from "@/components/rencontre/ui/states";
import { serverApi } from "@/lib/rencontre/api.server";
import { gated } from "@/lib/rencontre/gate";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("notifications");
  return { title: t("title") };
}

export default async function NotificationsPage() {
  const t = await getTranslations("notifications");
  const api = await serverApi();
  const result = await gated(() => api.notifications.list({ limit: 30 }));
  if (!result.ok) {
    return <GateScreen gate={result.gate} />;
  }
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-xl flex-col gap-6 px-4 pt-6 pb-10">
      <header className="flex items-center gap-3">
        <h1 className="mr-auto font-display font-semibold text-3xl tracking-tight">{t("title")}</h1>
        <a
          href="/reglages/notifications"
          className="flex items-center gap-2 rounded-full border border-paper/20 px-4 py-2 text-sm"
          title={t("settings.title")}
        >
          <svg
            viewBox="0 0 24 24"
            className="size-4"
            fill="none"
            stroke="currentColor"
            strokeWidth={1.8}
            aria-hidden="true"
          >
            <path d="M4 7h10M18 7h2M4 17h4M12 17h8" strokeLinecap="round" />
            <circle cx="16" cy="7" r="2" />
            <circle cx="10" cy="17" r="2" />
          </svg>
          {t("settingsShort")}
        </a>
      </header>
      <NotificationCentre initial={result.data} />
    </main>
  );
}
