import { describe, expect, it } from "vitest";
import { profileCompleteness } from "./completeness";
import { normalizeFirstName, normalizePromptAnswer, normalizePronouns } from "./rules";

describe("normalizeFirstName", () => {
  it("keeps first names from every script", () => {
    expect(normalizeFirstName("  Anne-Sophie ")).toBe("Anne-Sophie");
    expect(normalizeFirstName("Zoë")).toBe("Zoë");
    expect(normalizeFirstName("N’Golo")).toBe("N'Golo");
    expect(normalizeFirstName("Thị  Hương")).toBe("Thị Hương");
    expect(normalizeFirstName("Ελένη")).toBe("Ελένη");
    expect(normalizeFirstName("محمد")).toBe("محمد");
  });

  it("refuses handles, digits, links and empty values", () => {
    expect(normalizeFirstName("")).toBeNull();
    expect(normalizeFirstName("   ")).toBeNull();
    expect(normalizeFirstName("@camille")).toBeNull();
    expect(normalizeFirstName("Camille2")).toBeNull();
    expect(normalizeFirstName("insta.camille")).toBeNull();
    expect(normalizeFirstName("-Camille")).toBeNull();
    expect(normalizeFirstName("a".repeat(41))).toBeNull();
  });
});

describe("normalizePronouns", () => {
  it("accepts short free text and refuses links", () => {
    expect(normalizePronouns(" iel / elle ")).toBe("iel / elle");
    expect(normalizePronouns("")).toBeNull();
    expect(normalizePronouns("https://x.y")).toBeNull();
    expect(normalizePronouns("a".repeat(31))).toBeNull();
  });
});

describe("normalizePromptAnswer", () => {
  it("trims and limits blank lines", () => {
    expect(normalizePromptAnswer("  Le RU \r\n\r\n\r\n le mardi  ")).toBe("Le RU \n\n le mardi");
    expect(normalizePromptAnswer("x".repeat(200))).toHaveLength(200);
    expect(normalizePromptAnswer("x".repeat(201))).toBeNull();
    expect(normalizePromptAnswer(" \n ")).toBeNull();
  });
});

describe("profileCompleteness", () => {
  const minimal = {
    photos: 2,
    photosWithAltText: 0,
    promptAnswers: 3,
    interests: 3,
    hasProgram: false,
    languages: 0,
    hasAnthem: false,
    photoVerified: false,
  };

  it("scores a freshly onboarded profile and suggests what is missing", () => {
    const result = profileCompleteness(minimal);
    expect(result.score).toBe(58);
    expect(result.tips).toEqual([
      "add_photo",
      "verify_photo",
      "add_program",
      "add_languages",
      "add_anthem",
      "add_alt_text",
    ]);
  });

  it("reaches 100 with nothing left to suggest", () => {
    const result = profileCompleteness({
      photos: 6,
      photosWithAltText: 6,
      promptAnswers: 3,
      interests: 8,
      hasProgram: true,
      languages: 2,
      hasAnthem: true,
      photoVerified: true,
    });
    expect(result).toEqual({ score: 100, tips: [] });
  });

  it("never decreases when content is added", () => {
    const base = profileCompleteness(minimal).score;
    expect(profileCompleteness({ ...minimal, photos: 3 }).score).toBeGreaterThanOrEqual(base);
    expect(profileCompleteness({ ...minimal, hasProgram: true }).score).toBeGreaterThan(base);
    expect(profileCompleteness({ ...minimal, photosWithAltText: 1 }).score).toBeGreaterThan(base);
  });
});
