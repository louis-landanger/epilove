import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { SignInForm } from "@/components/acces/auth/sign-in-form";
import { HOME_PATH, ONBOARDING_PATH } from "@/lib/routes";
import { getCurrentMember } from "@/lib/server/session";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("auth");
  return { title: t("metaTitle") };
}

export default async function SignInPage({ searchParams }: { searchParams: Promise<{ suite?: string }> }) {
  const member = await getCurrentMember();
  if (member) {
    redirect(member.status === "onboarding" ? ONBOARDING_PATH : HOME_PATH);
  }
  const { suite } = await searchParams;
  const t = await getTranslations("auth");

  return (
    <main className="mx-auto grid w-full max-w-6xl grid-cols-[minmax(0,1fr)] gap-12 px-4 pt-6 pb-16 sm:px-10 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)] lg:items-center lg:pt-16">
      <section className="flex flex-col gap-6">
        <p className="font-mono text-paper/60 text-xs uppercase tracking-[0.2em]">{t("eyebrow")}</p>
        <h1 className="max-w-xl text-balance font-display font-semibold text-[clamp(2.5rem,7vw,5.5rem)] leading-[0.95] tracking-tight">
          {t("title")}
        </h1>
        <p className="max-w-md text-lg text-paper/75">{t("lead")}</p>
      </section>
      <section className="rounded-[2rem] border border-paper/10 bg-ink2/80 p-6 shadow-2xl backdrop-blur sm:p-8">
        <SignInForm next={suite ?? null} />
        <p className="mt-8 text-paper/50 text-xs leading-relaxed">{t("legal")}</p>
      </section>
      <p className="text-paper/45 text-xs lg:col-span-2">{t("notAffiliated")}</p>
    </main>
  );
}
