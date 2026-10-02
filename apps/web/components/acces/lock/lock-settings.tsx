"use client";

import { authClient } from "@epilove/auth/client";
import { Button, RadioGroupField, SwitchField, TextField, useToast } from "@epilove/ui";
import { useTranslations } from "next-intl";
import { type FormEvent, useEffect, useState } from "react";
import { isPin, LOCK_TIMEOUTS, type LockMethod, pinConfig } from "./lock-config";
import { readConfig, writeConfig } from "./lock-store";

type Timeout = `${(typeof LOCK_TIMEOUTS)[number]}`;

/** SAF-13 settings: on this device only, nothing is sent to the server. */
export function LockSettings({ userId }: { userId: string }) {
  const t = useTranslations("settings.lock");
  const toast = useToast();
  const [enabled, setEnabled] = useState(false);
  const [editing, setEditing] = useState(false);
  const [method, setMethod] = useState<LockMethod>("pin");
  const [timeout, setTimeoutValue] = useState<Timeout>("1");
  const [pin, setPin] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [credentialIds, setCredentialIds] = useState<string[]>([]);

  useEffect(() => {
    const config = readConfig(userId);
    setEnabled(config !== null);
    if (config) {
      setMethod(config.method);
      setTimeoutValue(String(config.timeoutMinutes) as Timeout);
    }
    void authClient.passkey
      .listUserPasskeys()
      .then((result) => {
        const ids = ((result.data ?? []) as Array<{ credentialID?: string }>).flatMap((passkey) =>
          passkey.credentialID ? [passkey.credentialID] : [],
        );
        setCredentialIds(ids);
      })
      .catch(() => {});
  }, [userId]);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const timeoutMinutes = Number(timeout);
    if (method === "pin") {
      if (!isPin(pin)) {
        setError(t("pinInvalid"));
        return;
      }
      if (pin !== confirmation) {
        setError(t("pinMismatch"));
        return;
      }
      writeConfig(userId, await pinConfig(pin, timeoutMinutes));
    } else {
      writeConfig(userId, { version: 1, method: "passkey", timeoutMinutes, credentialIds });
    }
    setPin("");
    setConfirmation("");
    setError(null);
    setEnabled(true);
    setEditing(false);
    toast.success(t("enabled"));
  }

  return (
    <div className="flex flex-col gap-5">
      <SwitchField
        label={t("toggle")}
        description={t("toggleHelp")}
        checked={enabled || editing}
        onCheckedChange={(checked) => {
          if (checked) {
            setEditing(true);
          } else {
            writeConfig(userId, null);
            setEnabled(false);
            setEditing(false);
            toast.success(t("disabled"));
          }
        }}
      />
      {editing ? (
        <form onSubmit={(event) => void save(event)} className="flex flex-col gap-5" noValidate>
          <RadioGroupField<LockMethod>
            label={t("method")}
            value={method}
            onChange={setMethod}
            options={[
              {
                value: "passkey",
                label: t("methods.passkey.label"),
                description: credentialIds.length > 0 ? t("methods.passkey.help") : t("noPasskey"),
                disabled: credentialIds.length === 0,
              },
              { value: "pin", label: t("methods.pin.label"), description: t("methods.pin.help") },
            ]}
          />
          {method === "pin" ? (
            <div className="grid gap-4 sm:grid-cols-2">
              <TextField
                label={t("pin")}
                type="password"
                inputMode="numeric"
                autoComplete="off"
                maxLength={6}
                value={pin}
                onChange={(event) => setPin(event.target.value.replace(/\D/g, ""))}
              />
              <TextField
                label={t("pinConfirm")}
                type="password"
                inputMode="numeric"
                autoComplete="off"
                maxLength={6}
                value={confirmation}
                onChange={(event) => setConfirmation(event.target.value.replace(/\D/g, ""))}
                error={error}
              />
            </div>
          ) : null}
          <RadioGroupField<Timeout>
            label={t("timeout")}
            value={timeout}
            onChange={setTimeoutValue}
            options={LOCK_TIMEOUTS.map((minutes) => ({
              value: String(minutes) as Timeout,
              label: t(`timeouts.${minutes}`),
            }))}
          />
          <Button type="submit" className="self-start">
            {t("save")}
          </Button>
        </form>
      ) : null}
    </div>
  );
}
