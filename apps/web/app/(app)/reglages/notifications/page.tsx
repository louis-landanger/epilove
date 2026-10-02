import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { PreferencesForm } from "@/components/rencontre/notifications/preferences-form";
import { PushToggle } from "@/components/rencontre/notifications/push-toggle";
import { GateScreen } from "@/components/rencontre/ui/states";
import { serverApi } from "@/lib/rencontre/api.server";
import { gated } from "@/lib/rencontre/gate";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("notifications.settings");
  return { title: t("title") };
}

export default async function NotificationSettingsPage() {
  const t = await getTranslations("notifications.settings");
  const api = await serverApi();
  const result = await gated(() =>
    Promise.all([api.notifications.preferences(), api.messaging.settings(), api.notifications.quietHours()]),
  );
  if (!result.ok) {
    return <GateScreen gate={result.gate} />;
  }
  const [preferences, chat, quiet] = result.data;
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-xl flex-col gap-5 px-4 pt-6 pb-10">
      <a href="/notifications" className="text-paper/60 text-sm hover:text-paper">
        ← {t("back")}
      </a>
      <h1 className="font-display font-semibold text-3xl tracking-tight">{t("title")}</h1>
      <PushToggle />
      <PreferencesForm initial={preferences} chat={chat} quiet={quiet} />
    </main>
  );
}
