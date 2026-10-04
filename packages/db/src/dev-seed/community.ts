import { LYON_CAMPUS, questionForWeek, recentWeeks } from "@atomes/core";
import { inArray } from "drizzle-orm";
import type { Database } from "../client";
import { activeWeeklyBank } from "../repositories/campus-community";
import { appUser, availability, memberBadge, weeklyAnswer } from "../schema";
import { type DevMember, devMemberId } from "./members";
import type { Random } from "./random";

/**
 * Answers to the questions of the week (COM-01) for the last eight weeks,
 * from about two thirds of the fictional members. Inès (member 1) has not
 * answered this week's yet, so the screen can be tried with her.
 */
export async function seedDevWeeklyAnswers(
  db: Database,
  input: { members: readonly DevMember[]; now: Date; random: Random },
): Promise<number> {
  const bank = await activeWeeklyBank(db);
  const weeks = recentWeeks(input.now, LYON_CAMPUS.timeZone);
  const rows = weeks.flatMap((week, age) => {
    const question = questionForWeek(bank, week);
    if (!question) {
      return [];
    }
    const r = input.random.fork(week);
    return input.members
      .filter((m) => !(age === 0 && m.index === 1) && r.chance(0.65))
      .map((m) => ({
        week,
        userId: m.id,
        questionId: question.id,
        option: r.pick(question.options).value,
      }));
  });
  for (let start = 0; start < rows.length; start += 1000) {
    await db.insert(weeklyAnswer).values(rows.slice(start, start + 1000));
  }
  return rows.length;
}

/**
 * A few granted badges (COM-04) and "Dispo" statuses (IRL-05) on the
 * personas, so that both show up in development.
 */
export async function seedDevBadgesAndAvailability(db: Database, now: Date) {
  await db.insert(memberBadge).values([
    { userId: devMemberId(2), badge: "ambassador" },
    { userId: devMemberId(3), badge: "ambassador" },
  ]);
  // "Photo vérifiée" comes from an approved gesture selfie (ONB-08).
  await db
    .update(appUser)
    .set({ photoVerifiedAt: now })
    .where(inArray(appUser.id, [devMemberId(1), devMemberId(2)]));
  await db.insert(availability).values([
    {
      userId: devMemberId(2),
      activity: "coffee",
      area: "campus",
      until: new Date(now.getTime() + 3 * 3_600_000),
    },
    {
      userId: devMemberId(4),
      activity: "study",
      area: "campus",
      until: new Date(now.getTime() + 2 * 3_600_000),
    },
  ]);
}
