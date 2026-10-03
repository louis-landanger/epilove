import { and, eq, gte, inArray, lte } from "drizzle-orm";
import type { Database } from "../client";
import { appUser, event, eventRsvp, spot } from "../schema";
import { type DevMember, devMemberId } from "./members";
import type { Random } from "./random";

/** Sarah (ISG) organizes the development events: pick her on /dev to try the organizer screens. */
export const DEV_ORGANIZER_ID = devMemberId(3);

const eventId = (index: number) => `de000003-0000-7000-8000-${String(index).padStart(12, "0")}`;
const EVENT_ID_RANGE = { from: eventId(0), to: eventId(999_999) } as const;

/** Made-up associations and events (IRL-01): no real society name is used. */
const DEV_EVENTS = [
  {
    title: "Afterwork de rentrée",
    organizerName: "BDE inter-écoles (fictif)",
    description: "Musique, jus pressés et rencontres entre les cinq écoles. Entrée libre.",
    spotSlug: "place-valmy",
    inDays: 2,
    hour: 18,
    hours: 3,
    schools: [],
  },
  {
    title: "Tournoi de baby-foot",
    organizerName: "Asso des jeux (fictive)",
    description: "Équipes de deux, inscriptions sur place. Les finales commencent à 21 h.",
    venue: "Foyer du campus, Vaise",
    inDays: 5,
    hour: 19,
    hours: 3,
    schools: [],
  },
  {
    title: "Pique-nique sur les berges",
    organizerName: "BDE inter-écoles (fictif)",
    description: "Chacun apporte quelque chose à partager. Repli au foyer s'il pleut.",
    spotSlug: "berges-de-saone-vaise",
    inDays: 9,
    hour: 12,
    hours: 2,
    schools: [],
  },
  {
    title: "Soirée jeux de société",
    organizerName: "Club ludique (fictif)",
    description: "Une cinquantaine de jeux, des tables pour débutants et pour experts.",
    venue: "Salle polyvalente, Vaise",
    inDays: 11,
    hour: 19,
    hours: 4,
    schools: ["epita", "ipsa"],
  },
  {
    title: "Atelier CV et café",
    organizerName: "Bureau des étudiants (fictif)",
    description: "Relecture de CV en petits groupes, avec des anciens.",
    venue: "Bibliothèque du campus",
    inDays: 14,
    hour: 17,
    hours: 2,
    schools: ["isg"],
  },
  {
    title: "Ciné-débat en plein air",
    organizerName: "Ciné-club (fictif)",
    description: "Projection d'un court-métrage puis discussion. Prévois un plaid.",
    spotSlug: "parc-du-vallon",
    inDays: 18,
    hour: 20,
    hours: 3,
    schools: ["supbiotech", "esme"],
  },
] as const;

/**
 * Development events with answers from the fictional members. Inès and Hugo
 * (a match) both go to the first one and share it, so the "your matches going"
 * section has something to show.
 */
export async function seedDevEvents(
  db: Database,
  input: { members: readonly DevMember[]; schools: ReadonlyMap<string, string>; now: Date; random: Random },
) {
  const { members, schools, now, random } = input;
  await db.update(appUser).set({ role: "organizer" }).where(eq(appUser.id, DEV_ORGANIZER_ID));
  await db.delete(event).where(and(gte(event.id, EVENT_ID_RANGE.from), lte(event.id, EVENT_ID_RANGE.to)));

  const slugs = DEV_EVENTS.flatMap((e) => ("spotSlug" in e ? [e.spotSlug] : []));
  const spots = new Map(
    (
      await db
        .select({ id: spot.id, slug: spot.slug, name: spot.nameFr })
        .from(spot)
        .where(inArray(spot.slug, slugs))
    ).map((s) => [s.slug, s]),
  );
  const midnight = new Date(now);
  midnight.setUTCHours(0, 0, 0, 0);

  const rows = DEV_EVENTS.map((e, index) => {
    const startsAt = new Date(midnight.getTime() + e.inDays * 86_400_000 + (e.hour - 2) * 3_600_000);
    const place = "spotSlug" in e ? spots.get(e.spotSlug) : undefined;
    return {
      id: eventId(index + 1),
      organizerId: DEV_ORGANIZER_ID,
      organizerName: e.organizerName,
      title: e.title,
      description: e.description,
      venue: place?.name ?? ("venue" in e ? e.venue : "Campus de Vaise"),
      spotId: place?.id ?? null,
      startsAt,
      endsAt: new Date(startsAt.getTime() + e.hours * 3_600_000),
      schoolIds: e.schools.flatMap((slug) => schools.get(slug) ?? []),
    };
  });
  await db.insert(event).values(rows);

  const rsvps = rows.flatMap((row, index) => {
    const definition = DEV_EVENTS[index];
    const open = (m: DevMember) =>
      !definition ||
      definition.schools.length === 0 ||
      (definition.schools as readonly string[]).includes(m.schoolSlug);
    const r = random.fork(`event-${index}`);
    return r
      .sample(
        members.filter((m) => m.index > 2 && open(m)),
        r.int(8, 40),
      )
      .map((m) => ({
        eventId: row.id,
        userId: m.id,
        status: r.chance(0.7) ? ("going" as const) : ("maybe" as const),
        shareWithMatches: r.chance(0.4),
      }));
  });
  const [first] = rows;
  if (first) {
    rsvps.push(
      { eventId: first.id, userId: devMemberId(1), status: "going", shareWithMatches: true },
      { eventId: first.id, userId: devMemberId(2), status: "going", shareWithMatches: true },
    );
  }
  await db.insert(eventRsvp).values(rsvps);
  return rows.length;
}
