import { LYON_CAMPUS, SCHOOLS } from "@atomes/core";
import type { Database } from "../client";
import { campus, school } from "../schema";

/** Idempotent reference data: the Lyon campus and its schools (from @atomes/core). */
export async function seedReferenceData(db: Database) {
  const [lyon] = await db
    .insert(campus)
    .values({ slug: LYON_CAMPUS.slug, name: LYON_CAMPUS.name, timeZone: LYON_CAMPUS.timeZone })
    .onConflictDoUpdate({
      target: campus.slug,
      set: { name: LYON_CAMPUS.name, timeZone: LYON_CAMPUS.timeZone },
    })
    .returning({ id: campus.id });
  if (!lyon) {
    throw new Error("Could not upsert the Lyon campus.");
  }

  for (const definition of SCHOOLS) {
    await db
      .insert(school)
      .values({
        campusId: lyon.id,
        slug: definition.slug,
        name: definition.name,
        emailDomains: [...definition.emailDomains],
      })
      .onConflictDoUpdate({
        target: school.slug,
        set: { campusId: lyon.id, name: definition.name, emailDomains: [...definition.emailDomains] },
      });
  }
}
