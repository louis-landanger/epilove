import { pgTable, text, uuid } from "drizzle-orm/pg-core";
import { id, timestamps } from "./columns";

/** A campus (Lyon today). Present from day one so other campuses can be added later. */
export const campus = pgTable("campus", {
  id: id(),
  slug: text().notNull().unique(),
  name: text().notNull(),
  timeZone: text().notNull(),
  ...timestamps,
});

/** An eligible school. Adding a school is a new row, not a code change. */
export const school = pgTable("school", {
  id: id(),
  campusId: uuid()
    .notNull()
    .references(() => campus.id, { onDelete: "restrict" }),
  slug: text().notNull().unique(),
  name: text().notNull(),
  emailDomains: text().array().notNull(),
  ...timestamps,
});
