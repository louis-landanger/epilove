import type { MemberCard } from "@epilove/contracts";
import { type AnswerSheet, ageOn, badgesOf, type Mode } from "@epilove/core";
import type { Database } from "@epilove/db";
import { grantedBadgesOf } from "@epilove/db/repositories/campus-community";
import { loadProfileContent } from "@epilove/db/repositories/discovery";
import type { MemberRow } from "@epilove/db/repositories/members";
import { interestIdsOf } from "@epilove/db/repositories/members";
import { answerSheets, listActiveQuestions } from "@epilove/db/repositories/questionnaire";
import { type ContentLocale, compatibilityView } from "./compatibility";
import { signedPhotoUrl } from "./media";

/**
 * Builds member cards for the viewer. Callers must only pass members the
 * viewer is allowed to see (`canSee` / `canViewProfile`).
 */
export async function buildCards(
  db: Database,
  viewer: MemberRow,
  targets: readonly { row: MemberRow; modes: readonly Mode[] }[],
  locale: ContentLocale,
  today: string,
): Promise<MemberCard[]> {
  if (targets.length === 0) {
    return [];
  }
  const ids = targets.map((t) => t.row.member.id);
  const [content, questions, sheets, viewerInterests, granted] = await Promise.all([
    loadProfileContent(db, ids),
    listActiveQuestions(db),
    answerSheets(db, [viewer.member.id, ...ids]),
    interestIdsOf(db, [viewer.member.id]),
    grantedBadgesOf(db, ids),
  ]);
  const mine = viewerInterests.get(viewer.member.id) ?? new Set<string>();
  const viewerSheet: AnswerSheet = sheets.get(viewer.member.id) ?? new Map();

  return targets.map(({ row, modes }) => {
    const c = content.get(row.member.id) ?? { photos: [], prompts: [], interests: [] };
    const sheet = sheets.get(row.member.id) ?? new Map();
    const isSelf = row.member.id === viewer.member.id;
    return {
      userId: row.member.id,
      firstName: row.firstName,
      age: ageOn(row.member.birthDate, today),
      pronouns: row.pronouns,
      school: { slug: row.member.schoolSlug, name: row.schoolName },
      graduationYear: row.member.graduationYear,
      program: row.program,
      modes: [...modes],
      intentions: [...row.intentions],
      languages: [...row.languages],
      photos: c.photos.map((p) => ({
        id: p.id,
        url: signedPhotoUrl(p.storageKey, "card"),
        alt: p.altText,
        width: p.width,
        height: p.height,
      })),
      prompts: c.prompts.map((p) => ({
        id: p.id,
        question: locale === "en" ? p.questionEn : p.questionFr,
        answer: p.answer,
      })),
      interests: c.interests.map((i) => ({
        id: i.id,
        label: locale === "en" ? i.labelEn : i.labelFr,
        shared: !isSelf && mine.has(i.id),
      })),
      compatibility:
        isSelf || sheet.size === 0 || viewerSheet.size === 0
          ? null
          : compatibilityView(questions, viewerSheet, sheet, locale),
      badges: badgesOf({ createdAt: row.createdAt, granted: granted.get(row.member.id) ?? new Set() }),
    };
  });
}
