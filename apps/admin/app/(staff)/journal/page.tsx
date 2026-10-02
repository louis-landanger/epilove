import type { Metadata } from "next";
import { serverApi } from "@/lib/server/api";

export const metadata: Metadata = { title: "Journal d'audit" };

/** ADM-05: append-only, read-only here. Targets that are people appear as pseudonyms. */
export default async function AuditPage() {
  const { entries } = await (await serverApi()).admin.auditLog({ limit: 100 });
  const dateFormat = new Intl.DateTimeFormat("fr-FR", {
    dateStyle: "short",
    timeStyle: "medium",
    timeZone: "Europe/Paris",
  });
  return (
    <>
      <h1 className="font-display font-semibold text-4xl tracking-tight">Journal d'audit</h1>
      <p className="text-paper/60 text-sm">
        Toute action de l'équipe et toute mesure automatique, sans modification possible.
      </p>
      <table className="w-full text-left text-sm">
        <caption className="sr-only">Dernières entrées du journal</caption>
        <thead className="text-paper/50">
          <tr>
            <th scope="col" className="py-2 pr-4 font-normal">
              Date
            </th>
            <th scope="col" className="py-2 pr-4 font-normal">
              Auteur
            </th>
            <th scope="col" className="py-2 pr-4 font-normal">
              Action
            </th>
            <th scope="col" className="py-2 pr-4 font-normal">
              Cible
            </th>
            <th scope="col" className="py-2 font-normal">
              Détails
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-paper/10 align-top">
          {entries.map((entry) => (
            <tr key={entry.id}>
              <td className="py-2 pr-4 whitespace-nowrap text-paper/70">
                {dateFormat.format(new Date(entry.createdAt))}
              </td>
              <td className="py-2 pr-4 font-mono">{entry.actor ?? "système"}</td>
              <td className="py-2 pr-4 font-mono">{entry.action}</td>
              <td className="py-2 pr-4 font-mono text-paper/70">
                {entry.targetType}
                {entry.target ? ` · ${entry.target.slice(0, 13)}` : ""}
              </td>
              <td className="py-2 font-mono text-paper/60 text-xs">
                {entry.metadata ? JSON.stringify(entry.metadata) : ""}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}
