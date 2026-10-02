import type { Gender, Importance, Mode, SchoolSlug } from "@epilove/core";
import { QUESTIONS } from "../seeds/questions";
import { FIRST_NAMES, PROGRAMS } from "./content";
import type { Random } from "./random";

/**
 * Generation of the fictional members (pure: no database, no network), so the
 * shape of the data set can be tested on its own.
 */

export const DEV_MEMBER_COUNT = 400;
const DEV_ID_PREFIX = "de000000-0000-7000-8000-";

/** Stable id of the n-th development member (1-based). Recognisable at a glance in the database. */
export const devMemberId = (index: number) => `${DEV_ID_PREFIX}${String(index).padStart(12, "0")}`;
export const DEV_ID_RANGE = { from: devMemberId(0), to: `${DEV_ID_PREFIX}ffffffffffff` } as const;

/** Headcount on the platform and share of women, from docs/00-vision.md orders of magnitude. */
const SCHOOL_MIX: Readonly<Record<SchoolSlug, { count: number; women: number; domain: string }>> = {
  epita: { count: 90, women: 0.13, domain: "epita.fr" },
  esme: { count: 95, women: 0.3, domain: "esme.fr" },
  ipsa: { count: 45, women: 0.22, domain: "ipsa.fr" },
  supbiotech: { count: 70, women: 0.75, domain: "supbiotech.fr" },
  isg: { count: 100, women: 0.55, domain: "isg.fr" },
};
const NONBINARY_SHARE = 0.03;

export type DevStatus = "active" | "paused" | "restricted" | "onboarding";

export interface DevAnswer {
  readonly questionSlug: string;
  readonly answer: string;
  readonly acceptable: readonly string[];
  readonly importance: Importance;
}

export interface DevMember {
  readonly index: number;
  readonly id: string;
  readonly persona: string | null;
  readonly email: string;
  readonly schoolSlug: SchoolSlug;
  readonly firstName: string;
  readonly gender: Gender;
  readonly birthDate: string;
  readonly graduationYear: number;
  readonly program: string;
  readonly languages: readonly string[];
  readonly intentions: readonly string[];
  readonly modes: readonly Mode[];
  readonly interestedIn: readonly Gender[];
  readonly ageMin: number;
  readonly ageMax: number;
  readonly hideFromOwnSchool: boolean;
  readonly hideFromOwnYear: boolean;
  readonly incognito: boolean;
  readonly status: DevStatus;
  /** Days since the member was last active. */
  readonly inactiveDays: number;
  readonly photoCount: number;
  readonly answers: readonly DevAnswer[];
  /** Index of the latent profile used to make questionnaire answers coherent. */
  readonly archetype: number;
}

interface PersonaSpec {
  readonly persona: string;
  readonly schoolSlug: SchoolSlug;
  readonly firstName: string;
  readonly gender: Gender;
  readonly birthDate: string;
  readonly graduationYear: number;
  readonly program: string;
  readonly modes: readonly Mode[];
  readonly interestedIn: readonly Gender[];
  readonly languages: readonly string[];
  readonly intentions: readonly string[];
  readonly hideFromOwnYear?: boolean;
}

