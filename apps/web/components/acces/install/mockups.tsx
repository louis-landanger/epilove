"use client";

import { cn } from "@atomes/ui";
import {
  Bookmark,
  BookOpen,
  ChevronLeft,
  ChevronRight,
  Copy,
  EllipsisVertical,
  MonitorDown,
  Share,
  SquarePlus,
} from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import { useTranslations } from "next-intl";
import type { ReactNode } from "react";
import { LogoMark } from "../marketing/logo";

/**
 * Animated illustrations of each install step (PLT-01). Decorative: the
 * steps themselves are written out next to them.
 */

const EASE = [0.16, 1, 0.3, 1] as const;

/** A pulsing ring where the finger goes. */
function Tap({ className }: { className?: string }) {
  const reduce = useReducedMotion();
  return (
    <span className={cn("pointer-events-none absolute size-10 -translate-1/2", className)}>
      <motion.span
        className="absolute inset-0 rounded-full border-2 border-volt"
        initial={false}
        animate={reduce ? { opacity: 1 } : { scale: [0.6, 1.25], opacity: [0.95, 0] }}
        transition={reduce ? undefined : { duration: 1.2, repeat: Number.POSITIVE_INFINITY, ease: "easeOut" }}
      />
      <span className="absolute inset-3 rounded-full bg-volt/80" />
    </span>
  );
}

function AppIcon({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center justify-center rounded-[22%] bg-[radial-gradient(circle_at_30%_25%,color-mix(in_oklch,var(--color-plasma)_45%,var(--color-ink)),var(--color-ink))] ring-1 ring-paper/15",
        className,
      )}
    >
      <LogoMark className="size-[72%] text-paper" />
    </span>
  );
}

/** A blurred Atomes screen behind the system UI. */
function PageBehind() {
  return (
    <div aria-hidden="true" className="absolute inset-0 overflow-hidden bg-ink">
      <div className="absolute -top-10 -right-10 size-40 rounded-full bg-plasma/40 blur-2xl" />
      <div className="absolute bottom-16 -left-8 size-32 rounded-full bg-volt/20 blur-2xl" />
      <div className="absolute inset-x-5 top-14 flex flex-col gap-2">
        <span className="h-3 w-2/3 rounded-full bg-paper/25" />
        <span className="h-3 w-1/2 rounded-full bg-paper/15" />
        <span className="mt-3 aspect-[4/5] w-full rounded-2xl bg-paper/10" />
      </div>
    </div>
  );
}

function Phone({ children }: { children: ReactNode }) {
  return (
    <div className="relative mx-auto aspect-[9/19] w-[13.5rem] overflow-hidden rounded-[2.4rem] border-[6px] border-paper/20 bg-ink shadow-[0_30px_80px_-30px_color-mix(in_oklch,var(--color-plasma)_45%,transparent)]">
      <PageBehind />
      <span className="absolute top-2 left-1/2 z-20 h-5 w-20 -translate-x-1/2 rounded-full bg-black" />
      {children}
    </div>
  );
}

function Sheet({ children, from = "bottom" }: { children: ReactNode; from?: "bottom" | "top" }) {
  const reduce = useReducedMotion();
  return (
    <motion.div
      className={cn(
        "absolute inset-x-2 z-10 rounded-2xl bg-[#1c1b24] p-2 text-[0.7rem] text-paper shadow-2xl ring-1 ring-paper/10",
        from === "bottom" ? "bottom-2" : "top-9",
      )}
      initial={reduce ? false : { y: from === "bottom" ? 120 : -40, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.55, ease: EASE }}
    >
      {children}
    </motion.div>
  );
}

function Row({ icon, label, active = false }: { icon: ReactNode; label: string; active?: boolean }) {
  return (
    <div
      className={cn(
        "relative flex items-center justify-between rounded-xl px-3 py-2",
        active ? "bg-paper/15 font-semibold" : "text-paper/75",
      )}
    >
      <span>{label}</span>
      <span className="text-paper/70 [&_svg]:size-4">{icon}</span>
      {active ? <Tap className="top-1/2 left-[85%]" /> : null}
    </div>
  );
}

