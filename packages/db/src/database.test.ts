import { SCHOOLS } from "@atomes/core";
import { asc, eq } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import { createDatabase } from "./client";
import { runMigrations } from "./migrations";
import { campus, school } from "./schema";
import { seedReferenceData } from "./seeds/reference";

const url = process.env.DATABASE_URL;

/** Needs a disposable PostgreSQL (`pnpm services:up` locally, a service container in CI). */
describe.skipIf(!url)("database", () => {
  const { db, close } = createDatabase(url ?? "", { maxConnections: 1 });
  afterAll(close);

  it("applies the migrations", async () => {
    await runMigrations(db);
    const extensions = await db.execute<{ extname: string }>(
      "select extname from pg_extension where extname in ('vector', 'pg_trgm') order by extname",
    );
    expect(extensions.map((row) => row.extname)).toEqual(["pg_trgm", "vector"]);
  });

  it("seeds the campus and its schools idempotently", async () => {
    await seedReferenceData(db);
    await seedReferenceData(db);

    const schools = await db
      .select({ slug: school.slug, domains: school.emailDomains })
      .from(school)
      .innerJoin(campus, eq(school.campusId, campus.id))
      .where(eq(campus.slug, "lyon"))
      .orderBy(asc(school.slug));

    expect(schools).toEqual(
      [...SCHOOLS]
        .sort((a, b) => a.slug.localeCompare(b.slug))
        .map((definition) => ({ slug: definition.slug, domains: [...definition.emailDomains] })),
    );
  });

  it("generates time-ordered UUIDv7 identifiers", async () => {
    const [row] = await db.select({ id: campus.id }).from(campus).limit(1);
    expect(row?.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });
});
