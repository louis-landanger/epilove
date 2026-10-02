import { calendarDateIn, LYON_CAMPUS, uuidv7 } from "@epilove/core";
import { emailHmac, encryptText, type KeyRing } from "@epilove/crypto";
import { and, gte, inArray, lte, sql } from "drizzle-orm";
import type { Database } from "../client";
import {
  appUser,
  block,
  consent,
  hiddenContact,
  interest,
  likeAction,
  match,
  message,
  messageRead,
  notification,
  photo,
  preferences,
  profile,
  profileInterest,
  prompt,
  promptAnswer,
  question,
  questionAnswer,
  school,
} from "../schema";
import { runSeeds } from "../seeds";
import { seedDevBadgesAndAvailability, seedDevWeeklyAnswers } from "./community";
import { DEV_INTERESTS, DEV_PROMPTS, PRONOUNS } from "./content";
import { seedDevEvents } from "./events";
import { planActivity } from "./graph";
import { DEV_ID_RANGE, type DevMember, generateMembers } from "./members";
import { PHOTO_HEIGHT, PHOTO_WIDTH, syntheticPhoto } from "./photos";
import { Random } from "./random";
import type { DevStorage } from "./storage";

// Reused by the Pact's dry runs on synthetic populations (apps/worker/src/tasks/pact).
export { type DevMember, generateMembers } from "./members";
export { Random } from "./random";

export const DEV_SEED = 20_261_002;

export interface DevSeedOptions {
  readonly db: Database;
  readonly keyRing: KeyRing;
  readonly emailHmacSecret: string;
  /** Null skips picture uploads (tests). */
  readonly storage: DevStorage | null;
  readonly now?: Date;
  readonly log?: (line: string) => void;
}

export interface DevSeedSummary {
  readonly members: number;
  readonly photos: number;
  readonly likes: number;
  readonly matches: number;
  readonly messages: number;
}

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

/** Deterministic ids for seeded rows that other rows point to (photos, prompt answers). */
const photoId = (member: DevMember, position: number) =>
  `de000001-0000-7000-8000-${String(member.index).padStart(8, "0")}${String(position).padStart(4, "0")}`;
const promptAnswerId = (member: DevMember, position: number) =>
  `de000002-0000-7000-8000-${String(member.index).padStart(8, "0")}${String(position).padStart(4, "0")}`;
export const photoStorageKey = (member: DevMember, position: number) =>
  `dev/members/${member.id}/${position}.png`;

async function insertInChunks<T>(rows: readonly T[], insert: (chunk: T[]) => Promise<unknown>, size = 500) {
  for (let start = 0; start < rows.length; start += size) {
    await insert(rows.slice(start, start + size));
  }
}

/** Random bytes for message ids, from the seeded generator. */
const bytes = (random: Random, length: number) => Uint8Array.from({ length }, () => random.int(0, 255));

/**
 * Development data set (`pnpm db:seed:dev`): 400 fictional members with
 * photos, prompts, questionnaire answers, likes, matches and conversations.
 *
 * Idempotent: development members (ids starting with `de000000-`) are deleted
 * then recreated identically, so a run always ends in the same state. Anything
 * created through the app with those members is reset.
 */
