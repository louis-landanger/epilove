import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { AI_ICEBREAKER_RULES, acceptSuggestions, minimizeProfile, pseudonymize } from "./ai-icebreakers";

describe("AI icebreakers (CHAT-04)", () => {
  it("removes first names, contacts and links from an answer", () => {
    expect(
      pseudonymize(
        "Moi c'est Zoé (zoe.martin@epita.fr), écris à @zoe_m ou au 06 12 34 56 78, ou https://zoe.dev, ZOE !",
        ["Zoé"],
      ),
    ).toBe("Moi c'est [prénom] ([contact]), écris à [contact] ou au [contact], ou [lien] [prénom] !");
    expect(pseudonymize("Jean-Baptiste et jean adorent Dune", ["Jean-Baptiste"])).toBe(
      "[prénom]-[prénom] et [prénom] adorent Dune",
    );
    // A name inside another word stays: only whole words are names.
    expect(pseudonymize("Léa aime le théâtre", ["Léa"])).toBe("[prénom] aime le théâtre");
    expect(pseudonymize("Une idée géniale", ["Léa"])).toBe("Une idée géniale");
  });

  it("never lets a first name through, whatever the answer", () => {
    const name = fc.constantFrom("Zoé", "Inès", "Hugo", "Yan", "Éli");
    fc.assert(
      fc.property(
        name,
        fc.array(fc.constantFrom("j'adore", "le", "ski", ",", "!", "et"), { maxLength: 6 }),
        (n, words) => {
          const text = [...words, n.toUpperCase(), ...words, n].join(" ");
          const out = pseudonymize(text, [n]);
          return !out.toLowerCase().includes(n.toLowerCase());
        },
      ),
    );
  });

  it("caps what is sent of a profile", () => {
    const long = "a".repeat(500);
    const sent = minimizeProfile(
      {
        prompts: [
          { question: "Q1", answer: long },
          { question: "Q2", answer: "  " },
          { question: "Q3", answer: "Je suis Hugo" },
          { question: "Q4", answer: "x" },
          { question: "Q5", answer: "y" },
        ],
        interests: Array.from({ length: 20 }, (_, i) => `I${i}`),
      },
      ["Hugo"],
    );
    expect(sent.prompts.map((p) => p.question)).toEqual(["Q1", "Q3", "Q4"]);
    expect(sent.prompts[0]?.answer.length).toBe(AI_ICEBREAKER_RULES.answerMaxLength);
    expect(sent.prompts[1]?.answer).toBe("Je suis [prénom]");
    expect(sent.interests).toHaveLength(AI_ICEBREAKER_RULES.interestsPerMember);
  });

  it("keeps only short, distinct and clean suggestions", () => {
    expect(
      acceptSuggestions(
        [
          "Tu as l'air de connaître Dune par cœur : plutôt les livres ou le film ?",
          "tu as l'air de connaître dune par cœur : plutôt les livres ou le film ?",
          "Salut [prénom] !",
          "Coucou Inès, ça va ?",
          "Ajoute-moi sur insta",
          "Va voir https://exemple.com",
          "x".repeat(AI_ICEBREAKER_RULES.suggestionMaxLength + 1),
          "  ",
          "Ton meilleur spot pour réviser au campus ?",
          "Escalade en salle ou en falaise ?",
          "Une quatrième idée",
        ],
        ["Inès", "Hugo"],
      ),
    ).toEqual([
      "Tu as l'air de connaître Dune par cœur : plutôt les livres ou le film ?",
      "Ton meilleur spot pour réviser au campus ?",
      "Escalade en salle ou en falaise ?",
    ]);
  });
});
