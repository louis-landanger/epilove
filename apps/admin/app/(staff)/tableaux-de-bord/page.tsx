import { type AccountStatus, LAUNCH_TARGETS, type Sanction, share, targetState } from "@epilove/core";
import { cn } from "@epilove/ui";
import type { Metadata, Route } from "next";
import Link from "next/link";
import { DailyBars, fillDays } from "@/components/dashboard/bar-chart";
import { formatBytes, formatCount, formatHours, formatShare } from "@/components/dashboard/format";
import { DashboardSection, Kpi, KpiGrid } from "@/components/dashboard/kpi";
import { SANCTION } from "@/lib/labels";
import { serverApi } from "@/lib/server/api";

export const metadata: Metadata = { title: "Tableaux de bord" };

const PERIODS = [7, 30, 90] as const;
type Period = (typeof PERIODS)[number];

const STATUS: Record<AccountStatus, string> = {
  onboarding: "En inscription",
  active: "Actifs",
  paused: "En pause",
  restricted: "Restreints",
  suspended: "Suspendus",
  banned: "Bannis",
  deleting: "En suppression",
};

const SCHOOL_NAMES: Record<string, string> = {
  epita: "EPITA",
  esme: "ESME",
  supbiotech: "Sup'Biotech",
  isg: "ISG",
  ipsa: "IPSA",
};

const target = (key: keyof typeof LAUNCH_TARGETS) => `≥ ${Math.round(LAUNCH_TARGETS[key] * 100)} %`;

