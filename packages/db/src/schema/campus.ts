import { sql } from "drizzle-orm";
import { pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

const id = () => uuid("id").primaryKey().default(sql`uuidv7()`);

const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
};

/** A campus (Lyon today). Present from day one so other campuses can be added later. */
export const campus = pgTable("campus", {
  id: id(),
  slug: text("slug").notNull().unique(),
  name: text("name").notNull(),
  timeZone: text("time_zone").notNull(),
  ...timestamps,
});

/** An eligible school. Adding a school is a new row, not a code change. */
export const school = pgTable("school", {
  id: id(),
  campusId: uuid("campus_id")
    .notNull()
    .references(() => campus.id, { onDelete: "restrict" }),
  slug: text("slug").notNull().unique(),
  name: text("name").notNull(),
  emailDomains: text("email_domains").array().notNull(),
  ...timestamps,
});
