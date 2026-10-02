import { describe, expect, it } from "vitest";
import { checkMicrosoftProfile, microsoftConfigFromEnv } from "./microsoft";

const TENANT = "11111111-2222-3333-4444-555555555555";

describe("Microsoft sign-in (ONB-10)", () => {
  it("stays off without credentials and an explicit list of school tenants", () => {
    expect(microsoftConfigFromEnv({})).toBeNull();
    expect(
      microsoftConfigFromEnv({ MICROSOFT_CLIENT_ID: "id", MICROSOFT_CLIENT_SECRET: "secret" }),
    ).toBeNull();
    expect(
      microsoftConfigFromEnv({
        MICROSOFT_CLIENT_ID: "id",
        MICROSOFT_CLIENT_SECRET: "secret",
        MICROSOFT_ALLOWED_TENANTS: "common, organizations",
      }),
    ).toBeNull();
    expect(
      microsoftConfigFromEnv({
        MICROSOFT_CLIENT_ID: "id",
        MICROSOFT_CLIENT_SECRET: "secret",
        MICROSOFT_ALLOWED_TENANTS: ` ${TENANT.toUpperCase()} `,
      })?.allowedTenants,
    ).toEqual([TENANT]);
  });

  it("only accepts school tenants and school addresses", () => {
    const config = { clientId: "id", clientSecret: "secret", allowedTenants: [TENANT] };
    expect(checkMicrosoftProfile({ tid: TENANT, email: "Camille.Martin@epita.fr" }, config)).toEqual({
      ok: true,
      email: "camille.martin@epita.fr",
    });
    expect(checkMicrosoftProfile({ tid: TENANT, preferred_username: "lou@isg.fr" }, config)).toEqual({
      ok: true,
      email: "lou@isg.fr",
    });
    expect(
      checkMicrosoftProfile({ tid: "99999999-2222-3333-4444-555555555555", email: "a@epita.fr" }, config),
    ).toEqual({
      ok: false,
      reason: "tenant_not_allowed",
    });
    expect(checkMicrosoftProfile({ tid: TENANT, email: "someone@gmail.com" }, config)).toEqual({
      ok: false,
      reason: "not_school_email",
    });
  });
});
