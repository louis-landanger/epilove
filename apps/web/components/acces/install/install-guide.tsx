"use client";

import { Button, cn, Tabs } from "@atomes/ui";
import { Pause, Play } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useTranslations } from "next-intl";
import { type ComponentType, useEffect, useState } from "react";
import { promptInstall, useInstallState } from "./install-prompt";
import {
  AndroidConfirm,
  AndroidInstall,
  AndroidMenu,
  DesktopIcon,
  DesktopInstall,
  IosAdd,
  IosConfirm,
  IosShare,
} from "./mockups";
import { detectPlatform, INSTALL_PLATFORMS, type InstallPlatform } from "./platform";

interface Step {
  readonly key: string;
  readonly Frame: ComponentType;
}

const STEPS: Record<InstallPlatform, readonly Step[]> = {
  ios: [
    { key: "share", Frame: IosShare },
    { key: "add", Frame: IosAdd },
    { key: "confirm", Frame: IosConfirm },
  ],
  android: [
    { key: "menu", Frame: AndroidMenu },
    { key: "install", Frame: AndroidInstall },
    { key: "confirm", Frame: AndroidConfirm },
  ],
  desktop: [
    { key: "icon", Frame: DesktopIcon },
    { key: "install", Frame: DesktopInstall },
  ],
};

/** Long enough for the icon to land on the home screen in the last step. */
const STEP_MS = 3600;

/** Illustration and written steps, played in a loop until paused or a step is picked. */
function StepPlayer({ platform }: { platform: InstallPlatform }) {
  const t = useTranslations("help.install");
  const reduce = useReducedMotion();
  const steps = STEPS[platform];
  const [index, setIndex] = useState(0);
  const [playing, setPlaying] = useState(true);
  const autoplay = playing && !reduce;

  useEffect(() => {
    if (!autoplay) return;
    const timer = window.setInterval(() => setIndex((current) => (current + 1) % steps.length), STEP_MS);
    return () => window.clearInterval(timer);
  }, [autoplay, steps.length]);

  const current = steps[index] ?? steps[0];
  if (!current) return null;
  const { Frame } = current;

  return (
    <div className="grid items-center gap-8 md:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
      <div className="flex flex-col items-center gap-4">
        <div aria-hidden="true" className="w-full">
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={`${platform}-${current.key}`}
              initial={reduce ? false : { opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={reduce ? { opacity: 1 } : { opacity: 0, y: -12 }}
              transition={{ duration: 0.3 }}
            >
              <Frame />
            </motion.div>
          </AnimatePresence>
        </div>
        <div className="flex items-center gap-3 text-paper/60 text-sm">
          {reduce ? null : (
            <button
              type="button"
              onClick={() => setPlaying((value) => !value)}
              aria-label={playing ? t("player.pause") : t("player.play")}
              className="inline-flex size-9 items-center justify-center rounded-full border border-paper/15 text-paper hover:bg-paper/10 focus-visible:outline-2 focus-visible:outline-volt"
            >
              {playing ? (
                <Pause className="size-4" aria-hidden="true" />
              ) : (
                <Play className="size-4" aria-hidden="true" />
              )}
            </button>
          )}
          <span aria-live={autoplay ? "off" : "polite"}>
            {t("player.step", { current: index + 1, total: steps.length })}
          </span>
        </div>
      </div>

      <ol aria-label={t("player.steps")} className="flex flex-col gap-2">
        {steps.map((step, position) => {
          const active = position === index;
          return (
            <li key={step.key}>
              <button
                type="button"
                aria-current={active ? "step" : undefined}
                onClick={() => {
                  setIndex(position);
                  setPlaying(false);
                }}
                className={cn(
                  "flex w-full items-start gap-4 rounded-3xl border p-4 text-left transition-colors focus-visible:outline-2 focus-visible:outline-volt",
                  active ? "border-plasma/60 bg-plasma/10" : "border-paper/10 hover:bg-paper/5",
                )}
              >
                <span
                  className={cn(
                    "flex size-8 shrink-0 items-center justify-center rounded-full font-mono text-sm",
                    active ? "bg-plasma text-ink" : "bg-paper/10 text-paper/70",
                  )}
                >
                  {position + 1}
                </span>
                <span className="flex flex-col gap-1">
                  <span className="font-semibold">{t(`${platform}.steps.${step.key}.title` as never)}</span>
                  <span className="text-paper/70 text-sm">
                    {t(`${platform}.steps.${step.key}.body` as never)}
                  </span>
                </span>
              </button>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

function PlatformPanel({ platform }: { platform: InstallPlatform }) {
  const t = useTranslations("help.install");
  const { canPrompt } = useInstallState();
  const [prompting, setPrompting] = useState(false);
  return (
    <div className="flex flex-col gap-6">
      {canPrompt && platform !== "ios" ? (
        <div className="flex flex-col items-start gap-2 rounded-3xl border border-volt/30 bg-volt/5 p-4">
          <Button
            disabled={prompting}
            onClick={async () => {
              setPrompting(true);
              await promptInstall().finally(() => setPrompting(false));
            }}
          >
            {t("android.button")}
          </Button>
          <p className="text-paper/70 text-sm">{t("android.buttonHelp")}</p>
        </div>
      ) : null}
      <StepPlayer platform={platform} />
      {platform === "ios" ? <p className="text-paper/70 text-sm">{t("ios.note")}</p> : null}
      {platform === "desktop" ? <p className="text-paper/70 text-sm">{t("desktop.note")}</p> : null}
    </div>
  );
}

/** PLT-01: an animated install guide, different for iPhone, Android and computers. */
export function InstallGuide() {
  const t = useTranslations("help.install");
  const { installed } = useInstallState();
  const [platform, setPlatform] = useState<InstallPlatform | null>(null);

  useEffect(() => {
    setPlatform(detectPlatform(navigator.userAgent, navigator.maxTouchPoints));
  }, []);

  return (
    <div className="flex flex-col gap-6">
      {installed ? (
        <p role="status" className="rounded-3xl border border-success/40 bg-success/10 p-4 text-paper">
          {t("installed")}
        </p>
      ) : null}
      <Tabs
        label={t("device")}
        value={platform ?? "ios"}
        onValueChange={setPlatform}
        items={INSTALL_PLATFORMS.map((value) => ({
          value,
          label: t(`platforms.${value}`),
          content: <PlatformPanel platform={value} />,
        }))}
      />
      {platform ? <p className="-mt-2 text-paper/50 text-xs">{t("detected")}</p> : null}
    </div>
  );
}