export async function runDevSeed(options: DevSeedOptions): Promise<DevSeedSummary> {
  const { db, keyRing, emailHmacSecret, storage } = options;
  const now = options.now ?? new Date();
  const log = options.log ?? (() => {});
  const random = new Random(DEV_SEED);

  await runSeeds(db);

  await db
    .insert(prompt)
    .values(DEV_PROMPTS.map(({ slug, textFr, textEn, category }) => ({ slug, textFr, textEn, category })))
    .onConflictDoUpdate({
      target: prompt.slug,
      set: { textFr: sql`excluded.text_fr`, textEn: sql`excluded.text_en`, category: sql`excluded.category` },
    });
  await db
    .insert(interest)
    .values([...DEV_INTERESTS])
    .onConflictDoUpdate({
      target: interest.slug,
      set: {
        labelFr: sql`excluded.label_fr`,
        labelEn: sql`excluded.label_en`,
        category: sql`excluded.category`,
      },
    });

  const schools = new Map(
    (await db.select({ id: school.id, slug: school.slug }).from(school)).map((s) => [s.slug, s.id]),
  );
  const questions = new Map(
    (await db.select({ id: question.id, slug: question.slug }).from(question)).map((q) => [q.slug, q.id]),
  );
  const prompts = await db
    .select({ id: prompt.id, slug: prompt.slug })
    .from(prompt)
    .where(
      inArray(
        prompt.slug,
        DEV_PROMPTS.map((p) => p.slug),
      ),
    );
  const promptIds = new Map(prompts.map((p) => [p.slug, p.id]));
  const interests = await db
    .select({ id: interest.id })
    .from(interest)
    .where(
      inArray(
        interest.slug,
        DEV_INTERESTS.map((i) => i.slug),
      ),
    );

  const members = generateMembers(random.fork("members"));
  const activity = planActivity(random.fork("activity"), members);
  const byId = new Map(members.map((m) => [m.id, m]));

  log(`Resetting ${members.length} development members…`);
  await db.delete(appUser).where(and(gte(appUser.id, DEV_ID_RANGE.from), lte(appUser.id, DEV_ID_RANGE.to)));

  const hmacs = new Map(members.map((m) => [m.id, emailHmac(emailHmacSecret, m.email)]));
  const today = calendarDateIn(LYON_CAMPUS.timeZone, now);

  await insertInChunks(members, (chunk) =>
    db.insert(appUser).values(
      chunk.map((m) => {
        const schoolId = schools.get(m.schoolSlug);
        if (!schoolId) {
          throw new Error(`Unknown school ${m.schoolSlug}: run pnpm db:seed first.`);
        }
        return {
          id: m.id,
          schoolId,
          email: m.email,
          emailHmac: hmacs.get(m.id) as string,
          emailVerified: true,
          name: m.firstName,
          status: m.status,
          verifiedAt: new Date(now.getTime() - 40 * DAY),
          lastActiveAt: new Date(now.getTime() - m.inactiveDays * DAY - m.index * 60_000),
          createdAt: new Date(now.getTime() - (30 + (m.index % 20)) * DAY),
        };
      }),
    ),
  );

  const contentRandom = random.fork("content");
  const answersByMember = new Map<string, { promptSlug: string; text: string }[]>();
  for (const m of members) {
    const chosen = contentRandom.sample(DEV_PROMPTS, m.status === "onboarding" ? contentRandom.int(0, 2) : 3);
    answersByMember.set(
      m.id,
      chosen.map((p) => ({ promptSlug: p.slug, text: contentRandom.pick(p.answers) })),
    );
  }

  await insertInChunks(members, (chunk) =>
    db.insert(profile).values(
      chunk.map((m) => {
        const promptCount = answersByMember.get(m.id)?.length ?? 0;
        return {
          userId: m.id,
          firstName: m.firstName,
          birthDate: m.birthDate,
          gender: m.gender,
          pronouns: PRONOUNS[m.gender],
          program: m.program,
          graduationYear: m.graduationYear,
          languages: [...m.languages],
          intentions: [...m.intentions],
          completeness: Math.min(100, 40 + m.photoCount * 10 + promptCount * 10),
        };
      }),
    ),
  );

  await insertInChunks(members, (chunk) =>
    db.insert(preferences).values(
      chunk.map((m) => ({
        userId: m.id,
        modes: [...m.modes],
        interestedIn: [...m.interestedIn],
        ageMin: m.ageMin,
        ageMax: m.ageMax,
        hideFromOwnSchool: m.hideFromOwnSchool,
        hideFromOwnYear: m.hideFromOwnYear,
        incognito: m.incognito,
      })),
    ),
  );

  await insertInChunks(
    members.flatMap((m) => [
      { userId: m.id, kind: "terms" as const, version: "dev" },
      { userId: m.id, kind: "privacy" as const, version: "dev" },
      ...(m.modes.includes("love")
        ? [{ userId: m.id, kind: "sensitive_data" as const, version: "dev" }]
        : []),
    ]),
    (chunk) => db.insert(consent).values(chunk),
  );

  const photoRows = members.flatMap((m) =>
    Array.from({ length: m.photoCount }, (_, position) => ({
      id: photoId(m, position),
      userId: m.id,
      storageKey: photoStorageKey(m, position),
      position,
      width: PHOTO_WIDTH,
      height: PHOTO_HEIGHT,
      altText: "Composition abstraite générée pour le développement",
      status: "approved" as const,
    })),
  );
  await insertInChunks(photoRows, (chunk) => db.insert(photo).values(chunk));

  await insertInChunks(
    members.flatMap((m) =>
      (answersByMember.get(m.id) ?? []).map((answer, position) => ({
        id: promptAnswerId(m, position),
        userId: m.id,
        promptId: promptIds.get(answer.promptSlug) as string,
        text: answer.text,
        position,
      })),
    ),
    (chunk) => db.insert(promptAnswer).values(chunk),
  );

  const interestRandom = random.fork("interests");
  await insertInChunks(
    members.flatMap((m) =>
      interestRandom
        .sample(interests, interestRandom.int(3, 6))
        .map((i) => ({ userId: m.id, interestId: i.id })),
    ),
    (chunk) => db.insert(profileInterest).values(chunk),
  );

  await insertInChunks(
    members.flatMap((m) =>
      m.answers.map((a) => ({
        userId: m.id,
        questionId: questions.get(a.questionSlug) as string,
        answer: a.answer,
        acceptable: [...a.acceptable],
        importance: a.importance,
      })),
    ),
    (chunk) => db.insert(questionAnswer).values(chunk),
  );

  if (activity.blocks.length > 0) {
    await db
      .insert(block)
      .values(activity.blocks.map(([blockerId, blockedId]) => ({ blockerId, blockedId })));
  }
  if (activity.hiddenContacts.length > 0) {
    await db
      .insert(hiddenContact)
      .values(
        activity.hiddenContacts.map(([userId, hiddenId]) => ({
          userId,
          emailHmac: hmacs.get(hiddenId) as string,
        })),
      )
      .onConflictDoNothing();
  }

  await insertInChunks(activity.likes, (chunk) =>
    db.insert(likeAction).values(
      chunk.map((plan) => {
        const target = byId.get(plan.targetId) as DevMember;
        const contentId =
          plan.content?.type === "photo"
            ? photoId(target, Math.min(plan.content.position, Math.max(0, target.photoCount - 1)))
            : plan.content?.type === "prompt"
              ? promptAnswerId(
                  target,
                  Math.min(plan.content.position, (answersByMember.get(target.id)?.length ?? 1) - 1),
                )
              : null;
        const hasContent = contentId !== null && !(plan.content?.type === "photo" && target.photoCount === 0);
        return {
          actorId: plan.actorId,
          targetId: plan.targetId,
          kind: plan.kind,
          targetContentType: hasContent ? (plan.content?.type ?? null) : null,
          targetContentId: hasContent ? contentId : null,
          comment: plan.comment,
          createdAt: new Date(now.getTime() - plan.hoursAgo * HOUR),
        };
      }),
    ),
  );

  const messageRandom = random.fork("messages");
  let messageCount = 0;
  for (const plan of activity.matches) {
    const [userLow, userHigh] = plan.userA < plan.userB ? [plan.userA, plan.userB] : [plan.userB, plan.userA];
    const createdAt = new Date(now.getTime() - plan.hoursAgo * HOUR);
    const times = plan.messages.map((m) =>
      Math.min(createdAt.getTime() + m.minutesAfterMatch * 60_000, now.getTime() - 60_000),
    );
    const [inserted] = await db
      .insert(match)
      .values({
        userLow,
        userHigh,
        mode: plan.mode,
        source: "like",
        createdAt,
        lastMessageAt: times.length > 0 ? new Date(Math.max(...times)) : null,
      })
      .returning({ id: match.id });
    if (!inserted || plan.messages.length === 0) {
      continue;
    }
    // Keep ids strictly increasing even when two messages share a millisecond.
    let previous = 0;
    const rows = plan.messages.map((m, i) => {
      const time = Math.max(times[i] as number, previous + 1);
      previous = time;
      const encrypted = encryptText(keyRing, m.text);
      return {
        id: uuidv7(time, bytes(messageRandom, 10)),
        matchId: inserted.id,
        senderId: m.senderId,
        kind: "text" as const,
        bodyEncrypted: encrypted.data,
        keyId: encrypted.keyId,
        createdAt: new Date(time),
      };
    });
    await db.insert(message).values(rows);
    messageCount += rows.length;

    const reads = [userLow, userHigh].flatMap((userId) => {
      const unread = plan.unreadFor.get(userId) ?? 0;
      const lastRead = rows[rows.length - 1 - unread];
      return lastRead ? [{ matchId: inserted.id, userId, lastReadMessageId: lastRead.id }] : [];
    });
    if (reads.length > 0) {
      await db.insert(messageRead).values(reads);
    }
  }

  // Notification centre (NOT-02): one entry per like received and per match, already pushed.
  const matchedPairs = new Set(activity.matches.map((m) => [m.userA, m.userB].sort().join("|")));
  const notificationRows = [
    ...activity.likes
      .filter(
        (like) => like.kind !== "pass" && !matchedPairs.has([like.actorId, like.targetId].sort().join("|")),
      )
      .map((like) => ({
        userId: like.targetId,
        type: like.kind === "superlike" ? "superlike_received" : "like_received",
        payload: {},
        createdAt: new Date(now.getTime() - like.hoursAgo * HOUR),
        readAt: like.hoursAgo > 48 ? new Date(now.getTime() - (like.hoursAgo - 2) * HOUR) : null,
        pushedAt: new Date(now.getTime() - like.hoursAgo * HOUR),
      })),
    ...activity.matches.flatMap((m) =>
      [m.userA, m.userB].map((userId) => ({
        userId,
        type: "match_created",
        payload: {},
        createdAt: new Date(now.getTime() - m.hoursAgo * HOUR),
        readAt: m.hoursAgo > 24 ? new Date(now.getTime() - (m.hoursAgo - 1) * HOUR) : null,
        pushedAt: new Date(now.getTime() - m.hoursAgo * HOUR),
      })),
    ),
  ];
  await insertInChunks(notificationRows, (chunk) => db.insert(notification).values(chunk));

  const events = await seedDevEvents(db, { members, schools, now, random: random.fork("events") });
  log(`${events} campus events.`);
  const weekly = await seedDevWeeklyAnswers(db, { members, now, random: random.fork("weekly") });
  log(`${weekly} answers to the questions of the week.`);
  await seedDevBadgesAndAvailability(db, now);

  if (storage) {
    await storage.ensureBucket();
    let uploaded = 0;
    const photoRandom = random.fork("photos");
    const jobs = members.flatMap((m) =>
      Array.from({ length: m.photoCount }, (_, position) => ({
        member: m,
        position,
        stream: photoRandom.fork(`${m.id}/${position}`),
      })),
    );
    const queue = [...jobs];
    await Promise.all(
      Array.from({ length: 8 }, async () => {
        for (let job = queue.shift(); job; job = queue.shift()) {
          const key = photoStorageKey(job.member, job.position);
          if (await storage.exists(key)) {
            continue;
          }
          await storage.put(key, syntheticPhoto(job.stream, job.member.schoolSlug), "image/png");
          uploaded++;
          if (uploaded % 100 === 0) {
            log(`  ${uploaded} pictures uploaded…`);
          }
        }
      }),
    );
  }

  log(`Development data ready for ${today}.`);
  return {
    members: members.length,
    photos: photoRows.length,
    likes: activity.likes.length,
    matches: activity.matches.length,
    messages: messageCount,
  };
}
