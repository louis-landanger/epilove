"use client";

import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { api } from "@/lib/api-client";

type Status = "loading" | "unsupported" | "ios-install" | "not-configured" | "denied" | "off" | "on";

function base64UrlToBytes(value: string): Uint8Array<ArrayBuffer> {
  const padded = `${value}${"=".repeat((4 - (value.length % 4)) % 4)}`.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(padded);
  const bytes = new Uint8Array(new ArrayBuffer(binary.length));
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

const isIos = () => /iphone|ipad|ipod/i.test(navigator.userAgent);
const isStandalone = () =>
  window.matchMedia("(display-mode: standalone)").matches ||
  (navigator as Navigator & { standalone?: boolean }).standalone === true;

/**
 * Push opt-in for this device (NOT-01). Permission is only asked on an
 * explicit tap, never on page load; iPhones first need the app on the home
 * screen (iOS 16.4+).
 */
export function PushToggle() {
  const t = useTranslations("notifications.settings");
  const [status, setStatus] = useState<Status>("loading");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const [publicKey, setPublicKey] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) {
        setStatus(isIos() && !isStandalone() ? "ios-install" : "unsupported");
        return;
      }
      const { publicKey: key } = await api.notifications.pushConfig().catch(() => ({ publicKey: null }));
      setPublicKey(key);
      if (!key) {
        setStatus("not-configured");
        return;
      }
      if (Notification.permission === "denied") {
        setStatus("denied");
        return;
      }
      const registration = await navigator.serviceWorker.getRegistration();
      const subscription = await registration?.pushManager.getSubscription();
      setStatus(subscription ? "on" : "off");
    })();
  }, []);

  const enable = async () => {
    if (!publicKey) {
      return;
    }
    setBusy(true);
    setError(false);
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setStatus(permission === "denied" ? "denied" : "off");
        return;
      }
      const registration =
        (await navigator.serviceWorker.getRegistration()) ??
        (await navigator.serviceWorker.register("/serwist/sw.js"));
      await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: base64UrlToBytes(publicKey),
      });
      const json = subscription.toJSON();
      await api.notifications.subscribe({
        endpoint: subscription.endpoint,
        keys: { p256dh: json.keys?.p256dh ?? "", auth: json.keys?.auth ?? "" },
        userAgent: navigator.userAgent.slice(0, 300),
      });
      setStatus("on");
    } catch {
      setError(true);
    } finally {
      setBusy(false);
    }
  };

  const disable = async () => {
    setBusy(true);
    setError(false);
    try {
      const registration = await navigator.serviceWorker.getRegistration();
      const subscription = await registration?.pushManager.getSubscription();
      if (subscription) {
        await api.notifications.unsubscribe({ endpoint: subscription.endpoint });
        await subscription.unsubscribe();
      }
      setStatus("off");
    } catch {
      setError(true);
    } finally {
      setBusy(false);
    }
  };

  const message: Partial<Record<Status, string>> = {
    unsupported: t("unsupported"),
    "ios-install": t("ios"),
    "not-configured": t("notConfigured"),
    denied: t("denied"),
    on: t("enabled"),
  };

  return (
    <section
      aria-labelledby="push-title"
      className="flex flex-col gap-3 rounded-3xl border border-paper/10 p-5"
    >
      <h2 id="push-title" className="font-semibold">
        {t("push")}
      </h2>
      <p className="text-paper/70 text-sm">{t("pushLead")}</p>
      {message[status] && (
        <p role="status" className={`text-sm ${status === "on" ? "text-volt" : "text-paper/80"}`}>
          {message[status]}
        </p>
      )}
      {status === "off" && (
        <button
          type="button"
          onClick={enable}
          disabled={busy}
          className="self-start rounded-full bg-plasma px-5 py-2.5 font-semibold text-ink disabled:opacity-50"
        >
          {t("enable")}
        </button>
      )}
      {status === "on" && (
        <button
          type="button"
          onClick={disable}
          disabled={busy}
          className="self-start rounded-full border border-paper/25 px-5 py-2.5 disabled:opacity-50"
        >
          {t("disable")}
        </button>
      )}
      {error && (
        <p role="alert" className="text-plasma text-sm">
          {t("error")}
        </p>
      )}
    </section>
  );
}
