import type { Metadata, Route } from "next";
import Link from "next/link";
import { RULE, SANCTION } from "@/lib/labels";
import { serverApi } from "@/lib/server/api";

export const metadata: Metadata = { title: "Recours" };

export default async function AppealsPage() {
  const { appeals } = await (await serverApi()).admin.appeals();
  const dateFormat = new Intl.DateTimeFormat("fr-FR", { dateStyle: "short", timeZone: "Europe/Paris" });
  return (
    <>
      <h1 className="font-display font-semibold text-4xl tracking-tight">Recours</h1>
      <p className="text-paper/60 text-sm">
        Chaque recours est réexaminé par une autre personne que l'auteur de la décision.
      </p>
      {appeals.length === 0 ? (
        <p className="text-paper/60">Aucun recours en attente.</p>
      ) : (
        <ul className="flex flex-col divide-y divide-paper/10">
          {appeals.map((appeal) => (
            <li key={appeal.id} className="flex items-center justify-between gap-4 py-3">
              <Link href={`/recours/${appeal.id}` as Route} className="underline underline-offset-4">
                {SANCTION[appeal.action]} · {RULE[appeal.rule as keyof typeof RULE] ?? appeal.rule}
              </Link>
              <span className="font-mono text-paper/60 text-sm">
                {appeal.member?.pseudonym ?? "—"} · {dateFormat.format(new Date(appeal.createdAt))}
              </span>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
