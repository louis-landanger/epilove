import { cn } from "@epilove/ui";
import type { Metadata, Route } from "next";
import Link from "next/link";
import { CONTEXT, REASON, STATUS } from "@/lib/labels";
import { serverApi } from "@/lib/server/api";

export const metadata: Metadata = { title: "Signalements" };

const TABS = ["open", "in_review", "resolved", "dismissed"] as const;
type Tab = (typeof TABS)[number];

const PRIORITY_STYLE = {
  p1: "bg-danger text-ink",
  p2: "bg-plasma/80 text-ink",
  p3: "bg-paper/15 text-paper",
} as const;

export default async function ReportsPage({ searchParams }: { searchParams: Promise<{ statut?: string }> }) {
  const { statut } = await searchParams;
  const status: Tab = TABS.includes(statut as Tab) ? (statut as Tab) : "open";
  const { reports } = await (await serverApi()).admin.reports({ status, limit: 100 });
  const dateFormat = new Intl.DateTimeFormat("fr-FR", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: "Europe/Paris",
  });
  return (
    <>
      <h1 className="font-display font-semibold text-4xl tracking-tight">Signalements</h1>
      <nav aria-label="Statut des signalements" className="flex flex-wrap gap-2">
        {TABS.map((tab) => (
          <Link
            key={tab}
            href={`/signalements?statut=${tab}` as Route}
            aria-current={tab === status ? "page" : undefined}
            className={cn(
              "rounded-full border border-paper/15 px-4 py-1.5 text-sm",
              tab === status ? "border-paper bg-paper text-ink" : "text-paper/70 hover:text-paper",
            )}
          >
            {STATUS[tab]}
          </Link>
        ))}
      </nav>
      {reports.length === 0 ? (
        <p className="text-paper/60">Aucun signalement dans cette file.</p>
      ) : (
        <table className="w-full text-left text-sm">
          <caption className="sr-only">Signalements {STATUS[status]}</caption>
          <thead className="text-paper/50">
            <tr>
              <th scope="col" className="py-2 pr-4 font-normal">
                Priorité
              </th>
              <th scope="col" className="py-2 pr-4 font-normal">
                Motif
              </th>
              <th scope="col" className="py-2 pr-4 font-normal">
                Contexte
              </th>
              <th scope="col" className="py-2 pr-4 font-normal">
                Personne
              </th>
              <th scope="col" className="py-2 font-normal">
                Reçu le
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-paper/10">
            {reports.map((report) => (
              <tr key={report.id} className="hover:bg-paper/[0.03]">
                <td className="py-3 pr-4">
                  <span
                    className={cn(
                      "rounded-full px-2.5 py-0.5 font-mono text-xs uppercase",
                      PRIORITY_STYLE[report.priority],
                    )}
                  >
                    {report.priority}
                  </span>
                </td>
                <td className="py-3 pr-4">
                  <Link href={`/signalements/${report.id}` as Route} className="underline underline-offset-4">
                    {REASON[report.reason]}
                  </Link>
                </td>
                <td className="py-3 pr-4 text-paper/70">{CONTEXT[report.context]}</td>
                <td className="py-3 pr-4 font-mono">{report.reported?.pseudonym ?? "Compte supprimé"}</td>
                <td className="py-3 text-paper/70">{dateFormat.format(new Date(report.createdAt))}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  );
}
