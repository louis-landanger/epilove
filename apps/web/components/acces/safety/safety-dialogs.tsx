"use client";

import { REPORT_REASONS, type ReportContext, type ReportReason } from "@epilove/core";
import { Button, CheckboxField, Dialog, RadioGroupField, TextAreaField, useToast } from "@epilove/ui";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { api, errorCode } from "../api-client";

export interface SafetyTarget {
  readonly userId: string;
  readonly firstName: string;
}

export interface BlockDialogProps {
  readonly target: SafetyTarget;
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  /** Called once the block is saved (leave the profile, close the chat…). */
  readonly onBlocked?: () => void;
}

/** SAF-01: confirmation, then an immediate, mutual and silent block. */
export function BlockDialog({ target, open, onOpenChange, onBlocked }: BlockDialogProps) {
  const t = useTranslations("safety.block");
  const tSettings = useTranslations("settings");
  const toast = useToast();
  const [pending, setPending] = useState(false);

  async function confirm() {
    setPending(true);
    try {
      await api().safety.block({ userId: target.userId });
      toast.success(t("done", { name: target.firstName }));
      onOpenChange(false);
      onBlocked?.();
    } catch {
      toast.error(tSettings("error"));
    } finally {
      setPending(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={t("title", { name: target.firstName })}
      description={t("body", { name: target.firstName })}
      footer={
        <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            {tSettings("data.cancel")}
          </Button>
          <Button variant="danger" loading={pending} onClick={() => void confirm()}>
            {t("confirm")}
          </Button>
        </div>
      }
    />
  );
}

export interface ReportDialogProps {
  readonly target: SafetyTarget;
  readonly context: ReportContext;
  /** Id of the reported photo, message or event. */
  readonly contextRef?: string;
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly onReported?: (result: { reportId: string; blocked: boolean }) => void;
}

/** SAF-02: structured reasons, optional encrypted details, block offered and ticked by default. */
export function ReportDialog({
  target,
  context,
  contextRef,
  open,
  onOpenChange,
  onReported,
}: ReportDialogProps) {
  const t = useTranslations("safety.report");
  const toast = useToast();
  const [reason, setReason] = useState<ReportReason | null>(null);
  const [details, setDetails] = useState("");
  const [alsoBlock, setAlsoBlock] = useState(true);
  const [pending, setPending] = useState(false);

  async function submit() {
    if (!reason) {
      return;
    }
    setPending(true);
    try {
      const { reportId } = await api().safety.report({
        reportedId: target.userId,
        context,
        contextRef,
        reason,
        details: details.trim() || undefined,
        alsoBlock,
      });
      toast.success(t("sent"));
      onOpenChange(false);
      onReported?.({ reportId, blocked: alsoBlock });
      setReason(null);
      setDetails("");
    } catch (error) {
      toast.error(errorCode(error) === "RATE_LIMITED" ? t("rateLimited") : t("error"));
    } finally {
      setPending(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={t("title", { name: target.firstName })}
      description={t("lead")}
      className="sm:w-[min(36rem,calc(100vw-2rem))]"
      footer={
        <div className="flex flex-col gap-3">
          <p className="text-paper/60 text-xs">{t("urgent")}</p>
          <Button block loading={pending} disabled={!reason} onClick={() => void submit()}>
            {t("submit")}
          </Button>
        </div>
      }
    >
      <div className="flex flex-col gap-5">
        <RadioGroupField<ReportReason>
          label={t("reasonLabel")}
          options={REPORT_REASONS.map((value) => ({ value, label: t(`reasons.${value}`) }))}
          value={reason}
          onChange={setReason}
        />
        <TextAreaField
          label={t("detailsLabel")}
          description={t("detailsHelp")}
          maxLength={2000}
          rows={3}
          value={details}
          onChange={(event) => setDetails(event.target.value)}
        />
        <CheckboxField label={t("alsoBlock")} checked={alsoBlock} onCheckedChange={setAlsoBlock} />
      </div>
    </Dialog>
  );
}
