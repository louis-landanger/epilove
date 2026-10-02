"use client";

import { REPORT_REASONS, type ReportReason } from "@epilove/core";
import { ORPCError } from "@orpc/client";
import { useTranslations } from "next-intl";
import { useId, useState } from "react";
import { api } from "@/lib/rencontre/api.client";
import { Sheet } from "../ui/sheet";

type Panel = "menu" | "report" | "block" | "unmatch" | null;

/**
 * Safety actions available from a profile or a conversation (SAF-01, SAF-02,
 * CHAT-13): unmatch, block and report, in two gestures. Block and report go
 * through the `safety` contract implemented by session A; until then the API
 * answers NOT_IMPLEMENTED and a sober message says so.
 */
export function SafetyMenu({
  userId,
  name,
  matchId,
  context,
  contextRef,
  onDone,
}: {
  userId: string;
  name: string;
  matchId: string | null;
  context: "profile" | "message";
  contextRef?: string;
  onDone: (action: "blocked" | "reported" | "unmatched") => void;
}) {
  const t = useTranslations("matches");
  const titleId = useId();
  const [panel, setPanel] = useState<Panel>(null);
  const [reason, setReason] = useState<ReportReason | null>(null);
  const [details, setDetails] = useState("");
  const [alsoBlock, setAlsoBlock] = useState(true);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const close = () => {
    setPanel(null);
    setError(null);
  };

  const run = async (action: () => Promise<unknown>, done: "blocked" | "reported" | "unmatched") => {
    setPending(true);
    setError(null);
    try {
      await action();
      close();
      onDone(done);
    } catch (cause) {
      setError(
        cause instanceof ORPCError && cause.code === "NOT_IMPLEMENTED"
          ? t("safety.notAvailable")
          : t("safety.error"),
      );
    } finally {
      setPending(false);
    }
  };

  return (
    <>
      <button
        type="button"
        aria-label={t("profile.more")}
        onClick={() => setPanel("menu")}
        className="grid size-11 place-items-center rounded-full border border-paper/20 bg-ink/60 backdrop-blur-md"
      >
        <svg viewBox="0 0 24 24" className="size-5" fill="currentColor" aria-hidden="true">
          <circle cx="5" cy="12" r="2" />
          <circle cx="12" cy="12" r="2" />
          <circle cx="19" cy="12" r="2" />
        </svg>
      </button>

      <Sheet open={panel !== null} onClose={close} labelledBy={titleId}>
        {panel === "menu" && (
          <>
            <h2 id={titleId} className="font-display font-semibold text-xl">
              {name}
            </h2>
            <div className="flex flex-col gap-2">
              {matchId && (
                <button
                  type="button"
                  onClick={() => setPanel("unmatch")}
                  className="rounded-2xl border border-paper/15 px-4 py-3 text-left"
                >
                  {t("profile.unmatch")}
                </button>
              )}
              <button
                type="button"
                onClick={() => setPanel("block")}
                className="rounded-2xl border border-paper/15 px-4 py-3 text-left"
              >
                {t("profile.block")}
              </button>
              <button
                type="button"
                onClick={() => setPanel("report")}
                className="rounded-2xl border border-plasma/40 px-4 py-3 text-left text-plasma"
              >
                {t("profile.report")}
              </button>
            </div>
            <p className="text-paper/50 text-xs">{t("safety.help")}</p>
          </>
        )}

        {(panel === "block" || panel === "unmatch") && (
          <>
            <h2 id={titleId} className="font-display font-semibold text-xl">
              {panel === "block" ? t("profile.block") : t("profile.unmatch")}
            </h2>
            <p className="text-paper/80">
              {panel === "block"
                ? t("profile.blockConfirm", { name })
                : t("profile.unmatchConfirm", { name })}
            </p>
            {error && (
              <p role="alert" className="text-plasma text-sm">
                {error}
              </p>
            )}
            <div className="flex gap-3">
              <button type="button" onClick={close} className="rounded-full border border-paper/20 px-5 py-3">
                {t("safety.cancel")}
              </button>
              <button
                type="button"
                disabled={pending}
                onClick={() =>
                  panel === "block"
                    ? run(() => api.safety.block({ userId }), "blocked")
                    : run(() => api.matches.unmatch({ matchId: matchId ?? "" }), "unmatched")
                }
                className="ml-auto rounded-full bg-paper px-6 py-3 font-semibold text-ink disabled:opacity-50"
              >
                {t("safety.confirm")}
              </button>
            </div>
          </>
        )}

        {panel === "report" && (
          <form
            className="flex flex-col gap-4"
            onSubmit={(event) => {
              event.preventDefault();
              if (!reason) {
                return;
              }
              void run(
                () =>
                  api.safety.report({
                    reportedId: userId,
                    context,
                    contextRef,
                    reason,
                    details: details.trim() || undefined,
                    alsoBlock,
                  }),
                "reported",
              );
            }}
          >
            <h2 id={titleId} className="font-display font-semibold text-xl">
              {t("safety.reportTitle", { name })}
            </h2>
            <p className="text-paper/70 text-sm">{t("safety.reportLead")}</p>
            <fieldset className="flex flex-col gap-2">
              <legend className="mb-2 font-semibold text-sm">{t("safety.reason")}</legend>
              {REPORT_REASONS.map((value) => (
                <label
                  key={value}
                  className={`flex cursor-pointer items-center gap-3 rounded-2xl border px-4 py-3 text-sm has-focus-visible:outline-2 has-focus-visible:outline-volt ${
                    reason === value ? "border-plasma bg-plasma/10" : "border-paper/15"
                  }`}
                >
                  <input
                    type="radio"
                    name="report-reason"
                    className="sr-only"
                    checked={reason === value}
                    onChange={() => setReason(value)}
                  />
                  {t(`safety.reasons.${value}`)}
                </label>
              ))}
            </fieldset>
            <label className="flex flex-col gap-2 text-sm">
              {t("safety.details")}
              <textarea
                value={details}
                maxLength={2000}
                rows={3}
                onChange={(event) => setDetails(event.target.value)}
                className="resize-none rounded-2xl border border-paper/20 bg-transparent p-3"
              />
            </label>
            <label className="flex items-center gap-3 text-sm">
              <input
                type="checkbox"
                checked={alsoBlock}
                onChange={(event) => setAlsoBlock(event.target.checked)}
                className="size-5"
              />
              {t("safety.alsoBlock")}
            </label>
            {error && (
              <p role="alert" className="text-plasma text-sm">
                {error}
              </p>
            )}
            <p className="text-paper/50 text-xs">{t("safety.help")}</p>
            <div className="flex gap-3">
              <button type="button" onClick={close} className="rounded-full border border-paper/20 px-5 py-3">
                {t("safety.cancel")}
              </button>
              <button
                type="submit"
                disabled={!reason || pending}
                className="ml-auto rounded-full bg-plasma px-6 py-3 font-semibold text-ink disabled:opacity-40"
              >
                {t("safety.send")}
              </button>
            </div>
          </form>
        )}
      </Sheet>
    </>
  );
}
