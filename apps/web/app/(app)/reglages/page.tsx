import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { SettingsScreen } from "@/components/acces/settings/settings-screen";
import { serverApi } from "@/lib/server/api-app";
import { requireAppMember } from "@/lib/server/session";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("settings");
  return { title: t("metaTitle") };
}

export default async function SettingsPage() {
  const member = await requireAppMember();
  const api = await serverApi();
  const [account, settings, hidden, blocked] = await Promise.all([
    api.account.summary(),
    api.preferences.get(),
    api.preferences.hiddenContacts(),
    api.safety.blocked(),
  ]);
  return (
    <SettingsScreen
      userId={member.userId}
      account={account}
      settings={settings}
      hiddenContacts={hidden.contacts}
      blocked={blocked.people}
    />
  );
}
