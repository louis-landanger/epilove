import { calendarDateIn, LYON_CAMPUS, PACT_RULES, type PactParticipant } from "@epilove/core";
import { QUESTIONS } from "@epilove/db";
import { generateMembers, Random } from "@epilove/db/dev-seed";

/**
 * Synthetic campus for dry runs of the Pact (docs/06-matching.md, section 9:
 * "rejoué à blanc sur des données synthétiques"). Built in memory from the
 * development population generator, scaled to `count`; nothing is written.
 */
export function syntheticPact(count: number, seed: number, now: Date) {
  const members = generateMembers(new Random(seed), count);
  const participants: PactParticipant[] = members
    .filter(
      (m) =>
        (m.status === "active" || m.status === "restricted") && m.answers.length >= PACT_RULES.minAnswers,
    )
    .map((m) => ({
      member: {
        id: m.id,
        status: m.status,
        profileComplete: m.photoCount > 0,
        schoolSlug: m.schoolSlug,
        graduationYear: m.graduationYear,
        birthDate: m.birthDate,
        gender: m.gender,
        modes: m.modes,
        interestedIn: m.interestedIn,
        ageRange: { min: m.ageMin, max: m.ageMax },
        hideFromOwnSchool: m.hideFromOwnSchool,
        hideFromOwnYear: m.hideFromOwnYear,
        incognito: m.incognito,
        emailHmac: `synthetic-${m.index}`,
        hiddenEmailHmacs: new Set<string>(),
        // Everyone who just took the questionnaire was active recently.
        lastActiveOn: calendarDateIn(LYON_CAMPUS.timeZone, now),
      },
      modes: m.modes,
      answers: new Map(
        m.answers.map((a) => [
          a.questionSlug,
          { answer: a.answer, acceptable: new Set(a.acceptable), importance: a.importance },
        ]),
      ),
    }));
  return {
    population: members.length,
    participants,
    sectionOf: new Map(QUESTIONS.map((q) => [q.slug, q.section as string])),
    sections: [...new Set(QUESTIONS.map((q) => q.section as string))],
  };
}
