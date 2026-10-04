"use client";

import { authClient } from "@atomes/auth/client";
import { Button, TextField } from "@atomes/ui";
import { Fingerprint, LockKeyhole } from "lucide-react";
import { useTranslations } from "next-intl";
import { type FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { checkPin, type LockConfig, PIN_ATTEMPTS, shouldLock } from "./lock-config";
import {
  clearSession,
  LOCK_CHANGED,
  markActive,
  readAttempts,
  readConfig,
  readSession,
  verifyWithPasskey,
  writeAttempts,
  writeConfig,
} from "./lock-store";

/** While unlocked and in the foreground, the tab stays "active" at this pace. */
const HEARTBEAT_MS = 5_000;

function setLockedAttribute(locked: boolean) {
  if (locked) {
    document.documentElement.setAttribute("data-locked", "");
  } else {
    document.documentElement.removeAttribute("data-locked");
  }
}

function LockScreen({
  userId,
  config,
  onUnlock,
}: {
  userId: string;
  config: LockConfig;
  onUnlock: () => void;
}) {
  const t = useTranslations("settings.lock.screen");
  const [pin, setPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    dialogRef.current?.querySelector<HTMLElement>("input, button")?.focus();
  }, []);

  async function signOut() {
    writeConfig(userId, null);
    clearSession(userId);
    await authClient.signOut().catch(() => {});
    window.location.assign("/connexion");
  }

  async function submitPin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    try {
      if (await checkPin(config, pin)) {
        writeAttempts(userId, 0);
        onUnlock();
        return;
      }
      const attempts = readAttempts(userId) + 1;
      writeAttempts(userId, attempts);
      setPin("");
      if (attempts >= PIN_ATTEMPTS) {
        await signOut();
        return;
      }
      setError(t("wrongPin", { left: PIN_ATTEMPTS - attempts }));
    } finally {
      setBusy(false);
    }
  }

  async function unlockWithPasskey() {
    setBusy(true);
    setError(null);
    try {
      if (await verifyWithPasskey(config.credentialIds ?? [])) {
        onUnlock();
      } else {
        setError(t("passkeyFailed"));
      }
    } catch {
      setError(t("passkeyFailed"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      ref={dialogRef}
      role="dialog"
      aria-modal="true"
      aria-labelledby="lock-title"
      className="fixed inset-0 z-[100] grid place-items-center bg-ink/95 px-4 backdrop-blur-xl"
    >
      <div className="flex w-full max-w-sm flex-col items-center gap-6 text-center">
        <span className="grid size-16 place-items-center rounded-full bg-paper/10">
          <LockKeyhole className="size-7 text-volt" aria-hidden="true" />
        </span>
        <div className="flex flex-col gap-2">
          <h2 id="lock-title" className="font-display font-semibold text-3xl tracking-tight">
            {t("title")}
          </h2>
          <p className="text-paper/70">{t("lead")}</p>
        </div>
        {config.method === "passkey" ? (
          <Button
            size="lg"
            block
            loading={busy}
            leadingIcon={<Fingerprint className="size-5" aria-hidden="true" />}
            onClick={() => void unlockWithPasskey()}
          >
            {t("passkey")}
          </Button>
        ) : (
          <form onSubmit={(event) => void submitPin(event)} className="flex w-full flex-col gap-4 text-left">
            <TextField
              label={t("pin")}
              type="password"
              inputMode="numeric"
              autoComplete="off"
              maxLength={6}
              value={pin}
              onChange={(event) => setPin(event.target.value.replace(/\D/g, ""))}
              error={error}
            />
            <Button type="submit" size="lg" block loading={busy} disabled={pin.length < 4}>
              {t("unlock")}
            </Button>
          </form>
        )}
        {config.method === "passkey" && error ? (
          <p role="alert" className="text-danger text-sm">
            {error}
          </p>
        ) : null}
        <div className="flex flex-col gap-1">
          <Button variant="link" onClick={() => void signOut()}>
            {t("forgot")}
          </Button>
          <p className="text-paper/50 text-xs">{t("forgotHelp")}</p>
        </div>
      </div>
    </div>
  );
}

/**
 * SAF-13: locks the signed-in app on this device. The early inline script
 * (see `earlyLockScript`) hides the content before the first paint; this
 * component shows the lock screen and keeps the tab's activity up to date.
 */
export function AppLock({ userId }: { userId: string }) {
  const [config, setConfig] = useState<LockConfig | null>(null);
  const [locked, setLocked] = useState(false);

  const evaluate = useCallback(() => {
    const current = readConfig(userId);
    setConfig(current);
    const lock = shouldLock(current, readSession(userId), Date.now());
    setLocked(lock);
    setLockedAttribute(lock);
    if (!lock) markActive(userId);
  }, [userId]);

  useEffect(() => {
    evaluate();
    const onChange = () => {
      // Turning the lock on from the settings must not lock the person out right away.
      markActive(userId);
      evaluate();
    };
    window.addEventListener(LOCK_CHANGED, onChange);
    return () => window.removeEventListener(LOCK_CHANGED, onChange);
  }, [evaluate, userId]);

  useEffect(() => {
    if (!config || locked) return;
    const onVisibility = () => {
      if (document.visibilityState === "hidden") {
        markActive(userId);
      } else {
        evaluate();
      }
    };
    const heartbeat = window.setInterval(() => {
      if (document.visibilityState === "visible") markActive(userId);
    }, HEARTBEAT_MS);
    const onLeave = () => markActive(userId);
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pageshow", evaluate);
    window.addEventListener("pagehide", onLeave);
    return () => {
      window.clearInterval(heartbeat);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pageshow", evaluate);
      window.removeEventListener("pagehide", onLeave);
    };
  }, [config, locked, evaluate, userId]);

  if (!config || !locked) {
    return null;
  }
  return (
    <LockScreen
      userId={userId}
      config={config}
      onUnlock={() => {
        markActive(userId);
        setLocked(false);
        setLockedAttribute(false);
      }}
    />
  );
}
