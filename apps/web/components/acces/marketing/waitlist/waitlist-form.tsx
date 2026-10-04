"use client";

import { type Locale, parseSchoolEmail } from "@atomes/core";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { useActionState, useEffect, useId, useRef, useState } from "react";
import { publicHref } from "@/i18n/paths";
import { refreshWaitlistStats } from "../stats-store";
import { joinWaitlistAction } from "./actions";
import { INITIAL_WAITLIST_STATE, type WaitlistError, type WaitlistFormState } from "./state";

/** Loose sanity check only: the Server Function validates the exact referral code format. */
const REFERRAL_LIKE = /^[0-9a-z]{6,32}$/;

/** Same checks as the server, instantly: format first, then eligible school domains. */
function validate(email: string): WaitlistError | null {
  if (email.trim() === "") {
    return "required";
  }
  const result = parseSchoolEmail(email);
  return result.ok ? null : result.reason;
}

/**
 * Waiting list form (ONB-01). Works before JavaScript loads (plain form post
 * to the Server Function); once hydrated it validates inline and keeps focus
 * management accessible. The answer is the same whether the address was
 * already registered or not.
 */
export function WaitlistForm() {
  const t = useTranslations("waitlist");
  const locale = useLocale();
  const [state, formAction, pending] = useActionState(joinWaitlistAction, INITIAL_WAITLIST_STATE);
  const [clientError, setClientError] = useState<WaitlistError | null>(null);
  const [touched, setTouched] = useState(false);
  const [referralCode, setReferralCode] = useState<string | null>(null);
  const [dismissed, setDismissed] = useState<WaitlistFormState | null>(null);
  const inputId = useId();
  const errorId = useId();
  const hintId = useId();
  const successRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Referral links look like /?r=<code>: keep the code for the submission.
  useEffect(() => {
    const code = new URLSearchParams(window.location.search).get("r");
    if (code && REFERRAL_LIKE.test(code)) {
      setReferralCode(code);
    }
  }, []);

  useEffect(() => {
    if (state.status === "success") {
      successRef.current?.focus();
      void refreshWaitlistStats();
    } else if (state.status === "error") {
      inputRef.current?.focus();
    }
  }, [state]);

  const serverError = state.status === "error" ? state.error : null;
  const error = touched ? clientError : serverError;
  const errorMessage = error ? t(`errors.${error}`) : null;

  // Rendered by the server too, so the success shows even without JavaScript.
  if (state.status === "success" && dismissed !== state) {
    return (
      <div
        ref={successRef}
        tabIndex={-1}
        role="status"
        className="waitlist-success rounded-[1.75rem] border border-volt/40 bg-volt/10 p-6 sm:p-8"
        data-testid="waitlist-success"
      >
        <p className="font-display font-semibold text-3xl text-paper">{t("success.title")}</p>
        <p className="mt-3 max-w-xl text-paper/85 leading-relaxed">{t("success.body")}</p>
        <button
          type="button"
          onClick={() => {
            setDismissed(state);
            setTouched(false);
            setClientError(null);
            requestAnimationFrame(() => inputRef.current?.focus());
          }}
          className="mt-6 font-mono text-volt text-xs uppercase tracking-[0.18em] underline decoration-volt/40 underline-offset-4 hover:decoration-volt"
        >
          {t("success.again")}
        </button>
      </div>
    );
  }

  return (
    <form
      action={formAction}
      noValidate
      className="waitlist-form"
      onSubmit={(event) => {
        const input = inputRef.current;
        const problem = validate(input?.value ?? "");
        setTouched(true);
        setClientError(problem);
        if (problem) {
          event.preventDefault();
          input?.focus();
        }
      }}
    >
      <label htmlFor={inputId} className="block font-mono text-paper/85 text-xs uppercase tracking-[0.18em]">
        {t("label")}
      </label>
      <div className="mt-3 flex flex-col gap-3 sm:flex-row">
        <input
          ref={inputRef}
          id={inputId}
          name="email"
          type="email"
          inputMode="email"
          autoComplete="email"
          autoCapitalize="none"
          spellCheck={false}
          required
          maxLength={320}
          placeholder={t("placeholder")}
          defaultValue={state.status === "error" ? state.email : undefined}
          aria-invalid={errorMessage ? true : undefined}
          aria-describedby={errorMessage ? `${errorId} ${hintId}` : hintId}
          onBlur={(event) => {
            if (event.currentTarget.value.trim() !== "") {
              setTouched(true);
              setClientError(validate(event.currentTarget.value));
            }
          }}
          onChange={(event) => {
            if (touched) {
              setClientError(validate(event.currentTarget.value));
            }
          }}
          className="waitlist-input min-w-0 flex-1"
        />
        <button type="submit" disabled={pending} data-magnetic className="cta-primary justify-center">
          {pending ? t("submitting") : t("submit")}
        </button>
      </div>
      {referralCode ? <input type="hidden" name="referralCode" value={referralCode} /> : null}
      <p id={errorId} role="alert" className="mt-3 min-h-6 text-[0.95rem] text-[oklch(0.78_0.15_25)]">
        {errorMessage}
      </p>
      <p id={hintId} className="text-paper/70 text-sm">
        {t("hint")}
      </p>
      {referralCode ? <p className="mt-3 text-sm text-volt">{t("referral")}</p> : null}
      <p className="mt-5 max-w-xl text-paper/70 text-xs leading-relaxed">
        {t.rich("privacy", {
          link: (chunks) => (
            <Link
              href={publicHref(locale as Locale, "/legal/confidentialite")}
              className="underline underline-offset-2 hover:text-paper"
            >
              {chunks}
            </Link>
          ),
        })}
      </p>
    </form>
  );
}
