import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { ageOn } from "../people/age";
import {
  academicYearOf,
  adulthoodDate,
  checkBirthDate,
  defaultAgeRange,
  effectiveModes,
  graduationYearRange,
  isValidAgeRange,
  missingSteps,
  nextReverificationDue,
  nextStep,
  ONBOARDING_STEPS,
  type OnboardingProgress,
} from "./onboarding";

const today = "2026-10-02";

const complete: OnboardingProgress = {
  charterAccepted: true,
  firstName: "Camille",
  birthDate: "2005-04-12",
  gender: "woman",
  modes: ["love", "friends"],
  sensitiveConsent: true,
  interestedIn: ["man", "nonbinary"],
  audienceSet: true,
  photos: 2,
  promptAnswers: 3,
  interests: 5,
  graduationYear: 2028,
  campusDeclared: true,
};

const empty: OnboardingProgress = {
  charterAccepted: false,
  firstName: null,
  birthDate: null,
  gender: null,
  modes: [],
  sensitiveConsent: false,
  interestedIn: [],
  audienceSet: false,
  photos: 0,
  promptAnswers: 0,
  interests: 0,
  graduationYear: null,
  campusDeclared: false,
};

describe("missingSteps", () => {
  it("is empty for a complete profile", () => {
    expect(missingSteps(complete, today)).toEqual([]);
    expect(nextStep(complete, today)).toBeNull();
  });

  it("lists every step, in order, for a new account", () => {
    expect(missingSteps(empty, today)).toEqual([...ONBOARDING_STEPS]);
    expect(nextStep(empty, today)).toBe("charter");
  });

  it("never lets a minor through, even with everything else filled in", () => {
    expect(missingSteps({ ...complete, birthDate: "2009-01-01" }, today)).toEqual(["birth"]);
  });

  it("requires the sensitive-data consent and genders for Love mode only", () => {
    expect(missingSteps({ ...complete, sensitiveConsent: false }, today)).toEqual(["audience"]);
    expect(missingSteps({ ...complete, interestedIn: [] }, today)).toEqual(["audience"]);
    expect(
      missingSteps({ ...complete, modes: ["friends"], sensitiveConsent: false, interestedIn: [] }, today),
    ).toEqual([]);
  });

  it("enforces the photo, prompt and interest minimums", () => {
    expect(missingSteps({ ...complete, photos: 1 }, today)).toEqual(["photos"]);
    expect(missingSteps({ ...complete, promptAnswers: 2 }, today)).toEqual(["prompts"]);
    expect(missingSteps({ ...complete, interests: 2 }, today)).toEqual(["interests"]);
    expect(missingSteps({ ...complete, interests: 11 }, today)).toEqual(["interests"]);
  });

  it("requires the campus declaration (ONB-12)", () => {
    expect(missingSteps({ ...complete, campusDeclared: false }, today)).toEqual(["campus"]);
  });
});

describe("effectiveModes", () => {
  it("drops Love mode without the sensitive-data consent", () => {
    expect(effectiveModes(["love", "friends"], false)).toEqual(["friends"]);
    expect(effectiveModes(["love"], false)).toEqual(["friends"]);
    expect(effectiveModes(["love"], true)).toEqual(["love"]);
    expect(effectiveModes(["love", "love"], true)).toEqual(["love"]);
  });
});

describe("checkBirthDate", () => {
  it("accepts an adult and blocks a minor", () => {
    expect(checkBirthDate("2008-10-02", today)).toEqual({ ok: true });
    expect(checkBirthDate("2008-10-03", today)).toEqual({ ok: false, reason: "underage" });
  });

  it("rejects impossible, future and implausible dates", () => {
    expect(checkBirthDate("2005-02-30", today)).toEqual({ ok: false, reason: "invalid" });
    expect(checkBirthDate("02/03/2005", today)).toEqual({ ok: false, reason: "invalid" });
    expect(checkBirthDate("2027-01-01", today)).toEqual({ ok: false, reason: "future" });
    expect(checkBirthDate("1900-01-01", today)).toEqual({ ok: false, reason: "implausible" });
  });

  it("agrees with ageOn for any date", () => {
    fc.assert(
      fc.property(
        fc.date({ min: new Date("1930-01-01"), max: new Date("2026-10-02"), noInvalidDate: true }),
        (date) => {
          const birthDate = date.toISOString().slice(0, 10);
          const result = checkBirthDate(birthDate, today);
          if (result.ok) {
            expect(ageOn(birthDate, today)).toBeGreaterThanOrEqual(18);
          } else if (result.reason === "underage") {
            expect(ageOn(birthDate, today)).toBeLessThan(18);
          }
        },
      ),
    );
  });
});

describe("adulthoodDate", () => {
  it("is the 18th birthday, 1 March for leap-day births in common years", () => {
    expect(adulthoodDate("2009-05-20")).toBe("2027-05-20");
    expect(adulthoodDate("2008-02-29")).toBe("2026-03-01");
    expect(adulthoodDate("2006-02-28")).toBe("2024-02-28");
  });

  it("is the first day checkBirthDate accepts", () => {
    fc.assert(
      fc.property(
        fc.date({ min: new Date("1990-01-01"), max: new Date("2026-10-02"), noInvalidDate: true }),
        (date) => {
          const birthDate = date.toISOString().slice(0, 10);
          const adult = adulthoodDate(birthDate);
          expect(checkBirthDate(birthDate, adult)).toEqual({ ok: true });
        },
      ),
    );
  });
});

describe("age range", () => {
  it("suggests a range around the member's age, never below 18", () => {
    expect(defaultAgeRange(18)).toEqual({ min: 18, max: 22 });
    expect(defaultAgeRange(23)).toEqual({ min: 20, max: 27 });
  });

  it("validates bounds", () => {
    expect(isValidAgeRange(18, 30)).toBe(true);
    expect(isValidAgeRange(17, 30)).toBe(false);
    expect(isValidAgeRange(25, 24)).toBe(false);
    expect(isValidAgeRange(18, 100)).toBe(false);
    expect(isValidAgeRange(18.5, 30)).toBe(false);
  });
});

describe("academic calendar", () => {
  it("starts the academic year in July", () => {
    expect(academicYearOf("2026-10-02")).toBe(2026);
    expect(academicYearOf("2027-06-30")).toBe(2026);
    expect(academicYearOf("2027-07-01")).toBe(2027);
  });

  it("offers this year's graduation up to six years ahead", () => {
    expect(graduationYearRange("2026-10-02")).toEqual({ min: 2027, max: 2032 });
  });

  it("schedules the re-verification after the next September", () => {
    expect(nextReverificationDue("2026-10-02")).toBe("2027-10-01");
    expect(nextReverificationDue("2027-08-15")).toBe("2028-10-01");
  });
});