/** The five personas of docs/00-vision.md, always members 1 to 5. */
export const PERSONAS: readonly PersonaSpec[] = [
  {
    persona: "ines",
    schoolSlug: "supbiotech",
    firstName: "Inès",
    gender: "woman",
    birthDate: "2006-03-14",
    graduationYear: 2029,
    program: "Biotechnologies",
    modes: ["love", "friends"],
    interestedIn: ["man"],
    languages: ["fr", "en"],
    intentions: ["relationship", "see_what_happens"],
  },
  {
    persona: "hugo",
    schoolSlug: "epita",
    firstName: "Hugo",
    gender: "man",
    birthDate: "2007-01-22",
    graduationYear: 2031,
    program: "Cycle prépa",
    modes: ["love", "friends"],
    interestedIn: ["woman"],
    languages: ["fr"],
    intentions: ["see_what_happens"],
    hideFromOwnYear: true,
  },
  {
    persona: "sarah",
    schoolSlug: "isg",
    firstName: "Sarah",
    gender: "woman",
    birthDate: "2004-06-02",
    graduationYear: 2027,
    program: "Programme Grande École",
    modes: ["love", "friends"],
    interestedIn: ["man", "woman"],
    languages: ["fr", "en", "es"],
    intentions: ["see_what_happens", "friendship"],
  },
  {
    persona: "malik",
    schoolSlug: "ipsa",
    firstName: "Malik",
    gender: "man",
    birthDate: "2005-09-10",
    graduationYear: 2030,
    program: "Prépa aéro",
    modes: ["friends", "love"],
    interestedIn: ["woman"],
    languages: ["en", "ar", "fr"],
    intentions: ["friendship", "see_what_happens"],
  },
  {
    persona: "camille",
    schoolSlug: "esme",
    firstName: "Camille",
    gender: "nonbinary",
    birthDate: "2006-04-19",
    graduationYear: 2029,
    program: "Énergie",
    modes: ["love", "friends"],
    interestedIn: ["woman", "man", "nonbinary"],
    languages: ["fr", "en"],
    intentions: ["relationship", "friendship"],
  },
];

const ARCHETYPES = 5;
const TODAY_YEAR = 2026;

const slugify = (value: string) =>
  value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z]/g, "");

function interestedInFor(random: Random, gender: Gender): Gender[] {
  if (gender === "nonbinary") {
    return random.pick<Gender[]>([
      ["woman", "man", "nonbinary"],
      ["woman", "nonbinary"],
      ["man", "nonbinary"],
    ]);
  }
  const other: Gender = gender === "woman" ? "man" : "woman";
  const choice = random.weighted({ straight: 82, gay: 7, bi: 9, all: 2 });
  switch (choice) {
    case "straight":
      return [other];
    case "gay":
      return [gender];
    case "bi":
      return [other, gender];
    case "all":
      return ["woman", "man", "nonbinary"];
  }
}

/**
 * Answers drawn from a latent profile: members sharing an archetype tend to
 * agree, which gives realistic compatibility scores (docs/06-matching.md).
 */
export function generateAnswers(random: Random, archetype: number, coverage: number): DevAnswer[] {
  const answers: DevAnswer[] = [];
  for (const [position, definition] of QUESTIONS.entries()) {
    if (!random.chance(coverage)) {
      continue;
    }
    const values = definition.options.map((option) => option.value);
    const preferred = values[(archetype * 7 + position * 3) % values.length] as string;
    const answer = random.chance(0.62) ? preferred : random.pick(values);
    const importance = random.weighted<Importance>({
      irrelevant: 8,
      little: 24,
      somewhat: 38,
      very: 26,
      mandatory: 4,
    });
    const acceptable = new Set<string>([answer]);
    if (random.chance(0.7)) {
      acceptable.add(preferred);
    }
    for (const value of values) {
      if (random.chance(importance === "mandatory" ? 0.1 : 0.35)) {
        acceptable.add(value);
      }
    }
    answers.push({ questionSlug: definition.slug, answer, acceptable: [...acceptable], importance });
  }
  return answers;
}

