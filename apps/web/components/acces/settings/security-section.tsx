"use client";

import { authClient } from "@epilove/auth/client";
import { Button, Skeleton, useToast } from "@epilove/ui";
import { Fingerprint, LogOut, Monitor, Smartphone, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useFormatter, useTranslations } from "next-intl";
import { useCallback, useEffect, useState } from "react";
import { Section } from "./section";

interface DeviceSession {
  readonly token: string;
  readonly userAgent?: string | null;
  readonly createdAt: Date | string;
}

interface Passkey {
  readonly id: string;
  readonly name?: string | null;
  readonly createdAt: Date | string;
}

/** Turns a user agent into "Firefox · Windows", without keeping anything else. */
function describeDevice(userAgent: string | null | undefined): { label: string | null; mobile: boolean } {
  if (!userAgent) {
    return { label: null, mobile: false };
  }
  const browser =
    [/Edg\//, /OPR\//, /Firefox\//, /Chrome\//, /Safari\//]
      .map((pattern, index) =>
        pattern.test(userAgent) ? ["Edge", "Opera", "Firefox", "Chrome", "Safari"][index] : null,
      )
      .find(Boolean) ?? null;
  const system =
    [/iPhone|iPad/, /Android/, /Mac OS X/, /Windows/, /Linux/]
      .map((pattern, index) =>
        pattern.test(userAgent) ? ["iOS", "Android", "macOS", "Windows", "Linux"][index] : null,
      )
      .find(Boolean) ?? null;
  const label = [browser, system].filter(Boolean).join(" · ");
  return { label: label || null, mobile: /Mobile|iPhone|Android/.test(userAgent) };
}

/** Passkeys (ONB-03) and signed-in devices, revocable one by one (ONB-12). */
export function SecuritySection({ email }: { email: string }) {
  const t = useTranslations("settings.security");
  const format = useFormatter();
  const toast = useToast();
  const router = useRouter();
  const [sessions, setSessions] = useState<DeviceSession[] | null>(null);
  const [current, setCurrent] = useState<string | null>(null);
  const [passkeys, setPasskeys] = useState<Passkey[] | null>(null);

  const load = useCallback(async () => {
    const [sessionList, currentSession, passkeyList] = await Promise.all([
      authClient.listSessions(),
      authClient.getSession(),
      authClient.passkey.listUserPasskeys(),
    ]);
    setSessions((sessionList.data ?? []) as DeviceSession[]);
    setCurrent(currentSession.data?.session.token ?? null);
    setPasskeys((passkeyList.data ?? []) as Passkey[]);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const date = (value: Date | string) => format.dateTime(new Date(value), { dateStyle: "medium" });

  async function addPasskey() {
    const result = await authClient.passkey.addPasskey();
    if (result?.error) {
      toast.error(t("passkeyFailed"));
      return;
    }
    toast.success(t("passkeyAdded"));
    await load();
  }

  async function removePasskey(id: string) {
    await authClient.passkey.deletePasskey({ id });
    await load();
  }

  async function revoke(token: string) {
    await authClient.revokeSession({ token });
    toast.success(t("revoked"));
    await load();
  }

  async function revokeOthers() {
    await authClient.revokeOtherSessions();
    toast.success(t("revoked"));
    await load();
  }

  async function signOut() {
    await authClient.signOut();
    router.replace("/connexion");
    router.refresh();
  }

  return (
    <Section id="security" title={t("title")}>
      <div className="flex flex-col gap-1">
        <span className="text-paper/60 text-sm">{t("email")}</span>
        <span className="break-all font-mono text-sm">{email}</span>
      </div>

      <div className="flex flex-col gap-3">
        <h3 className="font-semibold">{t("passkeys")}</h3>
        {passkeys === null ? (
          <Skeleton className="h-10" />
        ) : passkeys.length === 0 ? (
          <p className="text-paper/50 text-sm">{t("passkeysEmpty")}</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {passkeys.map((passkey) => {
              const name = passkey.name || t("passkeyDefault", { date: date(passkey.createdAt) });
              return (
                <li key={passkey.id} className="flex items-center justify-between gap-3">
                  <span className="flex items-center gap-2 text-sm">
                    <Fingerprint className="size-4 text-volt" aria-hidden="true" />
                    {name}
                  </span>
                  <button
                    type="button"
                    aria-label={t("passkeyRemove", { name })}
                    onClick={() => void removePasskey(passkey.id)}
                    className="inline-flex size-9 items-center justify-center rounded-full text-paper/60 hover:bg-paper/10 hover:text-danger focus-visible:outline-2 focus-visible:outline-volt"
                  >
                    <Trash2 className="size-4" aria-hidden="true" />
                  </button>
                </li>
              );
            })}
          </ul>
        )}
        <Button variant="outline" size="sm" className="self-start" onClick={() => void addPasskey()}>
          {t("passkeyAdd")}
        </Button>
      </div>

      <div className="flex flex-col gap-3">
        <h3 className="font-semibold">{t("sessions")}</h3>
        {sessions === null ? (
          <Skeleton className="h-16" />
        ) : (
          <ul className="flex flex-col divide-y divide-paper/10">
            {sessions.map((session) => {
              const device = describeDevice(session.userAgent);
              const label = device.label ?? t("unknownDevice");
              const Icon = device.mobile ? Smartphone : Monitor;
              const isCurrent = session.token === current;
              return (
                <li
                  key={session.token}
                  className="flex items-center justify-between gap-3 py-3 first:pt-0 last:pb-0"
                >
                  <span className="flex items-center gap-3">
                    <Icon className="size-5 text-paper/60" aria-hidden="true" />
                    <span className="flex flex-col">
                      <span className="text-sm">
                        {label}
                        {isCurrent ? <span className="ml-2 text-volt text-xs">{t("thisDevice")}</span> : null}
                      </span>
                      <span className="text-paper/50 text-xs">
                        {t("lastActive", { date: date(session.createdAt) })}
                      </span>
                    </span>
                  </span>
                  {isCurrent ? null : (
                    <Button
                      variant="ghost"
                      size="sm"
                      aria-label={t("revokeLabel", { device: label })}
                      onClick={() => void revoke(session.token)}
                    >
                      {t("revoke")}
                    </Button>
                  )}
                </li>
              );
            })}
          </ul>
        )}
        {sessions && sessions.length > 1 ? (
          <Button variant="outline" size="sm" className="self-start" onClick={() => void revokeOthers()}>
            {t("revokeOthers")}
          </Button>
        ) : null}
      </div>

      <Button
        variant="secondary"
        className="self-start"
        onClick={() => void signOut()}
        leadingIcon={<LogOut className="size-4" aria-hidden="true" />}
      >
        {t("signOut")}
      </Button>
    </Section>
  );
}
