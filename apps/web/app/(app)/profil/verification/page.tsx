import { buttonVariants } from "@atomes/ui";
import { ArrowLeft } from "lucide-react";
import type { Metadata, Route } from "next";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { VerificationFlow } from "@/components/acces/profile/verification/verification-flow";
import { serverApi } from "@/lib/server/api-app";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("profile.verification");
  return { title: t("metaTitle") };
}

/** ONB-08: photo verification by gesture, reviewed by a person. */
export default async function VerificationPage() {
  const t = await getTranslations("profile.verification");
  const state = await (await serverApi()).verification.state();
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-8 px-4 py-8 sm:py-12">
      <Link
        href={"/profil" as Route}
        className={buttonVariants({ variant: "ghost", size: "sm", className: "w-fit" })}
      >
        <ArrowLeft className="size-4" aria-hidden="true" />
        {t("back")}
      </Link>
      <header className="flex flex-col gap-3">
        <h1 className="text-balance font-display font-semibold text-4xl tracking-tight">{t("title")}</h1>
        <p className="text-lg text-paper/75">{t("lead")}</p>
      </header>
      <VerificationFlow initial={state} />
    </main>
  );
}
