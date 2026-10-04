import { buttonVariants, EmptyState } from "@atomes/ui";
import { getTranslations } from "next-intl/server";
import type { ReactNode } from "react";
import { isDevEnvironment } from "@/lib/rencontre/dev-member";
import type { Gate } from "@/lib/rencontre/gate";
import { ReloadButton } from "./reload-button";

/** Full-page states shared by the dating screens: sign-in or profile required, server error. */

function Orbit() {
  return (
    <span aria-hidden="true" className="relative block size-10">
      <span className="absolute inset-0 rounded-full border border-paper/20" />
      <span className="absolute top-0 left-1/2 size-2.5 -translate-x-1/2 rounded-full bg-plasma shadow-[0_0_20px_var(--color-plasma)]" />
    </span>
  );
}

function StateCard({ title, lead, children }: { title: string; lead: string; children?: ReactNode }) {
  return (
    <EmptyState
      icon={<Orbit />}
      title={title}
      titleAs="h1"
      description={lead}
      action={children}
      className="flex min-h-[60dvh] max-w-md justify-center"
    />
  );
}

const ACTION = buttonVariants({ variant: "secondary" });

export async function GateScreen({ gate }: { gate: Gate }) {
  const t = await getTranslations("campus.states");
  if (gate === "notfound") {
    return <NotFoundScreen />;
  }
  if (gate === "profile") {
    return (
      <StateCard title={t("profileTitle")} lead={t("profileLead")}>
        <a href="/onboarding" className={ACTION}>
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
      <a href={isDevEnvironment() ? "/dev" : "/connexion"} className={ACTION}>
        {isDevEnvironment() ? t("devSignIn") : t("signInAction")}
      </a>
    </StateCard>
  );
}

export async function NotFoundScreen() {
  const t = await getTranslations("matches.profile");
  const states = await getTranslations("campus.states");
  return (
    <StateCard title={t("notFound")} lead={t("notFoundLead")}>
      <a href="/decouvrir" className={ACTION}>
        {states("back")}
      </a>
    </StateCard>
  );
}
