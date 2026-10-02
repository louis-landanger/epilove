import { describe, expect, it } from "vitest";
import { LOCALES, messagesFor } from "../../../../i18n/messages";
import { asLegalPage, LEGAL_PAGES, type LegalPageKey, splitPlaceholders } from "./legal-content";

describe("legal pages content", () => {
  it.each(LOCALES)("is well formed in %s", (locale) => {
    const legal = messagesFor(locale).legal;
    for (const key of Object.keys(LEGAL_PAGES) as LegalPageKey[]) {
      const page = asLegalPage(legal[key]);
      expect(page.sections.length).toBeGreaterThan(0);
      const ids = page.sections.map((section) => section.id);
      expect(new Set(ids).size).toBe(ids.length);
    }
  });

  it("covers what docs/08 and docs/06 require", () => {
    const legal = messagesFor("fr").legal;
    // No-break spaces (French typography) count as spaces here.
    const text = (value: unknown) => JSON.stringify(value).replace(/\s/g, " ");
    const privacy = text(legal.privacy);
    for (const needle of ["9.2.a", "HMAC", "CNIL", "Cloudflare", "Anthropic", "5 ans", "25 mois"]) {
      expect(privacy).toContain(needle);
    }
    const transparency = text(legal.transparency);
    for (const needle of ["inter-écoles", "apparence physique", "aléatoire", "article 27"]) {
      expect(transparency).toContain(needle);
    }
    expect(text(legal.legalNotice)).toContain("non affilié à IONIS Education Group");
  });

  it("rejects malformed content", () => {
    expect(() =>
      asLegalPage({ title: "x", description: "y", sections: [{ id: "a", title: "t", blocks: [42] }] }),
    ).toThrow();
    expect(() =>
      asLegalPage({
        title: "x",
        description: "y",
        sections: [
          { id: "a", title: "t", blocks: [{ table: { caption: "c", head: ["a", "b"], rows: [["1"]] } }] },
        ],
      }),
    ).toThrow();
  });
});

describe("splitPlaceholders", () => {
  it("isolates bracketed placeholders", () => {
    expect(splitPlaceholders("Siège : [adresse], Lyon.")).toEqual([
      { text: "Siège : ", placeholder: false },
      { text: "[adresse]", placeholder: true },
      { text: ", Lyon.", placeholder: false },
    ]);
    expect(splitPlaceholders("Rien à compléter.")).toEqual([
      { text: "Rien à compléter.", placeholder: false },
    ]);
  });
});
