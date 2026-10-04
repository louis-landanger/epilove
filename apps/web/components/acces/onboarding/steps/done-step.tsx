"use client";

import { authClient } from "@atomes/auth/client";
import { ageOn, SCHOOLS, type SchoolSlug } from "@atomes/core";
import { Badge, Button, SchoolChip, useToast } from "@atomes/ui";
import { Fingerprint, Sparkles } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { api, errorCode } from "@/lib/api-client";
import { HOME_PATH } from "@/lib/routes";
import { StepShell } from "../step-shell";
import type { StepProps } from "../types";

/** Recap, activation, then the passkey offer (ONB-03). */
export function DoneStep({ state, focusTitle }: StepProps) {
  const t = useTranslations("onboarding");
  const router = useRouter();
  const toast = useToast();
  const [phase, setPhase] = useState<"recap" | "passkey">("recap");
  const [pending, setPending] = useState(false);
  const [passkeySupported, setPasskeySupported] = useState(false);
  const { answers } = state;
  const school = SCHOOLS.find((item) => item.slug === state.schoolSlug);

  useEffect(() => {
    setPasskeySupported(typeof window !== "undefined" && "PublicKeyCredential" in window);
  }, []);

  function enter() {
    router.replace(HOME_PATH);
    router.refresh();
  }

  async function activate() {
    setPending(true);
    try {
      await api.onboarding.complete();
      if (passkeySupported) {
        setPhase("passkey");
      } else {
        enter();
      }
    } catch (error) {
      toast.error(errorCode(error) === "INCOMPLETE" ? t("done.incomplete") : t("errors.generic"));
    } finally {
      setPending(false);
    }
  }

  async function addPasskey() {
    setPending(true);
    const result = await authClient.passkey.addPasskey();
    setPending(false);
    if (result?.error) {
      toast.error(t("done.passkeyFailed"));
      return;
    }
    toast.success(t("done.passkeyAdded"));
    enter();
  }

  if (phase === "passkey") {
    return (
      <StepShell
        title={t("done.passkeyTitle")}
        lead={t("done.passkeyBody")}
        focusTitle
        actions={
          <>
            <Button
              size="lg"
              block
              loading={pending}
              onClick={() => void addPasskey()}
              leadingIcon={<Fingerprint className="size-5" aria-hidden="true" />}
            >
              {t("done.passkeyAdd")}
            </Button>
            <Button variant="ghost" block disabled={pending} onClick={enter}>
              {t("done.passkeySkip")}
            </Button>
          </>
        }
      >
        <div className="grid flex-1 place-items-center py-8">
          <div className="grid size-32 place-items-center rounded-full border border-paper/15 bg-ink2">
            <Fingerprint className="size-14 text-volt" aria-hidden="true" strokeWidth={1.25} />
          </div>
        </div>
      </StepShell>
    );
  }

  return (
    <StepShell
      title={t("done.title", { name: answers.firstName ?? "" })}
      lead={t("done.lead")}
      focusTitle={focusTitle}
      onSubmit={() => void activate()}
      actions={
        <Button
          type="submit"
          size="lg"
          block
          loading={pending}
          leadingIcon={<Sparkles className="size-5" aria-hidden="true" />}
        >
          {t("done.finish")}
        </Button>
      }
    >
      <section
        aria-label={t("done.summary")}
        className="relative overflow-hidden rounded-[2rem] border border-paper/10 bg-gradient-to-br from-plasma/20 via-ink2 to-volt/10 p-6"
      >
        <p className="font-display font-semibold text-4xl tracking-tight">
          {answers.firstName}
          {answers.birthDate ? (
            <span className="ml-3 font-normal text-paper/70">{ageOn(answers.birthDate, state.today)}</span>
          ) : null}
        </p>
        <div className="mt-4 flex flex-wrap items-center gap-2">
          {school ? <SchoolChip school={school.slug as SchoolSlug} name={school.name} /> : null}
          {answers.graduationYear ? <Badge>{answers.graduationYear}</Badge> : null}
          {answers.modes.map((mode) => (
            <Badge key={mode}>{t(`done.modes.${mode}`)}</Badge>
          ))}
        </div>
        <p className="mt-6 text-paper/65 text-sm">{t("done.photosPending", { count: state.photos })}</p>
      </section>
    </StepShell>
  );
}
