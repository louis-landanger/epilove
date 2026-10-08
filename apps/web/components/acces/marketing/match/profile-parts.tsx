"use client";

import { SCHOOLS } from "@atomes/core";
import { schoolColors } from "@atomes/tokens";
import { useTranslations } from "next-intl";
import type { CSSProperties } from "react";
import { SchoolGlyph } from "../school-glyph";
import { PEOPLE, type PersonKey } from "./people";

/** Second colour of each picture's glow, next to the school's. */
const ACCENTS = {
  plasma: "var(--color-plasma)",
  volt: "var(--color-volt)",
  violet: "oklch(0.6 0.2 295)",
} as const;

const SCHOOL_NAMES: Record<string, string> = Object.fromEntries(
  SCHOOLS.map((school) => [school.slug, school.name]),
);

export function schoolName(person: PersonKey): string {
  return SCHOOL_NAMES[PEOPLE[person].school] ?? "";
}

/** The glow colours of a fictional student's card: their school's, and their accent. */
export function cardStyle(key: PersonKey): CSSProperties {
  const person = PEOPLE[key];
  return {
    "--glow-a": schoolColors[person.school],
    "--glow-b": ACCENTS[person.accent],
  } as CSSProperties;
}

/** The synthetic picture of a profile card: never a face, the person's colours and symbol. */
export function ProfilePicture({ person: key }: { person: PersonKey }) {
  const person = PEOPLE[key];
  return (
    <div className="profile-picture">
      <span className="profile-promo">{person.promo}</span>
      <i className="profile-orbit" />
      <span className="profile-symbol">{person.symbol}</span>
    </div>
  );
}

/** Name and age, school, mode and one prompt. */
export function ProfileBody({ person: key, shown = true }: { person: PersonKey; shown?: boolean }) {
  const t = useTranslations("home.match");
  const person = PEOPLE[key];
  return (
    <div className="profile-body" data-shown={shown || undefined}>
      <p className="profile-name">
        {person.name} <span>{person.age}</span>
      </p>
      <p className="profile-tags">
        <span>
          <SchoolGlyph slug={person.school} className="size-3" />
          {SCHOOL_NAMES[person.school]}
        </span>
        <span className="profile-mode" data-mode={person.mode}>
          {t(person.mode)}
        </span>
      </p>
      <div className="profile-prompt">
        <span>{t(`people.${key}.prompt`)}</span>
        <p>{t(`people.${key}.answer`)}</p>
      </div>
    </div>
  );
}
