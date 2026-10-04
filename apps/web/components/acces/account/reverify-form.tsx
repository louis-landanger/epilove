"use client";

import { authClient } from "@atomes/auth/client";
import { Button, OtpInput } from "@atomes/ui";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { HOME_PATH } from "@/lib/routes";

/** A fresh code sign-in on the school address is the yearly re-verification (ONB-09). */
export function ReverifyForm({ email }: { email: string }) {
  const t = useTranslations("settings.reverify");
  const router = useRouter();
  const [sent, setSent] = useState(false);
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [state, setState] = useState<"idle" | "pending" | "done">("idle");

  async function send() {
    setState("pending");
    await authClient.emailOtp.sendVerificationOtp({ email, type: "sign-in" });
    setSent(true);
    setState("idle");
  }

  async function verify(value: string) {
    if (value.length !== 6 || state === "pending") return;
    setState("pending");
    const { error: signInError } = await authClient.signIn.emailOtp({ email, otp: value });
    if (signInError) {
      setError(t("error"));
      setCode("");
      setState("idle");
      return;
    }
    setState("done");
    window.setTimeout(() => {
      router.replace(HOME_PATH);
      router.refresh();
    }, 1200);
  }

  if (state === "done") {
    return (
      <p role="status" className="text-lg text-volt">
        {t("done")}
      </p>
    );
  }
  if (!sent) {
    return (
      <Button size="lg" className="self-start" loading={state === "pending"} onClick={() => void send()}>
        {t("send")}
      </Button>
    );
  }
  return (
    <form
      className="flex flex-col gap-5"
      onSubmit={(event) => {
        event.preventDefault();
        void verify(code);
      }}
    >
      <OtpInput
        label={t("code")}
        value={code}
        onChange={setCode}
        onComplete={(value) => void verify(value)}
        error={error}
      />
      <Button
        type="submit"
        size="lg"
        className="self-start"
        loading={state === "pending"}
        disabled={code.length !== 6}
      >
        {t("verify")}
      </Button>
    </form>
  );
}
