import type { Metadata, Route } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AppealForm } from "@/components/appeal-form";
import { MemberCard } from "@/components/member-card";
import { RULE, SANCTION } from "@/lib/labels";
import { serverApi } from "@/lib/server/api";

export const metadata: Metadata = { title: "Recours" };

export default async function AppealPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const appeal = await (await serverApi()).admin.appeal({ id }).catch(() => null);
  if (!appeal) {
    notFound();
  }
  return (
    <>
      <Link href={"/recours" as Route} className="text-paper/60 text-sm hover:text-paper">
        ← Recours
      </Link>
      <h1 className="font-display font-semibold text-4xl tracking-tight">
        Recours contre : {SANCTION[appeal.decision.action]}
      </h1>
      <section className="flex flex-col gap-2 rounded-[2rem] border border-paper/10 p-5">
        <h2 className="font-semibold">Décision initiale</h2>
        <p className="text-paper/60 text-sm">
          {RULE[appeal.decision.rule as keyof typeof RULE] ?? appeal.decision.rule} · par{" "}
          <span className="font-mono">{appeal.decision.decidedBy ?? "—"}</span>
        </p>
        <p className="whitespace-pre-line">{appeal.decision.statement}</p>
        {appeal.decision.reportId ? (
          <Link
            href={`/signalements/${appeal.decision.reportId}` as Route}
            className="text-sm underline underline-offset-4"
          >
            Voir le signalement d'origine
          </Link>
        ) : null}
      </section>
      <section className="flex flex-col gap-2">
        <h2 className="font-semibold">Arguments de la personne</h2>
        <p className="whitespace-pre-line rounded-2xl bg-paper/[0.04] p-4">{appeal.text}</p>
      </section>
      {appeal.memberCard ? <MemberCard card={appeal.memberCard} /> : null}
      {appeal.status !== "pending" ? (
        <p className="text-paper/60">Ce recours a déjà été traité.</p>
      ) : appeal.canReview ? (
        <AppealForm appealId={appeal.id} />
      ) : (
        <p className="rounded-2xl border border-volt/40 bg-volt/10 p-4 text-sm">
          Tu as pris la décision initiale : une autre personne de l'équipe doit examiner ce recours.
        </p>
      )}
    </>
  );
}