/** ADM-09: product indicators, moderation delays and technical health. Aggregates only. */
export default async function DashboardsPage({
  searchParams,
}: {
  searchParams: Promise<{ periode?: string }>;
}) {
  const requested = Number((await searchParams).periode);
  const days: Period = PERIODS.includes(requested as Period) ? (requested as Period) : 30;
  const data = await (await serverApi()).admin.dashboard({ days });
  const { members, moderation, meeting, health } = data;

  const verified =
    (members.byStatus.active ?? 0) + (members.byStatus.restricted ?? 0) + (members.byStatus.paused ?? 0);
  const headcount = members.schools.reduce((sum, school) => sum + (school.headcount ?? 0), 0);
  const coverage = share(verified, headcount);
  const activation = share(members.activation.complete, members.activation.members);
  const retention = share(members.retention.retained, members.retention.cohort);
  const matchToConversation = share(meeting.matchesWithConversation, meeting.matches);
  const crossSchool = share(meeting.crossSchoolMatches, meeting.matches);
  const handled = moderation.reports.reduce((sum, row) => sum + row.handled, 0);
  const within24h = share(
    moderation.reports.reduce((sum, row) => sum + row.within24h, 0),
    handled,
  );
  const sanctions = Object.entries(moderation.sanctions).filter(([, value]) => (value ?? 0) > 0) as Array<
    [Sanction, number]
  >;

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h1 className="font-display font-semibold text-4xl tracking-tight">Tableaux de bord</h1>
          <p className="text-paper/60 text-sm">
            Indicateurs agrégés, sans donnée individuelle. Mis à jour le{" "}
            {new Intl.DateTimeFormat("fr-FR", {
              dateStyle: "long",
              timeStyle: "short",
              timeZone: "Europe/Paris",
            }).format(new Date(data.generatedAt))}
            .
          </p>
        </div>
        <nav aria-label="Période">
          <ul className="flex gap-1 rounded-full border border-paper/15 p-1">
            {PERIODS.map((period) => (
              <li key={period}>
                <Link
                  href={`/tableaux-de-bord?periode=${period}` as Route}
                  aria-current={period === days ? "page" : undefined}
                  className={cn(
                    "inline-flex min-h-9 items-center rounded-full px-4 text-sm",
                    period === days
                      ? "bg-paper text-ink"
                      : "text-paper/70 hover:bg-paper/10 hover:text-paper",
                  )}
                >
                  {period} jours
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      </div>

      <DashboardSection id="membres" title="Membres">
        <KpiGrid>
          <Kpi
            label="Couverture du campus"
            value={formatShare(coverage)}
            detail={`${formatCount(verified)} membres vérifiés / ${formatCount(headcount)} étudiants (estimation)`}
            target={target("coverage")}
            state={targetState(coverage, "coverage")}
          />
          <Kpi
            label="Activation (profils complets)"
            value={formatShare(activation)}
            detail={`${formatCount(members.activation.complete)} sur ${formatCount(members.activation.members)}`}
            target={target("activation")}
            state={targetState(activation, "activation")}
          />
          <Kpi
            label="Rétention à 30 jours"
            value={formatShare(retention)}
            detail={`Cohorte inscrite il y a 30 à 60 jours : ${formatCount(members.retention.cohort)}`}
            target={target("retention")}
            state={targetState(retention, "retention")}
          />
          <Kpi label="Actifs ces 7 derniers jours" value={formatCount(members.activeLast7Days)} />
        </KpiGrid>
        <p className="text-paper/70 text-sm">
          Comptes :{" "}
          {(Object.keys(STATUS) as AccountStatus[])
            .filter((status) => (members.byStatus[status] ?? 0) > 0)
            .map((status) => `${STATUS[status]} ${formatCount(members.byStatus[status] ?? 0)}`)
            .join(" · ") || "aucun pour l'instant"}
        </p>
        <DailyBars
          title={`Inscriptions par jour (${days} jours)`}
          points={fillDays(members.signupsByDay, new Date(data.generatedAt), days)}
        />
        <div className="overflow-x-auto rounded-3xl border border-paper/15">
          <table className="w-full text-left text-sm">
            <caption className="sr-only">Membres par école</caption>
            <thead className="text-paper/60">
              <tr>
                <th scope="col" className="px-4 py-3 font-normal">
                  École
                </th>
                <th scope="col" className="px-4 py-3 text-right font-normal">
                  Membres
                </th>
                <th scope="col" className="px-4 py-3 text-right font-normal">
                  Liste d'attente
                </th>
                <th scope="col" className="px-4 py-3 text-right font-normal">
                  Effectif estimé
                </th>
                <th scope="col" className="px-4 py-3 text-right font-normal">
                  Couverture
                </th>
              </tr>
            </thead>
            <tbody className="tabular-nums">
              {members.schools.map((school) => (
                <tr key={school.slug} className="border-paper/10 border-t">
                  <th scope="row" className="px-4 py-3 font-normal">
                    {SCHOOL_NAMES[school.slug] ?? school.slug}
                  </th>
                  <td className="px-4 py-3 text-right">{formatCount(school.members)}</td>
                  <td className="px-4 py-3 text-right">{formatCount(school.waitlist)}</td>
                  <td className="px-4 py-3 text-right">
                    {school.headcount ? formatCount(school.headcount) : "—"}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {formatShare(share(school.members, school.headcount ?? 0))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </DashboardSection>

      <DashboardSection id="rencontre" title="Rencontre">
        <KpiGrid>
          <Kpi
            label="Conversations réciproques cette semaine"
            value={formatCount(meeting.reciprocalConversationsThisWeek)}
            detail="North Star : au moins 3 messages de chaque côté"
          />
          <Kpi
            label="Taux de match"
            value={formatShare(share(meeting.matches, meeting.likes))}
            detail={`${formatCount(meeting.matches)} matchs pour ${formatCount(meeting.likes)} likes`}
          />
          <Kpi
            label="Match → conversation"
            value={formatShare(matchToConversation)}
            target={target("matchToConversation")}
            state={targetState(matchToConversation, "matchToConversation")}
          />
          <Kpi
            label="Brassage (matchs entre écoles)"
            value={formatShare(crossSchool)}
            target={target("crossSchool")}
            state={targetState(crossSchool, "crossSchool")}
          />
        </KpiGrid>
      </DashboardSection>

      <DashboardSection id="moderation" title="Modération">
        <KpiGrid>
          <Kpi
            label="Signalements traités en moins de 24 h"
            value={formatShare(within24h)}
            detail={`${formatCount(handled)} traités sur la période`}
            target={target("reportsWithin24h")}
            state={targetState(within24h, "reportsWithin24h")}
          />
          <Kpi
            label="Photos en attente"
            value={formatCount(moderation.photos.pending)}
            detail={`Plus ancienne : ${formatHours(moderation.photos.oldestPendingHours)} · délai médian ${formatHours(moderation.photos.medianReviewHours)}`}
          />
          <Kpi
            label="Photos refusées"
            value={formatShare(share(moderation.photos.rejected, moderation.photos.reviewed))}
            detail={`${formatCount(moderation.photos.reviewed)} photos vérifiées`}
          />
          <Kpi
            label="Recours en attente"
            value={formatCount(moderation.appeals.pending)}
            detail={`Plus ancien : ${formatHours(moderation.appeals.oldestPendingHours)} · ${formatCount(moderation.appeals.overturned)} décisions annulées sur ${formatCount(moderation.appeals.decided)}`}
          />
        </KpiGrid>
        <div className="overflow-x-auto rounded-3xl border border-paper/15">
          <table className="w-full text-left text-sm">
            <caption className="sr-only">Délais de traitement des signalements par priorité</caption>
            <thead className="text-paper/60">
              <tr>
                <th scope="col" className="px-4 py-3 font-normal">
                  Priorité
                </th>
                <th scope="col" className="px-4 py-3 text-right font-normal">
                  Ouverts
                </th>
                <th scope="col" className="px-4 py-3 text-right font-normal">
                  Plus ancien
                </th>
                <th scope="col" className="px-4 py-3 text-right font-normal">
                  Traités
                </th>
                <th scope="col" className="px-4 py-3 text-right font-normal">
                  Dans la cible
                </th>
                <th scope="col" className="px-4 py-3 text-right font-normal">
                  Médiane
                </th>
                <th scope="col" className="px-4 py-3 text-right font-normal">
                  90ᵉ centile
                </th>
              </tr>
            </thead>
            <tbody className="tabular-nums">
              {moderation.reports.map((row) => {
                const late = row.oldestOpenHours !== null && row.oldestOpenHours > row.targetHours;
                return (
                  <tr key={row.priority} className="border-paper/10 border-t">
                    <th scope="row" className="px-4 py-3 font-normal">
                      {row.priority.toUpperCase()}{" "}
                      <span className="text-paper/50">(&lt; {row.targetHours} h)</span>
                    </th>
                    <td className="px-4 py-3 text-right">{formatCount(row.open)}</td>
                    <td className={cn("px-4 py-3 text-right", late && "text-danger")}>
                      {formatHours(row.oldestOpenHours)}
                      {late ? <span className="sr-only"> (en retard)</span> : null}
                    </td>
                    <td className="px-4 py-3 text-right">{formatCount(row.handled)}</td>
                    <td className="px-4 py-3 text-right">
                      {formatShare(share(row.withinTarget, row.handled))}
                    </td>
                    <td className="px-4 py-3 text-right">{formatHours(row.medianHours)}</td>
                    <td className="px-4 py-3 text-right">{formatHours(row.p90Hours)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {sanctions.length > 0 ? (
          <p className="text-paper/70 text-sm">
            Décisions sur la période :{" "}
            {sanctions.map(([action, value]) => `${SANCTION[action]} ${formatCount(value)}`).join(" · ")}
          </p>
        ) : null}
      </DashboardSection>

      <DashboardSection id="sante" title="Santé technique">
        <KpiGrid>
          <Kpi
            label="Tâches en file"
            value={formatCount(health.jobs.pending)}
            detail={`${formatCount(health.jobs.running)} en cours · attente max ${health.jobs.oldestWaitingMinutes === null ? "—" : `${Math.round(health.jobs.oldestWaitingMinutes)} min`}`}
          />
          <Kpi
            label="Tâches en échec définitif"
            value={formatCount(health.jobs.failed)}
            state={health.jobs.failed > 0 ? "missed" : "met"}
          />
          <Kpi
            label="Photos en traitement"
            value={formatCount(health.photos.processing)}
            detail={`${formatCount(health.photos.stuck)} bloquées depuis 15 min · ${formatCount(health.photos.failedToday)} en échec sur 24 h`}
            state={health.photos.stuck > 0 ? "missed" : undefined}
          />
          <Kpi
            label="Exports de données"
            value={formatCount(health.exports.pending)}
            detail={`en préparation · ${formatCount(health.exports.failed)} en échec`}
          />
          <Kpi
            label="Base de données"
            value={formatBytes(health.databaseBytes)}
            detail={`Version ${health.version}`}
          />
        </KpiGrid>
      </DashboardSection>
    </>
  );
}
