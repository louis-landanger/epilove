import { boolean, check, doublePrecision, integer, pgTable, text } from "drizzle-orm/pg-core";
import { id, oneOf } from "./columns";

export const SPOT_KINDS = ["park", "square", "riverbank", "viewpoint"] as const;
export const SPOT_AREAS = ["presquile", "vieux-lyon", "rive-gauche", "confluence", "vaise", "nord"] as const;

/**
 * Spots (IRL-02): real public places around the Vaise campus and the
 * Presqu'île, good for a first date. Public places only (parks, squares,
 * riverbanks): no businesses, so no advertising and nothing made up.
 */
export const spot = pgTable(
  "spot",
  {
    id: id(),
    slug: text().notNull().unique(),
    nameFr: text().notNull(),
    nameEn: text().notNull(),
    kind: text({ enum: SPOT_KINDS }).notNull(),
    area: text({ enum: SPOT_AREAS }).notNull(),
    latitude: doublePrecision().notNull(),
    longitude: doublePrecision().notNull(),
    descriptionFr: text().notNull(),
    descriptionEn: text().notNull(),
    position: integer().notNull().default(0),
    active: boolean().notNull().default(true),
  },
  (t) => [
    check("spot_kind_check", oneOf(t.kind, SPOT_KINDS)),
    check("spot_area_check", oneOf(t.area, SPOT_AREAS)),
  ],
);
