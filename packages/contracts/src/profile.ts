import { oc } from "@orpc/contract";
import { z } from "zod";

const localized = z.object({ fr: z.string(), en: z.string() });

export const catalog = z.object({
  prompts: z.array(z.object({ id: z.uuid(), slug: z.string(), category: z.string(), text: localized })),
  interests: z.array(z.object({ id: z.uuid(), slug: z.string(), category: z.string(), label: localized })),
});
export type Catalog = z.infer<typeof catalog>;

/** The member's own profile (PRO-01 to PRO-05). */
export const profileContract = {
  /** Prompt and interest catalogues, in both languages. */
  catalog: oc.output(catalog),
};
