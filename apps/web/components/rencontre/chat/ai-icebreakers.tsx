"use client";

import { ORPCError } from "@orpc/client";
import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";
import { api } from "@/lib/rencontre/api.client";
import { Sheet } from "../ui/sheet";

type State =
  | { readonly kind: "idle" }
  | { readonly kind: "loading" }
  | { readonly kind: "done"; readonly suggestions: readonly string[] }
  | { readonly kind: "notice"; readonly key: "nothing" | "quota" | "unavailable" | "error" };

/**
 * AI conversation starters (CHAT-04), under the classic ones. Asks for
 * consent first, in plain words; a suggestion only fills the composer, the
 * member edits and sends it themselves.
 */
export function AiIcebreakers({
  matchId,
  consented: initiallyConsented,
  onPick,
}: {
  matchId: string;
  consented: boolean;
  onPick: (text: string) => void;
}) {
  const t = useTranslations("chat.ai");
  const locale = useLocale() === "en" ? "en" : "fr";
  const [consented, setConsented] = useState(initiallyConsented);
  const [asking, setAsking] = useState(false);
  const [state, setState] = useState<State>({ kind: "idle" });

  const generate = async () => {
    setState({ kind: "loading" });
    try {
      const result = await api.messaging.aiIcebreakers({ matchId, locale });
      setState(
        result.status === "ok"
          ? { kind: "done", suggestions: result.suggestions }
          : { kind: "notice", key: "nothing" },
      );
    } catch (error) {
      const reason = error instanceof ORPCError ? error.message : "";
      if (reason === "consent_required") {
        setConsented(false);
        setState({ kind: "idle" });
        setAsking(true);
        return;
      }
      setState({
        kind: "notice",
        key: reason === "quota_exceeded" ? "quota" : reason === "ai_unavailable" ? "unavailable" : "error",
      });
    }
  };

  const accept = async () => {
    try {
      await api.messaging.setAiConsent({ consent: true });
      setConsented(true);
      setAsking(false);
      await generate();
    } catch {
      setAsking(false);
      setState({ kind: "notice", key: "error" });
    }
  };

  return (
    <div className="flex flex-col gap-2 border-paper/10 border-t pt-3">
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          disabled={state.kind === "loading"}
          onClick={() => (consented ? void generate() : setAsking(true))}
          className="rounded-full border border-plasma/50 px-3 py-1.5 font-semibold text-sm hover:bg-plasma/10 disabled:opacity-60"
        >
          {state.kind === "done" ? t("again") : t("button")}
        </button>
        <span className="text-paper/60 text-xs">{t("hint")}</span>
      </div>
      <div aria-live="polite" className="flex flex-col gap-2">
        {state.kind === "loading" && <p className="text-paper/70 text-sm">{t("loading")}</p>}
        {state.kind === "notice" && <p className="text-paper/70 text-sm">{t(`notices.${state.key}`)}</p>}
        {state.kind === "done" && (
          <>
            <p className="text-paper/60 text-xs">{t("label")}</p>
            <ul className="flex flex-col gap-2">
              {state.suggestions.map((text) => (
                <li key={text}>
                  <button
                    type="button"
                    onClick={() => onPick(text)}
                    className="w-full rounded-2xl border border-plasma/30 px-3 py-2 text-left text-sm hover:bg-plasma/10"
                  >
                    {text}
                  </button>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>

      <Sheet open={asking} onClose={() => setAsking(false)} labelledBy="ai-consent-title">
        <h2 id="ai-consent-title" className="font-display font-semibold text-xl">
          {t("consent.title")}
        </h2>
        <ul className="flex list-disc flex-col gap-2 pl-5 text-paper/80 text-sm">
          <li>{t("consent.what")}</li>
          <li>{t("consent.other")}</li>
          <li>{t("consent.where")}</li>
          <li>{t("consent.never")}</li>
        </ul>
        <p className="text-paper/60 text-xs">{t("consent.withdraw")}</p>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => void accept()}
            className="rounded-full bg-plasma px-5 py-3 font-semibold text-ink"
          >
            {t("consent.accept")}
          </button>
          <button
            type="button"
            onClick={() => setAsking(false)}
            className="rounded-full border border-paper/25 px-5 py-3 font-semibold"
          >
            {t("consent.decline")}
          </button>
        </div>
      </Sheet>
    </div>
  );
}
