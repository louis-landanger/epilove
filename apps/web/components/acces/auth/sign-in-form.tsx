"use client";

import { authClient } from "@epilove/auth/client";
import { parseSchoolEmail } from "@epilove/core";
import { Button, OtpInput, TextField, useToast } from "@epilove/ui";
import { ArrowLeft, Fingerprint, Mail } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { type FormEvent, useEffect, useState } from "react";
import { ONBOARDING_PATH, safeNextPath } from "@/lib/routes";

type Step = { name: "email" } | { name: "code"; email: string };
type ErrorKey =
  | "invalid_format"
  | "domain_not_allowed"
  | "wrong_code"
  | "too_many_attempts"
  | "too_many_codes"
  | "passkey_failed"
  | "blocked"
  | "generic";

const RESEND_DELAY_SECONDS = 30;

function errorKeyFor(error: { code?: string | undefined; status?: number | undefined } | null): ErrorKey {
  switch (error?.code) {
    case "SCHOOL_EMAIL_REQUIRED":
      return "domain_not_allowed";
    case "INVALID_EMAIL":
    case "EMAIL_NOT_CANONICAL":
      return "invalid_format";
    case "OTP_EMAIL_QUOTA":
      return "too_many_codes";
    case "SIGNUP_BLOCKED":
      return "blocked";
    case "TOO_MANY_ATTEMPTS":
      return "too_many_attempts";
    case "INVALID_OTP":
    case "OTP_EXPIRED":
      return "wrong_code";
    default:
      return error?.status === 429 ? "too_many_codes" : "generic";
  }
}

export function SignInForm({ next }: { next: string | null }) {
  const t = useTranslations("auth");
  const router = useRouter();
  const toast = useToast();
  const [step, setStep] = useState<Step>({ name: "email" });
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState<ErrorKey | null>(null);
  const [pending, setPending] = useState(false);
  const [cooldown, setCooldown] = useState(0);

  useEffect(() => {
    if (cooldown <= 0) {
      return;
    }
    const timer = setTimeout(() => setCooldown((value) => value - 1), 1000);
    return () => clearTimeout(timer);
  }, [cooldown]);

  async function sendCode(address: string) {
    const { error: sendError } = await authClient.emailOtp.sendVerificationOtp({
      email: address,
      type: "sign-in",
    });
    if (sendError) {
      setError(errorKeyFor(sendError));
      return false;
    }
    setCooldown(RESEND_DELAY_SECONDS);
    return true;
  }

  async function submitEmail(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const parsed = parseSchoolEmail(email);
    if (!parsed.ok) {
      setError(parsed.reason);
      return;
    }
    setError(null);
    setPending(true);
    const sent = await sendCode(parsed.canonicalEmail);
    setPending(false);
    if (sent) {
      setCode("");
      setStep({ name: "code", email: parsed.canonicalEmail });
    }
  }

  async function verify(value: string) {
    if (step.name !== "code" || value.length !== 6 || pending) {
      return;
    }
    setPending(true);
    setError(null);
    const { error: signInError } = await authClient.signIn.emailOtp({ email: step.email, otp: value });
    if (signInError) {
      setPending(false);
      setCode("");
      setError(errorKeyFor(signInError));
      return;
    }
    router.replace(safeNextPath(next) ?? ONBOARDING_PATH);
    router.refresh();
  }

  async function signInWithPasskey() {
    setError(null);
    const result = await authClient.signIn.passkey();
    if (result?.error) {
      setError("passkey_failed");
      return;
    }
    router.replace(safeNextPath(next) ?? ONBOARDING_PATH);
    router.refresh();
  }

  if (step.name === "code") {
    return (
      <div className="flex flex-col gap-6">
        <button
          type="button"
          onClick={() => {
            setStep({ name: "email" });
            setError(null);
          }}
          className="inline-flex w-fit items-center gap-2 text-paper/65 text-sm hover:text-paper"
        >
          <ArrowLeft className="size-4" aria-hidden="true" />
          {t("changeEmail")}
        </button>
        <div className="flex flex-col gap-2">
          <h2 className="font-display font-semibold text-3xl tracking-tight">{t("codeTitle")}</h2>
          <p className="text-paper/70">{t("codeLead", { email: step.email })}</p>
        </div>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void verify(code);
          }}
          className="flex flex-col gap-6"
        >
          <OtpInput
            label={t("codeLabel")}
            value={code}
            onChange={setCode}
            onComplete={(value) => void verify(value)}
            error={error ? t(`errors.${error}`) : null}
            description={t("codeHelp")}
            disabled={pending}
          />
          <Button type="submit" size="lg" block loading={pending} disabled={code.length !== 6}>
            {t("verify")}
          </Button>
        </form>
        <Button
          variant="ghost"
          disabled={cooldown > 0 || pending}
          onClick={async () => {
            if (await sendCode(step.email)) {
              toast.success(t("codeResent"));
            }
          }}
        >
          {cooldown > 0 ? t("resendIn", { seconds: cooldown }) : t("resend")}
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <form onSubmit={submitEmail} className="flex flex-col gap-5" noValidate>
        <TextField
          label={t("emailLabel")}
          type="email"
          name="email"
          inputMode="email"
          autoComplete="email"
          autoCapitalize="none"
          spellCheck={false}
          placeholder={t("emailPlaceholder")}
          description={t("emailHelp")}
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          error={error && error !== "passkey_failed" ? t(`errors.${error}`) : null}
          required
        />
        <Button
          type="submit"
          size="lg"
          block
          loading={pending}
          leadingIcon={<Mail className="size-5" aria-hidden="true" />}
        >
          {t("sendCode")}
        </Button>
      </form>
      <div
        className="flex items-center gap-3 text-paper/40 text-xs uppercase tracking-[0.2em]"
        aria-hidden="true"
      >
        <span className="h-px flex-1 bg-paper/10" />
        {t("or")}
        <span className="h-px flex-1 bg-paper/10" />
      </div>
      <div className="flex flex-col gap-2">
        <Button
          variant="outline"
          block
          onClick={() => void signInWithPasskey()}
          leadingIcon={<Fingerprint className="size-5" aria-hidden="true" />}
        >
          {t("passkey")}
        </Button>
        <p className="text-center text-paper/55 text-sm">{t("passkeyHelp")}</p>
        {error === "passkey_failed" ? (
          <p role="alert" className="text-center text-danger text-sm">
            {t("errors.passkey_failed")}
          </p>
        ) : null}
      </div>
    </div>
  );
}