function birthDateFor(random: Random): string {
  // Between 18 and 25 years old in October 2026, never younger than 18.
  const year = random.int(2001, 2007);
  const month = random.int(1, year === 2007 ? 9 : 12);
  const day = random.int(1, 28);
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function ageIn2026(birthDate: string): number {
  return TODAY_YEAR - Number(birthDate.slice(0, 4)) - (birthDate.slice(5) > "10-02" ? 1 : 0);
}

/**
 * The development population. `count` scales the school mix: the default is
 * the seeded data set; larger populations (in memory only) feed the Pact's
 * dry runs (`pnpm pact:compute --synthetic 3000`).
 */
export function generateMembers(random: Random, count: number = DEV_MEMBER_COUNT): DevMember[] {
  const members: DevMember[] = [];
  const usedNames = new Map<string, number>();

  const slots: SchoolSlug[] = [];
  for (const [slug, mix] of Object.entries(SCHOOL_MIX) as [SchoolSlug, (typeof SCHOOL_MIX)[SchoolSlug]][]) {
    const personaCount = PERSONAS.filter((persona) => persona.schoolSlug === slug).length;
    const schoolCount = Math.round((mix.count * count) / DEV_MEMBER_COUNT);
    for (let i = 0; i < schoolCount - personaCount; i++) {
      slots.push(slug);
    }
  }
  const shuffledSlots = random.sample(slots, slots.length);

  const total = PERSONAS.length + shuffledSlots.length;
  for (let index = 1; index <= total; index++) {
    const r = random.fork(`member-${index}`);
    const persona = PERSONAS[index - 1];
    const schoolSlug = persona?.schoolSlug ?? (shuffledSlots[index - 1 - PERSONAS.length] as SchoolSlug);
    const mix = SCHOOL_MIX[schoolSlug];

    const gender: Gender =
      persona?.gender ?? (r.chance(NONBINARY_SHARE) ? "nonbinary" : r.chance(mix.women) ? "woman" : "man");
    const firstName = persona?.firstName ?? r.pick(FIRST_NAMES[gender]);
    const birthDate = persona?.birthDate ?? birthDateFor(r);
    const age = ageIn2026(birthDate);
    const modes: Mode[] = persona
      ? [...persona.modes]
      : r.weighted<"both" | "love" | "friends">({ both: 60, love: 25, friends: 15 }) === "both"
        ? ["love", "friends"]
        : r.chance(0.62)
          ? ["love"]
          : ["friends"];
    // Love mode requires the separate sensitive-data consent; without it, no orientation is stored.
    const interestedIn = modes.includes("love")
      ? [...(persona?.interestedIn ?? interestedInFor(r, gender))]
      : [];

    const nameKey = `${slugify(firstName)}`;
    const nameCount = (usedNames.get(nameKey) ?? 0) + 1;
    usedNames.set(nameKey, nameCount);

    const status: DevStatus = persona
      ? "active"
      : r.weighted<DevStatus>({ active: 92, paused: 3, restricted: 1, onboarding: 4 });

    members.push({
      index,
      id: devMemberId(index),
      persona: persona?.persona ?? null,
      email: `${nameKey}.dev${String(index).padStart(3, "0")}@${mix.domain}`,
      schoolSlug,
      firstName,
      gender,
      birthDate,
      graduationYear: persona?.graduationYear ?? r.int(2027, 2031),
      program: persona?.program ?? r.pick(PROGRAMS[schoolSlug] ?? ["Cycle ingénieur"]),
      languages: persona ? [...persona.languages] : r.chance(0.55) ? ["fr", "en"] : ["fr"],
      intentions: persona
        ? [...persona.intentions]
        : r.sample(
            modes.includes("love") ? ["relationship", "see_what_happens", "friendship"] : ["friendship"],
            r.int(1, 2),
          ),
      modes,
      interestedIn,
      ageMin: Math.max(18, age - r.int(1, 3)),
      ageMax: Math.max(age + r.int(2, 5), 21),
      hideFromOwnSchool: persona ? false : r.chance(0.08),
      hideFromOwnYear: persona?.hideFromOwnYear ?? r.chance(0.14),
      incognito: persona ? false : r.chance(0.03),
      status,
      inactiveDays: persona ? 0 : r.chance(0.06) ? r.int(22, 60) : r.int(0, 14),
      photoCount: status === "onboarding" ? (r.chance(0.5) ? 0 : 1) : r.int(2, 4),
      archetype: r.int(0, ARCHETYPES - 1),
      answers: [],
    });
  }

  // Questionnaire answers last, from their own random stream.
  return members.map((member) => {
    const r = random.fork(`answers-${member.index}`);
    const coverage = { all: 1, partial: 0.55, none: 0 } as const;
    const ratio = member.persona ? 1 : coverage[r.weighted({ all: 82, partial: 13, none: 5 })];
    return { ...member, answers: ratio === 0 ? [] : generateAnswers(r, member.archetype, ratio) };
  });
}
