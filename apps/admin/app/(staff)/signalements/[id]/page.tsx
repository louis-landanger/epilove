import { Badge } from "@atomes/ui";
import type { Metadata, Route } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { DecisionForm } from "@/components/decision-form";
import { MemberCard } from "@/components/member-card";
import { RevealIdentity } from "@/components/reveal-identity";
import { CONTEXT, REASON, STATUS } from "@/lib/labels";
import { serverApi } from "@/lib/server/api";

export const metadata: Metadata = { title: "Signalement" };

export default async function ReportPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const api = await serverApi();
  const report = await api.admin.report({ id }).catch(() => null);
  if (!report) {
    notFound();
  }
  const decided = report.status === "resolved" || report.status === "dismissed";
  return (
    <>
      <Link href={"/signalements" as Route} className="text-paper/60 text-sm hover:text-paper">
        ← Signalements
      </Link>
      <header className="flex flex-col gap-3">
        <h1 className="font-display font-semibold text-4xl tracking-tight">{REASON[report.reason]}</h1>
        <div className="flex flex-wrap gap-2">
          <Badge>{report.priority.toUpperCase()}</Badge>
          <Badge>{CONTEXT[report.context]}</Badge>
          <Badge>{STATUS[report.status]}</Badge>
          {report.contextRef ? <Badge className="font-mono">{report.contextRef}</Badge> : null}
        </div>
        <p className="text-paper/60 text-sm">
          Signalé par <span className="font-mono">{report.reporter?.pseudonym ?? "compte supprimé"}</span>
        </p>
      </header>
      <section aria-labelledby="details" className="flex flex-col gap-2">
        <h2 id="details" className="font-semibold">
          Détails du signalement
        </h2>
        <p className="whitespace-pre-line rounded-2xl bg-paper/[0.04] p-4 text-paper/85">
          {report.details ?? "Aucun détail fourni."}
        </p>
      </section>
      {report.reportedCard ? (
        <div className="flex flex-col gap-3">
          <MemberCard card={report.reportedCard} />
          <RevealIdentity userId={report.reportedCard.member.userId} />
        </div>
      ) : (
        <p className="text-paper/60">Le compte signalé n'existe plus.</p>
      )}
      {decided ? (
        <p className="text-paper/60">Ce signalement a été traité.</p>
      ) : (
        <DecisionForm reportId={report.id} />
      )}
    </>
  );
}
