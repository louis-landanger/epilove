"use client";

import { Smartphone, X } from "lucide-react";
import type { Route } from "next";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { useInstallState } from "./install-prompt";
import { detectPlatform } from "./platform";

const STORAGE_KEY = "epilove:install-banner";
export const INSTALL_GUIDE_PATH = "/aide/installer";

/**
 * Suggests installing the app on phones, until it is installed or the
 * banner is dismissed (remembered in this browser only). Also starts
 * listening for the browser's install prompt as early as possible.
 */
export function InstallBanner() {
  const t = useTranslations("help.install.banner");
  const pathname = usePathname();
  const { installed } = useInstallState();
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    let dismissed = false;
    try {
      dismissed = window.localStorage.getItem(STORAGE_KEY) === "dismissed";
    } catch {
      // Storage blocked: show the banner, it can still be closed for this visit.
    }
    setVisible(!dismissed && detectPlatform(navigator.userAgent, navigator.maxTouchPoints) !== "desktop");
  }, []);

  if (!visible || installed || pathname?.startsWith(INSTALL_GUIDE_PATH)) {
    return null;
  }

  return (
    <aside
      aria-label={t("cta")}
      className="mx-4 mt-4 flex items-center gap-3 rounded-3xl border border-paper/10 bg-paper/[0.04] p-3 pl-4 text-sm"
    >
      <Smartphone className="size-5 shrink-0 text-volt" aria-hidden="true" />
      <p className="flex-1 text-paper/80">
        {t("text")}{" "}
        <Link
          href={INSTALL_GUIDE_PATH as Route}
          className="font-semibold text-paper underline underline-offset-2"
        >
          {t("cta")}
        </Link>
      </p>
      <button
        type="button"
        aria-label={t("dismiss")}
        onClick={() => {
          setVisible(false);
          try {
            window.localStorage.setItem(STORAGE_KEY, "dismissed");
          } catch {
            // Hidden for this visit only.
          }
        }}
        className="inline-flex size-9 shrink-0 items-center justify-center rounded-full text-paper/60 hover:bg-paper/10 hover:text-paper focus-visible:outline-2 focus-visible:outline-volt"
      >
        <X className="size-4" aria-hidden="true" />
      </button>
    </aside>
  );
}
