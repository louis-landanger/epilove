import { asc, eq } from "drizzle-orm";
import type { Database } from "../client";
import { spot } from "../schema";

/** Campus life (IRL-02 Spots for now): public catalogues, no personal data. */
export async function listSpots(db: Database) {
  return db.select().from(spot).where(eq(spot.active, true)).orderBy(asc(spot.position));
}

export async function spotById(db: Database, id: string) {
  const [row] = await db.select().from(spot).where(eq(spot.id, id));
  return row ?? null;
}
