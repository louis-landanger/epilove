"use client";

import { authClient } from "@epilove/auth/client";
import type { Catalog, OnboardingSaveInput, OnboardingState } from "@epilove/contracts";
import { ONBOARDING_STEPS, type OnboardingStep } from "@epilove/core";
import { Button, ProgressBar, Spinner, useToast } from "@epilove/ui";
import { ArrowLeft } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import type { Route } from "next";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { type ComponentType, useCallback, useEffect, useState } from "react";
import { api, errorCode, errorData } from "@/lib/api-client";
import { HOME_PATH } from "@/lib/routes";
import { AudienceStep } from "./steps/audience-step";
import { BirthStep } from "./steps/birth-step";
import { CampusStep } from "./steps/campus-step";
import { CharterStep } from "./steps/charter-step";
import { DoneStep } from "./steps/done-step";
import { GenderStep } from "./steps/gender-step";
import { InterestsStep } from "./steps/interests-step";
import { NameStep } from "./steps/name-step";
import { PhotosStep } from "./steps/photos-step";
import { PromptsStep } from "./steps/prompts-step";
import { SeekingStep } from "./steps/seeking-step";
import type { SaveResult, StepProps } from "./types";

type FlowStep = OnboardingStep | "done";
const ORDER: readonly FlowStep[] = [...ONBOARDING_STEPS, "done"];
const UNDERAGE_PATH = "/compte/mineur" as Route;

const STEPS: Record<FlowStep, ComponentType<StepProps>> = {
  charter: CharterStep,
  name: NameStep,
  birth: BirthStep,
  gender: GenderStep,
  seeking: SeekingStep,
  audience: AudienceStep,
  photos: PhotosStep,
  prompts: PromptsStep,
  interests: InterestsStep,
  campus: CampusStep,
  done: DoneStep,
};

/**
 * The onboarding (ONB-04 to ONB-06): one screen per step, saved on the
 * server at every step, resumed where the member left off.
 */
export function OnboardingFlow() {
  const t = useTranslations("onboarding");
  const router = useRouter();
  const toast = useToast();
  const reduceMotion = useReducedMotion();
  const [state, setState] = useState<OnboardingState | null>(null);
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [current, setCurrent] = useState<FlowStep | null>(null);
  const [direction, setDirection] = useState(1);
  const [navigated, setNavigated] = useState(false);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    let cancelled = false;
    Promise.all([api.onboarding.state(), api.profile.catalog()])
      .then(([loaded, loadedCatalog]) => {
        if (cancelled) return;
        setState(loaded);
        setCatalog(loadedCatalog);
        setCurrent(loaded.step ?? "done");
      })
      .catch((error: unknown) => {
        if (errorCode(error) === "NOT_ONBOARDING") {
          router.replace(HOME_PATH);
        } else {
          toast.error(t("errors.network"));
        }
      });
    return () => {
      cancelled = true;
    };
  }, [router, toast, t]);

  const go = useCallback((step: FlowStep, towards: 1 | -1) => {
    setDirection(towards);
    setNavigated(true);
    setCurrent(step);
    window.scrollTo({ top: 0 });
  }, []);

  const index = current ? ORDER.indexOf(current) : 0;

  const next = useCallback(() => {
    const following = ORDER[index + 1];
    if (following) go(following, 1);
  }, [go, index]);

  const save = useCallback(
    async (input: OnboardingSaveInput): Promise<SaveResult> => {
      setPending(true);
      try {
        setState(await api.onboarding.save(input));
        next();
        return { ok: true };
      } catch (error) {
        const code = errorCode(error);
        if (code === "UNDERAGE") {
          await authClient.signOut().catch(() => undefined);
          router.replace(UNDERAGE_PATH);
          return { ok: false, field: null };
        }
        if (code === "INVALID_VALUE") {
          return { ok: false, field: errorData<{ field: string }>(error)?.field ?? null };
        }
        if (code === "NOT_ONBOARDING") {
          router.replace(HOME_PATH);
          return { ok: false, field: null };
        }
        toast.error(code === "TOO_MANY_REQUESTS" ? t("errors.rateLimited") : t("errors.generic"));
        return { ok: false, field: null };
      } finally {
        setPending(false);
      }
    },
    [next, router, toast, t],
  );

  if (!state || !catalog || !current) {
    return (
      <div className="grid min-h-[60dvh] place-items-center">
        <Spinner className="text-2xl text-plasma" label={t("loading")} />
      </div>
    );
  }

  const Step = STEPS[current];
  const previous = index > 0 ? ORDER[index - 1] : undefined;
  const offset = reduceMotion ? 0 : 32;

  return (
    <div className="flex flex-1 flex-col gap-6">
      <div className="flex items-center gap-3">
        <Button
          variant="ghost"
          size="sm"
          className={previous ? undefined : "invisible"}
          onClick={() => previous && go(previous, -1)}
          leadingIcon={<ArrowLeft className="size-4" aria-hidden="true" />}
        >
          {t("back")}
        </Button>
        <div className="flex-1">
          <ProgressBar
            value={index + 1}
            max={ORDER.length}
            label={t("progress", { current: index + 1, total: ORDER.length })}
          />
        </div>
        <span className="w-12 text-right font-mono text-paper/50 text-xs" aria-hidden="true">
          {index + 1}/{ORDER.length}
        </span>
      </div>
      <AnimatePresence mode="wait" initial={false} custom={direction}>
        <motion.div
          key={current}
          className="flex flex-1 flex-col"
          initial={{ opacity: 0, x: offset * direction }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -offset * direction }}
          transition={{ duration: reduceMotion ? 0 : 0.28, ease: [0.16, 1, 0.3, 1] }}
        >
          <Step
            state={state}
            catalog={catalog}
            save={save}
            next={next}
            pending={pending}
            focusTitle={navigated}
          />
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
