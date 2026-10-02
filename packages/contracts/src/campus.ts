import { oc } from "@orpc/contract";
import { z } from "zod";

export const checkEmailInput = z.object({
  email: z.string().max(320),
});

export const checkEmailOutput = z.discriminatedUnion("eligible", [
  z.object({
    eligible: z.literal(true),
    school: z.object({ slug: z.string(), name: z.string() }),
  }),
  z.object({
    eligible: z.literal(false),
    reason: z.enum(["invalid_format", "domain_not_allowed"]),
  }),
]);

export const campusContract = {
  /**
   * Tells whether an address belongs to an eligible school (ONB-01, ONB-02).
   * It only looks at the address itself and never reveals whether an account exists.
   */
  checkEmail: oc.input(checkEmailInput).output(checkEmailOutput),
};
