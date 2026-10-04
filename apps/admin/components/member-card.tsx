import type { AdminMemberCard } from "@atomes/contracts";
import { SCHOOLS, type SchoolSlug } from "@atomes/core";
import { Badge, SchoolChip, ViewerWatermark } from "@atomes/ui";
import { RULE, SANCTION } from "@/lib/labels";

const dateFormat = new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium", timeZone: "Europe/Paris" });

/** Pseudonymised member view (docs/07, A5): content first, never the name or the address. */
export function MemberCard({ card }: { card: AdminMemberCard }) {
  const school = SCHOOLS.find((item) => item.slug === card.schoolSlug);
  return (
    <section
      aria-label={`Membre ${card.member.pseudonym}`}
      className="flex flex-col gap-5 rounded-[2rem] border border-paper/10 p-5"
    >
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-mono font-semibold text-lg">{card.member.pseudonym}</span>
        {school ? <SchoolChip school={school.slug as SchoolSlug} name={school.name} /> : null}
        {card.age !== null ? <Badge>{card.age} ans</Badge> : null}
        {card.graduationYear ? <Badge>Promo {card.graduationYear}</Badge> : null}
        <Badge>{card.status}</Badge>
        {card.held ? <Badge className="bg-volt/20 text-volt">Masqué en attente</Badge> : null}
      </div>
      <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
        <div>
          <dt className="text-paper/50">Inscription</dt>
          <dd>{dateFormat.format(new Date(card.joinedAt))}</dd>
        </div>
        <div>
          <dt className="text-paper/50">Signalements reçus</dt>
          <dd>{card.history.reportsReceived}</dd>
        </div>
        <div>
          <dt className="text-paper/50">Signalants distincts</dt>
          <dd>{card.history.distinctReporters}</dd>
        </div>
        <div>
          <dt className="text-paper/50">Blocages reçus</dt>
          <dd>{card.history.blocksReceived}</dd>
        </div>
      </dl>
      {card.photos.length > 0 ? (
        <ul className="flex flex-wrap gap-2" aria-label="Photos">
          {card.photos.map((photo) => (
            <li key={photo.id} className="relative h-32 w-24 overflow-hidden rounded-xl bg-paper/5">
              {photo.url ? (
                // biome-ignore lint/performance/noImgElement: signed, short-lived imgproxy URL
                <img src={photo.url} alt="" className="size-full object-cover" />
              ) : null}
              <ViewerWatermark />
              <span className="absolute bottom-1 left-1 rounded-full bg-ink/80 px-1.5 text-[10px]">
                {photo.status}
              </span>
            </li>
          ))}
        </ul>
      ) : null}
      {card.prompts.length > 0 ? (
        <ul className="flex flex-col gap-2 text-sm">
          {card.prompts.map((item) => (
            <li key={item.question}>
              <span className="text-paper/50">{item.question}</span> {item.answer}
            </li>
          ))}
        </ul>
      ) : null}
      {card.history.actions.length > 0 ? (
        <div className="flex flex-col gap-2">
          <h3 className="font-semibold text-sm">Décisions précédentes</h3>
          <ul className="flex flex-col gap-1 text-paper/70 text-sm">
            {card.history.actions.map((action) => (
              <li key={action.createdAt}>
                {dateFormat.format(new Date(action.createdAt))} · {SANCTION[action.action]}
                {action.rule in RULE ? ` · ${RULE[action.rule as keyof typeof RULE]}` : ""}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}
