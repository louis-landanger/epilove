import { getTranslations } from "next-intl/server";
import type { ReactNode } from "react";
import { isDevEnvironment } from "@/lib/rencontre/dev-member";
import type { Gate } from "@/lib/rencontre/gate";
import { ReloadButton } from "./reload-button";

/** Full-page states shared by the dating screens: sign-in or profile required, server error. */

function StateCard({ title, lead, children }: { title: string; lead: string; children?: ReactNode }) {
  return (
    <section className="mx-auto flex min-h-[60dvh] max-w-md flex-col items-center justify-center gap-4 px-4 text-center">
      <span aria-hidden="true" className="relative block size-16">
        <span className="absolute inset-0 rounded-full border border-paper/20" />
        <span className="absolute top-0 left-1/2 size-3 -translate-x-1/2 rounded-full bg-plasma shadow-[0_0_20px_var(--color-plasma)]" />
      </span>
      <h1 className="font-display font-semibold text-2xl">{title}</h1>
      <p className="text-paper/70">{lead}</p>
      {children}
    </section>
  );
}

export async function GateScreen({ gate }: { gate: Gate }) {
  const t = await getTranslations("campus.states");
  if (gate === "profile") {
    return (
      <StateCard title={t("profileTitle")} lead={t("profileLead")}>
        <a href="/onboarding" className="rounded-full bg-paper px-5 py-2.5 font-semibold text-ink">
          {t("profileAction")}
        </a>
      </StateCard>
    );
  }
  if (gate === "error") {
    return (
      <StateCard title={t("errorTitle")} lead={t("errorLead")}>
        <ReloadButton label={t("retry")} />
      </StateCard>
    );
  }
  return (
    <StateCard title={t("signInTitle")} lead={t("signInLead")}>
      <a
        href={isDevEnvironment() ? "/dev" : "/connexion"}
        className="rounded-full bg-paper px-5 py-2.5 font-semibold text-ink"
      >
        {isDevEnvironment() ? t("devSignIn") : t("signInAction")}
      </a>
    </StateCard>
  );
}
