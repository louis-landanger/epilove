import { type Database, schema } from "@atomes/db";
import { enrolMembers, type NewPactResult, saveResults, upsertSeason } from "@atomes/db/repositories/pact";
import { eq, sql } from "drizzle-orm";

/**
 * Data for the k6 load tests (docs/11: 3,000 realtime connections and the
 * Pact reveal peak). Fictional members in an id namespace of their own
 * (`10ad0000-…`), never mixed with development or real members, paired two
 * by two in a closed « Charge » season whose reveal is scheduled like a
 * real one: the worker reveals it, the clients measure.
 */
export const LOAD_ID_PREFIX = "10ad0000-0000-7000-8000-";
export const LOAD_SEASON_SLUG = "charge";

export const loadMemberId = (index: number) => `${LOAD_ID_PREFIX}${index.toString(16).padStart(12, "0")}`;

const GENDERS = ["woman", "man", "nonbinary"] as const;

/** Removes the load members (and by cascade their matches, messages, notifications) and the season. */
export async function clearLoad(db: Database) {
  await db.delete(schema.pactSeason).where(eq(schema.pactSeason.slug, LOAD_SEASON_SLUG));
  await db.delete(schema.appUser).where(sql`${schema.appUser.id}::text like ${`${LOAD_ID_PREFIX}%`}`);
}

/** Creates `count` members (even) and a computed season revealed at `revealAt`. Returns the season id. */
export async function prepareLoad(
  db: Database,
  options: { count: number; revealAt: Date; now: Date },
): Promise<string> {
  const count = options.count - (options.count % 2);
  await clearLoad(db);
  const schools = await db.select({ id: schema.school.id }).from(schema.school);
  if (schools.length === 0) {
    throw new Error("Reference data missing: run pnpm db:seed first.");
  }
  const ids = Array.from({ length: count }, (_, index) => loadMemberId(index));
  for (let start = 0; start < count; start += 500) {
    const chunk = ids.slice(start, start + 500);
    await db.insert(schema.appUser).values(
      chunk.map((id, offset) => ({
        id,
        schoolId: schools[(start + offset) % schools.length]?.id ?? "",
        email: `load-${start + offset}@load.invalid`,
        emailHmac: `load-hmac-${id}`,
        emailVerified: true,
        name: "Charge",
        status: "active" as const,
        lastActiveAt: options.now,
        createdAt: new Date(options.now.getTime() - 30 * 86_400_000),
      })),
    );
    await db.insert(schema.profile).values(
      chunk.map((id, offset) => ({
        userId: id,
        firstName: "Charge",
        birthDate: "2004-05-05",
        gender: GENDERS[(start + offset) % GENDERS.length] ?? "woman",
        graduationYear: 2028,
      })),
    );
    // A complete profile has an approved photo (`profileComplete`); the file itself is never fetched.
    await db.insert(schema.photo).values(
      chunk.map((id) => ({
        userId: id,
        storageKey: `load/${id}.png`,
        position: 0,
        status: "approved" as const,
      })),
    );
    await db
      .insert(schema.preferences)
      .values(
        chunk.map((id) => ({ userId: id, modes: ["friends"], interestedIn: [], ageMin: 18, ageMax: 35 })),
      );
  }

  const day = 86_400_000;
  const seasonId = await upsertSeason(db, {
    slug: LOAD_SEASON_SLUG,
    name: "Charge",
    opensAt: new Date(options.now.getTime() - 7 * day),
    closesAt: new Date(options.now.getTime() - 1000),
    revealAt: options.revealAt,
    status: "closed",
  });
  await enrolMembers(
    db,
    seasonId,
    ids.map((userId) => ({ userId, modes: ["friends"] as const })),
    options.now,
  );
  // Members 2k and 2k+1 are paired (ids sort in index order).
  const results: NewPactResult[] = [];
  for (let index = 0; index < count; index += 2) {
    results.push({
      mode: "friends",
      userLow: ids[index] ?? "",
      userHigh: ids[index + 1] ?? "",
      score: 0.8,
      explanation: null,
    });
  }
  const saved = await saveResults(db, { seasonId, now: options.now, results, report: { load: true } });
  if (saved !== "saved") {
    throw new Error("The load season could not be computed.");
  }
  return seasonId;
}
