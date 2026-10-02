"use client";

import type { NotificationPreferencesView } from "@epilove/contracts";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { api } from "@/lib/rencontre/api.client";

const GROUPS = ["likes", "matches", "messages", "drop", "pact"] as const;
type Group = (typeof GROUPS)[number];

/** Notification preferences per group and channel (NOT-03), and conversation settings (CHAT-02). */
export function PreferencesForm({
  initial,
  chat,
}: {
  initial: NotificationPreferencesView;
  chat: { readReceipts: boolean; onlineStatus: boolean };
}) {
  const t = useTranslations("notifications.settings");
  const [groups, setGroups] = useState(initial.groups);
  const [chatSettings, setChatSettings] = useState(chat);
  const [saved, setSaved] = useState<string | null>(null);

  const flash = (message: string) => {
    setSaved(message);
    window.setTimeout(() => setSaved(null), 2000);
  };

  const toggle = async (group: Group, channel: "push" | "email") => {
    const current = groups[group] ?? { push: true, email: false };
    const next = { ...groups, [group]: { ...current, [channel]: !current[channel] } };
    setGroups(next);
    try {
      const result = await api.notifications.savePreferences({ groups: next });
      setGroups(result.groups);
      flash(t("saved"));
    } catch {
      setGroups(groups);
      flash(t("error"));
    }
  };

  const toggleChat = async (key: "readReceipts" | "onlineStatus") => {
    const next = { ...chatSettings, [key]: !chatSettings[key] };
    setChatSettings(next);
    try {
      setChatSettings(await api.messaging.saveSettings(next));
      flash(t("saved"));
    } catch {
      setChatSettings(chatSettings);
      flash(t("error"));
    }
  };

  return (
    <>
      <section
        aria-labelledby="groups-title"
        className="flex flex-col gap-3 rounded-3xl border border-paper/10 p-5"
      >
        <h2 id="groups-title" className="font-semibold">
          {t("groupsTitle")}
        </h2>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-paper/60">
              <th scope="col" className="py-2 text-left font-normal">
                <span className="sr-only">{t("groupsTitle")}</span>
              </th>
              <th scope="col" className="w-20 py-2 font-normal">
                {t("channelPush")}
              </th>
              <th scope="col" className="w-20 py-2 font-normal">
                {t("channelEmail")}
              </th>
            </tr>
          </thead>
          <tbody>
            {GROUPS.map((group) => {
              const value = groups[group] ?? { push: true, email: false };
              return (
                <tr key={group} className="border-paper/10 border-t">
                  <th scope="row" className="py-3 text-left font-normal">
                    {t(`groups.${group}`)}
                  </th>
                  {(["push", "email"] as const).map((channel) => (
                    <td key={channel} className="py-3 text-center">
                      <Switch
                        checked={value[channel]}
                        label={`${t(`groups.${group}`)} : ${channel === "push" ? t("channelPush") : t("channelEmail")}`}
                        onChange={() => toggle(group, channel)}
                      />
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
        <p className="text-paper/60 text-xs">{t("emailHint")}</p>
        <p className="text-paper/60 text-xs">{t("discreet")}</p>
      </section>

      <section
        aria-labelledby="chat-title"
        className="flex flex-col gap-4 rounded-3xl border border-paper/10 p-5"
      >
        <h2 id="chat-title" className="font-semibold">
          {t("chatTitle")}
        </h2>
        {(["readReceipts", "onlineStatus"] as const).map((key) => (
          <div key={key} className="flex items-start justify-between gap-4">
            <div>
              <p>{t(key)}</p>
              <p className="text-paper/60 text-xs">{t(`${key}Hint`)}</p>
            </div>
            <Switch checked={chatSettings[key]} label={t(key)} onChange={() => toggleChat(key)} />
          </div>
        ))}
      </section>

      <p aria-live="polite" className="min-h-5 text-center text-sm text-volt">
        {saved}
      </p>
    </>
  );
}

function Switch({ checked, label, onChange }: { checked: boolean; label: string; onChange: () => void }) {
  return (
    <label className="relative inline-flex cursor-pointer items-center has-focus-visible:outline-2 has-focus-visible:outline-volt has-focus-visible:outline-offset-4 rounded-full">
      <input
        type="checkbox"
        role="switch"
        aria-checked={checked}
        checked={checked}
        onChange={onChange}
        className="peer sr-only"
        aria-label={label}
      />
      <span className="h-7 w-12 rounded-full bg-paper/15 transition-colors peer-checked:bg-volt" />
      <span className="absolute left-1 size-5 rounded-full bg-paper transition-transform peer-checked:translate-x-5 peer-checked:bg-ink" />
    </label>
  );
}