/** The home screen, where the icon pops in. */
function HomeScreen({ delay }: { delay: number }) {
  const reduce = useReducedMotion();
  return (
    <motion.div
      className="absolute inset-0 z-30 grid grid-cols-4 content-start gap-3 bg-[linear-gradient(160deg,#2a1838,#0d1422)] px-4 pt-14"
      initial={reduce ? false : { opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ delay, duration: 0.4 }}
    >
      {Array.from({ length: 11 }, (_, index) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: static decorative grid
        <span key={index} className="aspect-square rounded-[22%] bg-paper/10" />
      ))}
      <motion.span
        className="flex flex-col items-center gap-1"
        initial={reduce ? false : { scale: 0, rotate: -12 }}
        animate={{ scale: 1, rotate: 0 }}
        transition={{ delay: delay + 0.25, type: "spring", stiffness: 260, damping: 14 }}
      >
        <AppIcon className="aspect-square w-full" />
        <span className="text-[0.55rem] text-paper">Atomes</span>
      </motion.span>
    </motion.div>
  );
}

// --- iPhone ----------------------------------------------------------------------------------

function SafariBar({ highlight }: { highlight: boolean }) {
  return (
    <div className="absolute inset-x-0 bottom-0 z-10 flex flex-col gap-2 bg-[#1c1b24]/95 px-3 pt-2 pb-4 text-paper/80 backdrop-blur">
      <span className="mx-auto w-full rounded-lg bg-paper/10 py-1 text-center text-[0.6rem]">atomes.app</span>
      <div className="relative flex items-center justify-between px-1 [&_svg]:size-4">
        <ChevronLeft />
        <ChevronRight className="opacity-40" />
        <span className={cn("relative", highlight && "text-volt")}>
          <Share />
          {highlight ? <Tap className="top-1/2 left-1/2" /> : null}
        </span>
        <BookOpen />
        <Copy />
      </div>
    </div>
  );
}

export function IosShare() {
  return (
    <Phone>
      <SafariBar highlight />
    </Phone>
  );
}

export function IosAdd() {
  const t = useTranslations("help.install.mock");
  return (
    <Phone>
      <SafariBar highlight={false} />
      <div className="absolute inset-0 z-10 bg-black/40" />
      <Sheet>
        <div className="flex items-center gap-2 border-paper/10 border-b px-2 pb-2">
          <AppIcon className="size-7" />
          <span className="flex flex-col leading-tight">
            <span className="font-semibold">Atomes</span>
            <span className="text-[0.6rem] text-paper/60">atomes.app</span>
          </span>
        </div>
        <div className="mt-1 flex flex-col">
          <Row icon={<Copy />} label={t("copy")} />
          <Row icon={<Bookmark />} label={t("bookmark")} />
          <Row icon={<SquarePlus />} label={t("homeScreen")} active />
        </div>
      </Sheet>
    </Phone>
  );
}

export function IosConfirm() {
  const t = useTranslations("help.install.mock");
  return (
    <Phone>
      <Sheet from="top">
        <div className="relative flex items-center justify-between px-1 pb-2 text-[0.65rem]">
          <span className="text-paper/60">{t("cancel")}</span>
          <span className="relative font-semibold text-volt">
            {t("add")}
            <Tap className="top-1/2 left-1/2" />
          </span>
        </div>
        <div className="flex items-center gap-2 rounded-xl bg-paper/5 p-2">
          <AppIcon className="size-9" />
          <span className="flex flex-col leading-tight">
            <span className="font-semibold">Atomes</span>
            <span className="text-[0.6rem] text-paper/60">atomes.app</span>
          </span>
        </div>
      </Sheet>
      <HomeScreen delay={1.6} />
    </Phone>
  );
}

// --- Android ---------------------------------------------------------------------------------

function ChromeBar({ highlight }: { highlight: boolean }) {
  return (
    <div className="absolute inset-x-0 top-0 z-10 flex items-center gap-2 bg-[#1c1b24]/95 px-3 pt-8 pb-2 text-paper/80">
      <span className="flex-1 rounded-full bg-paper/10 px-3 py-1 text-[0.6rem]">atomes.app</span>
      <span className={cn("relative [&_svg]:size-4", highlight && "text-volt")}>
        <EllipsisVertical />
        {highlight ? <Tap className="top-1/2 left-1/2" /> : null}
      </span>
    </div>
  );
}

