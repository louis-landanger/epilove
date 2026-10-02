import { GENDERS, MODES } from "@epilove/core";
import { oc } from "@orpc/contract";
import { z } from "zod";

export const devMember = z.object({
  id: z.uuid(),
  firstName: z.string(),
  status: z.string(),
  schoolSlug: z.string(),
  schoolName: z.string(),
  gender: z.enum(GENDERS),
  age: z.number().int(),
  modes: z.array(z.enum(MODES)),
});
export type DevMember = z.infer<typeof devMember>;

/**
 * Development tools, answered with NOT_FOUND outside APP_ENV=development|test.
 * Used by the /dev page to pick the current member.
 */
export const devContract = {
  members: oc.output(z.object({ members: z.array(devMember) })),
};
