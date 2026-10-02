import { randomUUID } from "node:crypto";
import type { Gender, Mode } from "@epilove/core";
import { eq } from "drizzle-orm";
import type { Database } from "../client";
import { runMigrations } from "../migrations";
import { appUser, photo, preferences, profile, school } from "../schema";
import { runSeeds } from "../seeds";

/**
 * Factories for integration tests. Every fixture member gets a random id and
 * address, so test files can run in parallel against the same database
 * without touching each other (or the development data set).
 */

export interface TestMemberOptions {
  readonly schoolSlug?: string;
  readonly firstName?: string;
  readonly gender?: Gender;
  readonly birthDate?: string;
  readonly graduationYear?: number;
  readonly modes?: readonly Mode[];
  readonly interestedIn?: readonly Gender[];
  readonly status?: "active" | "paused" | "restricted" | "suspended" | "banned" | "deleting" | "onboarding";
  readonly photos?: number;
  readonly ageMin?: number;
  readonly ageMax?: number;
  readonly createdAt?: Date;
}

let prepared: Promise<void> | undefined;

/** Applies migrations and reference seeds once per test process. */
export function prepareTestDatabase(db: Database): Promise<void> {
  prepared ??= (async () => {
    await runMigrations(db);
    await runSeeds(db);
  })();
  return prepared;
}

export async function createTestMember(db: Database, options: TestMemberOptions = {}): Promise<string> {
  const id = randomUUID();
  const [target] = await db
    .select({ id: school.id })
    .from(school)
    .where(eq(school.slug, options.schoolSlug ?? "epita"));
  if (!target) {
    throw new Error("Reference data missing: call prepareTestDatabase first.");
  }
  const gender = options.gender ?? "woman";
  const modes = [...(options.modes ?? ["love", "friends"])];
  await db.insert(appUser).values({
    id,
    schoolId: target.id,
    email: `test-${id}@epita.fr`,
    emailHmac: `test-hmac-${id}`,
    emailVerified: true,
    name: options.firstName ?? "Test",
    status: options.status ?? "active",
    lastActiveAt: new Date(),
    createdAt: options.createdAt ?? new Date(Date.now() - 30 * 86_400_000),
  });
  await db.insert(profile).values({
    userId: id,
    firstName: options.firstName ?? "Test",
    birthDate: options.birthDate ?? "2004-05-05",
    gender,
    graduationYear: options.graduationYear ?? 2028,
  });
  await db.insert(preferences).values({
    userId: id,
    modes,
    interestedIn: modes.includes("love") ? [...(options.interestedIn ?? ["woman", "man", "nonbinary"])] : [],
    ageMin: options.ageMin ?? 18,
    ageMax: options.ageMax ?? 35,
  });
  const photos = options.photos ?? 1;
  if (photos > 0) {
    await db.insert(photo).values(
      Array.from({ length: photos }, (_, position) => ({
        userId: id,
        storageKey: `test/${id}/${position}.png`,
        position,
        status: "approved" as const,
      })),
    );
  }
  return id;
}
