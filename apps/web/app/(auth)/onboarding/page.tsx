import { redirect } from "next/navigation";
import { HOME_PATH } from "@/lib/routes";
import { requireMember } from "@/lib/server/session";

export default async function OnboardingPage() {
  const member = await requireMember();
  if (member.status !== "onboarding") {
    redirect(HOME_PATH);
  }
  return (
    <main className="mx-auto max-w-xl px-4 py-16">
      <h1 className="font-display font-semibold text-4xl tracking-tight">Bienvenue</h1>
    </main>
  );
}
