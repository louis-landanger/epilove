import { randomUUID } from "node:crypto";
import type { Gender, Importance, Mode } from "@epilove/core";
import { emailHmac } from "@epilove/crypto";
import { eq, inArray } from "drizzle-orm";
import type { Database } from "../client";
import { runMigrations } from "../migrations";
import {
  appUser,
  event,
  photo,
  preferences,
  profile,
  prompt,
  promptAnswer,
  question,
  questionAnswer,
  school,
} from "../schema";
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
  /** Answers to a test prompt, in order (blind mode shows prompts only, DEC-10). */
  readonly prompts?: readonly string[];
  readonly ageMin?: number;
  readonly ageMax?: number;
  readonly createdAt?: Date;
  /** Account role ("organizer" publishes campus events, IRL-01). */
  readonly role?: "user" | "organizer" | "moderator" | "admin";
  /** Fingerprint the address with this secret (secret crush tests); a placeholder otherwise. */
  readonly emailHmacSecret?: string;
}

let prepared: Promise<void> | undefined;
const created = new Set<string>();

/** Applies migrations and reference seeds once per test process. */
export function prepareTestDatabase(db: Database): Promise<void> {
  prepared ??= (async () => {
    await runMigrations(db);
    await runSeeds(db);
  })();
  return prepared;
}

/** School address of a fixture member (always on the EPITA domain). */
export const testMemberEmail = (id: string) => `test-${id}@epita.fr`;

export async function createTestMember(db: Database, options: TestMemberOptions = {}): Promise<string> {
  const id = randomUUID();
  created.add(id);
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
    email: testMemberEmail(id),
    emailHmac: options.emailHmacSecret
      ? emailHmac(options.emailHmacSecret, testMemberEmail(id))
      : `test-hmac-${id}`,
    emailVerified: true,
    name: options.firstName ?? "Test",
    status: options.status ?? "active",
    role: options.role ?? "user",
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
  if (options.prompts && options.prompts.length > 0) {
    // One test prompt per position: a member answers a given prompt only once.
    const slugs = options.prompts.map((_, position) => `test-prompt-${position + 1}`);
    await db
      .insert(prompt)
      .values(
        slugs.map((slug, position) => ({
          slug,
          textFr: `Un sujet de test (${position + 1})`,
          textEn: `A test topic (${position + 1})`,
          category: "test",
        })),
      )
      .onConflictDoNothing();
    const testPrompts = await db
      .select({ id: prompt.id, slug: prompt.slug })
      .from(prompt)
      .where(inArray(prompt.slug, slugs));
    const idOf = new Map(testPrompts.map((p) => [p.slug, p.id]));
    await db.insert(promptAnswer).values(
      options.prompts.map((text, position) => ({
        userId: id,
        promptId: idOf.get(slugs[position] ?? "") ?? "",
        text,
        position,
      })),
    );
  }
  return id;
}

/**
 * Deletes the members created by this test process (and, by cascade, their
 * likes, matches, messages…), so that repeated runs do not pile up data.
 */
export async function cleanupTestMembers(db: Database) {
  const ids = [...created];
  created.clear();
  if (ids.length > 0) {
    // Their events would otherwise outlive them (the organizer is set to null).
    await db.delete(event).where(inArray(event.organizerId, ids));
    await db.delete(appUser).where(inArray(appUser.id, ids));
  }
}

/**
 * Answers every active question with the same option (the first by default),
 * accepting only that option: two members answering alike are highly compatible.
 */
export async function answerQuestionnaire(
  db: Database,
  userId: string,
  options: { option?: number; importance?: Importance } = {},
): Promise<number> {
  const questions = await db
    .select({ id: question.id, options: question.options })
    .from(question)
    .where(eq(question.active, true));
  if (questions.length === 0) {
    return 0;
  }
  await db
    .insert(questionAnswer)
    .values(
      questions.map((q) => {
        const value = q.options[Math.min(options.option ?? 0, q.options.length - 1)]?.value ?? "";
        return {
          userId,
          questionId: q.id,
          answer: value,
          acceptable: [value],
          importance: options.importance ?? "somewhat",
        };
      }),
    )
    .onConflictDoNothing();
  return questions.length;
}
