import { describe, expect, it } from "vitest";
import { parseSchoolEmail, SCHOOL_SLUGS, SCHOOLS } from "./schools";

describe("parseSchoolEmail", () => {
  it.each([
    ["prenom.nom@epita.fr", "epita"],
    ["Prenom.Nom@ESME.fr", "esme"],
    ["  prenom-nom@supbiotech.fr ", "supbiotech"],
    ["p.nom2@isg.fr", "isg"],
    ["prenom.nom@ipsa.fr", "ipsa"],
  ])("accepts %s", (input, slug) => {
    const result = parseSchoolEmail(input);
    expect(result.ok && result.school.slug).toBe(slug);
  });

  it("canonicalises case and plus addressing so one mailbox is one identity", () => {
    const plain = parseSchoolEmail("prenom.nom@epita.fr");
    const tagged = parseSchoolEmail("Prenom.Nom+atomes@Epita.fr");
    expect(plain.ok && plain.canonicalEmail).toBe("prenom.nom@epita.fr");
    expect(tagged.ok && tagged.canonicalEmail).toBe("prenom.nom@epita.fr");
  });

  it.each([
    "prenom.nom@epita.fr.example.com",
    "prenom.nom@lyon.epita.fr",
    "prenom.nom@gmail.com",
    "prenom.nom@epita.com",
  ])("refuses the domain of %s", (input) => {
    expect(parseSchoolEmail(input)).toEqual({ ok: false, reason: "domain_not_allowed" });
  });

  it.each([
    "",
    "prenom.nom",
    "@epita.fr",
    "+tag@epita.fr",
    "a@b@epita.fr",
    ".prenom@epita.fr",
    "prenom.@epita.fr",
    "pre..nom@epita.fr",
    "prénom@epita.fr",
    "pre nom@epita.fr",
    `${"a".repeat(65)}@epita.fr`,
  ])("refuses the malformed address %j", (input) => {
    expect(parseSchoolEmail(input)).toEqual({ ok: false, reason: "invalid_format" });
  });

  it("declares every school slug exactly once", () => {
    expect(SCHOOLS.map((school) => school.slug).sort()).toEqual([...SCHOOL_SLUGS].sort());
  });
});
