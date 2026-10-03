import type { MemberCard } from "@epilove/contracts";
import { type AnswerSheet, ageOn, badgesOf, type Mode } from "@epilove/core";
import type { Database } from "@epilove/db";
import { grantedBadgesOf } from "@epilove/db/repositories/campus-community";
import { loadProfileContent } from "@epilove/db/repositories/discovery";
import type { MemberRow } from "@epilove/db/repositories/members";
import { interestIdsOf } from "@epilove/db/repositories/members";
import { answerSheets, listActiveQuestions } from "@epilove/db/repositories/questionnaire";
import type { ApiServices } from "../context";
import { signVoiceUrl } from "../lib/voice-url";
import { hiddenPhotos } from "./blind";
import { type ContentLocale, compatibilityView } from "./compatibility";
import { signedPhotoUrl } from "./media";

/**
 * Builds member cards for the viewer. Callers must only pass members the
 * viewer is allowed to see (`canSee` / `canViewProfile`): the cards carry
 * signed photo and voice URLs.
 */
export async function buildCards(
  db: Database,
  services: Pick<ApiServices, "emailHmacSecret" | "now">,
  viewer: MemberRow,
  targets: readonly { row: MemberRow; modes: readonly Mode[] }[],
  locale: ContentLocale,
  today: string,
  options: { readonly blindDeck?: boolean } = {},
): Promise<MemberCard[]> {
  if (targets.length === 0) {
    return [];
  }
  const ids = targets.map((t) => t.row.member.id);
  const [content, questions, sheets, viewerInterests, granted, blind] = await Promise.all([
    loadProfileContent(db, ids),
    listActiveQuestions(db),
    answerSheets(db, [viewer.member.id, ...ids]),
    interestIdsOf(db, [viewer.member.id]),
    grantedBadgesOf(db, ids),
    hiddenPhotos(db, viewer.member.id, ids),
  ]);
  const mine = viewerInterests.get(viewer.member.id) ?? new Set<string>();
  const viewerSheet: AnswerSheet = sheets.get(viewer.member.id) ?? new Map();

  return targets.map(({ row, modes }) => {
    const c = content.get(row.member.id) ?? { photos: [], prompts: [], interests: [] };
    const sheet = sheets.get(row.member.id) ?? new Map();
    const isSelf = row.member.id === viewer.member.id;
    // Blind mode (DEC-10): no photo in the blind deck, nor before a blind match is revealed.
    const hidePhotos = !isSelf && (options.blindDeck === true || blind.hidden.has(row.member.id));
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
      blind: hidePhotos,
      photos: (hidePhotos ? [] : c.photos).map((p) => ({
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
        // A voice says as much as a photo: blind mode withholds both (DEC-10).
        voice: p.voice && !hidePhotos ? { url: signVoiceUrl(services, p.id), ...p.voice } : null,
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
      badges: badgesOf({
        createdAt: row.createdAt,
        photoVerified: row.photoVerified,
        campusVerified: row.campusVerified,
        granted: granted.get(row.member.id) ?? new Set(),
      }),
    };
  });
}
