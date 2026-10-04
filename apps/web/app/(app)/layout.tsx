import { ToastProvider, WatermarkProvider } from "@atomes/ui";
import { headers } from "next/headers";
import { getTranslations } from "next-intl/server";
import type { ReactNode } from "react";
import { ReverifyBanner } from "@/components/acces/account/reverify-banner";
import { EasterEggs } from "@/components/acces/fun/easter-eggs";
import { InstallBanner } from "@/components/acces/install/install-banner";
import { AppLock } from "@/components/acces/lock/app-lock";
import { earlyLockScript } from "@/components/acces/lock/lock-config";
import { LiveAppNav } from "@/components/acces/shell/live-app-nav";
import { RencontreProviders } from "@/components/rencontre/providers";
import { serverApi } from "@/lib/server/api-app";
import { requireAppMember } from "@/lib/server/session";
import "@/components/rencontre/rencontre.css";

/**
 * Shell of the signed-in app: session guard (onboarding, suspension and
 * deletion are routed elsewhere), bottom tab bar on mobile, side navigation on
 * desktop (docs/02-design.md, section 6).
 */
export default async function AppLayout({ children }: { children: ReactNode }) {
  const member = await requireAppMember();
  const t = await getTranslations("nav");
  const nonce = (await headers()).get("x-nonce") ?? undefined;
  // SAF-12: photos of other members carry the viewer's code (<ViewerWatermark />).
  const watermark = await (await serverApi()).account.watermark();
  return (
    <WatermarkProvider code={watermark.code}>
      <ToastProvider>
        {/* SAF-13: hides the app before the first paint when this device locks it. */}
        <script
          nonce={nonce}
          suppressHydrationWarning
          // biome-ignore lint/security/noDangerouslySetInnerHtml: fixed code around a UUID, see earlyLockScript
          dangerouslySetInnerHTML={{ __html: earlyLockScript(member.userId) }}
        />
        <AppLock userId={member.userId} />
        <a
          href="#contenu"
          className="sr-only z-50 rounded-xl bg-volt px-4 py-2 font-semibold text-ink focus:not-sr-only focus:fixed focus:top-3 focus:left-3"
        >
          {t("skipToContent")}
        </a>
        {/* Full-screen flows (a profile, a conversation…) mark themselves with
            `data-immersive`: the bottom tab bar then makes way on phones. */}
        {/* One query cache and one realtime connection for the whole app, kept across tabs. */}
        <RencontreProviders>
          <div className="group/app contents">
            <div className="contents in-data-locked:invisible">
              <LiveAppNav />
            </div>
            <EasterEggs />
            <div
              id="contenu"
              className="in-data-locked:invisible min-h-dvh pb-[calc(4rem+env(safe-area-inset-bottom))] group-has-[[data-immersive]]/app:pb-0 lg:pb-0 lg:pl-60"
            >
              <ReverifyBanner due={member.reverifyDueAt} paused={member.pausedForReverification} />
              <InstallBanner />
              {children}
            </div>
          </div>
        </RencontreProviders>
      </ToastProvider>
    </WatermarkProvider>
  );
}
