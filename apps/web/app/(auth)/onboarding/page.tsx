import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { OnboardingFlow } from "@/components/acces/onboarding/onboarding-flow";
import { HOME_PATH } from "@/lib/routes";
import { requireMember } from "@/lib/server/session";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("onboarding");
  return { title: t("metaTitle") };
}

export default async function OnboardingPage() {
  const member = await requireMember();
  if (member.status !== "onboarding") {
    redirect(HOME_PATH);
  }
  return (
    <main id="contenu" className="mx-auto flex min-h-[calc(100dvh-5rem)] w-full max-w-xl flex-col px-4 pb-8">
      <OnboardingFlow />
    </main>
  );
}
