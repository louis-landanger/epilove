import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { DevMemberPicker } from "@/components/rencontre/dev/member-picker";
import { currentDevMember, serverApi } from "@/lib/rencontre/api.server";
import { isDevEnvironment } from "@/lib/rencontre/dev-member";

export const metadata: Metadata = { title: "Développement" };
export const dynamic = "force-dynamic";

/**
 * Development console: choose the seeded member you browse the app as
 * (`pnpm db:seed:dev`). A 404 outside APP_ENV=development|test.
 */
export default async function DevPage() {
  if (!isDevEnvironment()) {
    notFound();
  }
  const api = await serverApi();
  const { members } = await api.dev.members().catch(() => ({ members: [] }));
  const current = await currentDevMember();

  return (
    <main className="mx-auto flex min-h-dvh max-w-5xl flex-col gap-8 px-4 py-10 sm:px-8">
      <header className="flex flex-col gap-2">
        <p className="font-mono text-volt text-xs uppercase tracking-[0.2em]">Outil de développement</p>
        <h1 className="font-display font-semibold text-4xl tracking-tight sm:text-5xl">
          Choisis ton <em className="font-normal font-serif text-plasma italic">atome</em>
        </h1>
        <p className="max-w-2xl text-paper/70">
          Membres fictifs générés par <code className="font-mono text-paper">pnpm db:seed:dev</code>. Le
          membre choisi est envoyé à l'API dans l'en-tête de développement (
          <code className="font-mono">DEV_AUTH=1</code>).
        </p>
      </header>
      {members.length === 0 ? (
        <p className="rounded-2xl border border-paper/15 p-6 text-paper/80">
          Aucun membre en base. Lance <code className="font-mono">pnpm db:seed:dev</code> puis recharge la
          page.
        </p>
      ) : (
        <DevMemberPicker members={members} current={current} />
      )}
    </main>
  );
}
