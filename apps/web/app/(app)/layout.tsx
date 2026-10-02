import { ToastProvider } from "@epilove/ui";
import { getTranslations } from "next-intl/server";
import type { ReactNode } from "react";
import { EasterEggs } from "@/components/acces/fun/easter-eggs";
import { AppNav } from "@/components/acces/shell/app-nav";
import { requireAppMember } from "@/lib/server/session";

/**
 * Shell of the signed-in app: session guard (onboarding, suspension and
 * deletion are routed elsewhere), bottom tab bar on mobile, side navigation on
 * desktop (docs/02-design.md, section 6).
 */
export default async function AppLayout({ children }: { children: ReactNode }) {
  await requireAppMember();
  const t = await getTranslations("nav");
  return (
    <ToastProvider>
      <a
        href="#contenu"
        className="sr-only z-50 rounded-xl bg-volt px-4 py-2 font-semibold text-ink focus:not-sr-only focus:fixed focus:top-3 focus:left-3"
      >
        {t("skipToContent")}
      </a>
      <AppNav />
      <EasterEggs />
      <div id="contenu" className="min-h-dvh pb-[calc(4rem+env(safe-area-inset-bottom))] lg:pb-0 lg:pl-60">
        {children}
      </div>
    </ToastProvider>
  );
}
