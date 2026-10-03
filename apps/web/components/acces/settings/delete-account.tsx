"use client";

import { authClient } from "@epilove/auth/client";
import { Button, Dialog, TextField, useToast } from "@epilove/ui";
import type { Route } from "next";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { api } from "@/lib/api-client";

/** Self-service, immediate deletion (SAF-14), confirmed by typing a word. */
export function DeleteAccount() {
  const t = useTranslations("settings.data");
  const tSettings = useTranslations("settings");
  const toast = useToast();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState("");
  const [pending, setPending] = useState(false);
  const confirmed = typed.trim().toUpperCase() === t("confirmWord");

  async function remove() {
    setPending(true);
    try {
      await api.account.delete({ confirm: true });
      await authClient.signOut().catch(() => undefined);
      router.replace("/compte/supprime" as Route);
    } catch {
      toast.error(tSettings("error"));
      setPending(false);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="text-paper/70 text-sm">{t("deleteHelp")}</p>
      <Button
        variant="outline"
        className="self-start border-danger/50 text-danger"
        onClick={() => setOpen(true)}
      >
        {t("delete")}
      </Button>
      <Dialog
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          if (!next) setTyped("");
        }}
        title={t("dialogTitle")}
        description={t("dialogBody")}
        closeLabel={t("cancel")}
        footer={
          <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
            <Button variant="ghost" onClick={() => setOpen(false)}>
              {t("cancel")}
            </Button>
            <Button variant="danger" loading={pending} disabled={!confirmed} onClick={() => void remove()}>
              {t("confirm")}
            </Button>
          </div>
        }
      >
        <TextField
          label={t("confirmLabel")}
          autoComplete="off"
          autoCapitalize="characters"
          value={typed}
          onChange={(event) => setTyped(event.target.value)}
        />
      </Dialog>
    </div>
  );
}
