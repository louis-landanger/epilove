import { describe, expect, it } from "vitest";
import { checkForgeIdProfile, type ForgeIdConfig, forgeIdConfigFromEnv } from "./forge-id";

const config: ForgeIdConfig = {
  discoveryUrl: "https://forge.example/.well-known/openid-configuration",
  clientId: "epilove",
  clientSecret: "secret",
  campusClaim: "campus",
  campusValue: "Lyon",
  graduationClaim: "promo",
};

describe("Forge ID", () => {
  it("is disabled without configuration", () => {
    expect(forgeIdConfigFromEnv({})).toBeNull();
    expect(
      forgeIdConfigFromEnv({
        FORGE_ID_DISCOVERY_URL: "https://x",
        FORGE_ID_CLIENT_ID: "a",
        FORGE_ID_CLIENT_SECRET: "b",
      }),
    ).toMatchObject({ campusClaim: "campus", campusValue: "lyon", graduationClaim: null });
  });

  it("accepts a Lyon student with a school address", () => {
    expect(
      checkForgeIdProfile({ email: "Prenom.Nom@EPITA.fr", campus: "lyon", promo: "2028" }, config),
    ).toEqual({
      ok: true,
      email: "prenom.nom@epita.fr",
      graduationYear: 2028,
    });
    expect(checkForgeIdProfile({ email: "a.b@epita.fr", campus: ["Paris", "Lyon"] }, config)).toMatchObject({
      ok: true,
    });
  });

  it("refuses other campuses and other addresses", () => {
    expect(checkForgeIdProfile({ email: "a.b@epita.fr", campus: "Paris" }, config)).toEqual({
      ok: false,
      reason: "not_lyon",
    });
    expect(checkForgeIdProfile({ email: "a.b@gmail.com", campus: "Lyon" }, config)).toEqual({
      ok: false,
      reason: "not_school_email",
    });
    expect(checkForgeIdProfile({ campus: "Lyon" }, config)).toMatchObject({ ok: false });
  });
});
