import type { Route } from "next";
import Link from "next/link";
import { serverApi } from "@/lib/server/api";

export default async function OverviewPage() {
  const overview = await (await serverApi()).admin.overview();
  const cards = [
    { href: "/photos", label: "Photos à vérifier", value: overview.pendingPhotos, tone: "border-paper/15" },
    {
      href: "/signalements",
      label: "Signalements P1 (< 6 h)",
      value: overview.openReports.p1,
      tone: "border-danger/60",
    },
    {
      href: "/signalements",
      label: "Signalements P2 (< 24 h)",
      value: overview.openReports.p2,
      tone: "border-plasma/50",
    },
    {
      href: "/signalements",
      label: "Signalements P3 (< 72 h)",
      value: overview.openReports.p3,
      tone: "border-paper/15",
    },
    {
      href: "/signalements",
      label: "Profils masqués en attente",
      value: overview.heldProfiles,
      tone: "border-volt/40",
    },
  ];
  return (
    <>
      <h1 className="font-display font-semibold text-4xl tracking-tight">Vue d'ensemble</h1>
      <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {cards.map((card) => (
          <li key={card.label}>
            <Link
              href={card.href as Route}
              className={`flex flex-col gap-2 rounded-3xl border bg-paper/[0.03] p-5 transition-colors hover:bg-paper/5 ${card.tone}`}
            >
              <span className="font-display font-semibold text-4xl tabular-nums">{card.value}</span>
              <span className="text-paper/70 text-sm">{card.label}</span>
            </Link>
          </li>
        ))}
      </ul>
    </>
  );
}
