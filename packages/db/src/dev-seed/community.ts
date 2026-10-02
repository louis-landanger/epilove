import { LYON_CAMPUS, questionForWeek, recentWeeks } from "@epilove/core";
import type { Database } from "../client";
import { activeWeeklyBank } from "../repositories/campus-community";
import { weeklyAnswer } from "../schema";
import type { DevMember } from "./members";
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
