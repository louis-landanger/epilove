import { contract } from "@epilove/contracts";
import { parseSchoolEmail } from "@epilove/core";
import { implement } from "@orpc/server";

export interface ApiContext {
  readonly version: string;
}

const api = implement(contract).$context<ApiContext>();

export const router = api.router({
  system: {
    health: api.system.health.handler(({ context }) => ({
      status: "ok" as const,
      version: context.version,
      time: new Date().toISOString(),
    })),
  },
  campus: {
    checkEmail: api.campus.checkEmail.handler(({ input }) => {
      const result = parseSchoolEmail(input.email);
      if (!result.ok) {
        return { eligible: false as const, reason: result.reason };
      }
      return {
        eligible: true as const,
        school: { slug: result.school.slug, name: result.school.name },
      };
    }),
  },
});

export type Router = typeof router;
