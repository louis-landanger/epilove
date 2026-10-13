import { describe, expect, it } from "vitest";
import { schoolOfTypedEmail } from "./typed-school";

describe("schoolOfTypedEmail", () => {
  it("knows the school as soon as the domain typed so far is only its own", () => {
    expect(schoolOfTypedEmail("prenom.nom@epita.fr")).toBe("epita");
    expect(schoolOfTypedEmail("prenom.nom@ep")).toBe("epita");
    expect(schoolOfTypedEmail("prenom.nom@es")).toBe("esme");
    expect(schoolOfTypedEmail("prenom.nom@s")).toBe("supbiotech");
    expect(schoolOfTypedEmail("prenom.nom@is")).toBe("isg");
    expect(schoolOfTypedEmail("  Prenom.Nom@IPSA.FR ")).toBe("ipsa");
  });

  it("waits while it could still be two schools, and knows none for other addresses", () => {
    expect(schoolOfTypedEmail("prenom.nom@e")).toBeNull();
    expect(schoolOfTypedEmail("prenom.nom@i")).toBeNull();
    expect(schoolOfTypedEmail("prenom.nom@")).toBeNull();
    expect(schoolOfTypedEmail("prenom.nom")).toBeNull();
    expect(schoolOfTypedEmail("prenom.nom@gmail.com")).toBeNull();
    expect(schoolOfTypedEmail("prenom.nom@epita.fr.example.com")).toBeNull();
    expect(schoolOfTypedEmail("a@b@epita.fr")).toBeNull();
  });
});