export function AndroidMenu() {
  return (
    <Phone>
      <ChromeBar highlight />
    </Phone>
  );
}

export function AndroidInstall() {
  const t = useTranslations("help.install.mock");
  const reduce = useReducedMotion();
  return (
    <Phone>
      <ChromeBar highlight={false} />
      <motion.div
        className="absolute top-14 right-2 z-20 w-40 origin-top-right rounded-xl bg-[#2a2933] py-1 text-[0.65rem] text-paper shadow-2xl"
        initial={reduce ? false : { scale: 0.85, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ duration: 0.35, ease: EASE }}
      >
        <Row icon={null} label={t("newTab")} />
        <Row icon={null} label={t("history")} />
        <Row icon={<MonitorDown />} label={t("installApp")} active />
      </motion.div>
    </Phone>
  );
}

function InstallDialog({ wide = false }: { wide?: boolean }) {
  const t = useTranslations("help.install.mock");
  const reduce = useReducedMotion();
  return (
    <motion.div
      className={cn(
        "z-20 flex flex-col gap-3 rounded-2xl bg-[#2a2933] p-4 text-[0.7rem] text-paper shadow-2xl",
        wide ? "absolute top-12 right-4 w-56" : "absolute inset-x-4 top-1/3",
      )}
      initial={reduce ? false : { scale: 0.9, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      transition={{ duration: 0.4, ease: EASE }}
    >
      <span className="font-semibold text-[0.8rem]">{t("installQuestion")}</span>
      <span className="flex items-center gap-2">
        <AppIcon className="size-8" />
        <span className="flex flex-col leading-tight">
          <span className="font-semibold">Atomes</span>
          <span className="text-[0.6rem] text-paper/60">atomes.app</span>
        </span>
      </span>
      <span className="flex justify-end gap-3">
        <span className="px-2 py-1 text-paper/60">{t("cancel")}</span>
        <span className="relative rounded-full bg-paper px-3 py-1 font-semibold text-ink">
          {t("install")}
          <Tap className="top-1/2 left-1/2" />
        </span>
      </span>
    </motion.div>
  );
}

export function AndroidConfirm() {
  return (
    <Phone>
      <ChromeBar highlight={false} />
      <div className="absolute inset-0 z-10 bg-black/40" />
      <InstallDialog />
      <HomeScreen delay={1.6} />
    </Phone>
  );
}

// --- Computer --------------------------------------------------------------------------------

function Browser({ children, highlight }: { children?: ReactNode; highlight: boolean }) {
  return (
    <div className="relative mx-auto aspect-[16/11] w-full max-w-[22rem] overflow-hidden rounded-2xl border border-paper/20 bg-ink shadow-[0_30px_80px_-30px_color-mix(in_oklch,var(--color-plasma)_45%,transparent)]">
      <PageBehind />
      <div className="absolute inset-x-0 top-0 z-10 flex items-center gap-2 bg-[#1c1b24] px-3 py-2 text-paper/80">
        <span className="flex gap-1">
          <span className="size-2 rounded-full bg-danger/70" />
          <span className="size-2 rounded-full bg-volt/70" />
          <span className="size-2 rounded-full bg-success/70" />
        </span>
        <span className="flex flex-1 items-center justify-between rounded-full bg-paper/10 px-3 py-1 text-[0.6rem]">
          atomes.app
          <span className={cn("relative [&_svg]:size-3.5", highlight && "text-volt")}>
            <MonitorDown />
            {highlight ? <Tap className="top-1/2 left-1/2" /> : null}
          </span>
        </span>
      </div>
      {children}
    </div>
  );
}

export function DesktopIcon() {
  return <Browser highlight />;
}

export function DesktopInstall() {
  return (
    <Browser highlight={false}>
      <InstallDialog wide />
    </Browser>
  );
}
