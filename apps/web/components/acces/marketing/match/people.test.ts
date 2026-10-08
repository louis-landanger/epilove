import { SCHOOLS } from "@atomes/core";
import { describe, expect, it } from "vitest";
import { messagesFor } from "../../../../i18n/messages";
import { MATCHES, PEOPLE } from "./people";

describe("hero matches", () => {
  it("only matches people of the hero, of age, from the five schools", () => {
    const slugs = SCHOOLS.map((school) => school.slug);
    for (const match of MATCHES) {
      expect(match.people[0]).not.toBe(match.people[1]);
      expect(match.score).toBeGreaterThanOrEqual(0);
      expect(match.score).toBeLessThanOrEqual(100);
      for (const key of match.people) {
        const person = PEOPLE[key];
        expect(person.age).toBeGreaterThanOrEqual(18);
        expect(slugs).toContain(person.school);
      }
    }
  });

  it("gives every person a prompt and an answer in every language", () => {
    for (const locale of ["fr", "en"] as const) {
      const people = messagesFor(locale).home.match.people as Record<
        string,
        { prompt: string; answer: string }
      >;
      for (const key of Object.keys(PEOPLE)) {
        expect(people[key]?.prompt, `${locale} ${key}`).toBeTruthy();
        expect(people[key]?.answer, `${locale} ${key}`).toBeTruthy();
      }
    }
  });
});
