import { listActivePrompts, listInterests } from "@epilove/db/repositories/profiles";
import { os, requireViewer } from "../procedures";

/** The member's own profile (PRO-01 to PRO-05). */
export const profile = {
  catalog: os.profile.catalog.use(requireViewer).handler(async ({ context }) => {
    const db = context.database();
    const [prompts, interests] = await Promise.all([listActivePrompts(db), listInterests(db)]);
    return {
      prompts: prompts.map((row) => ({
        id: row.id,
        slug: row.slug,
        category: row.category,
        text: { fr: row.textFr, en: row.textEn },
      })),
      interests: interests.map((row) => ({
        id: row.id,
        slug: row.slug,
        category: row.category,
        label: { fr: row.labelFr, en: row.labelEn },
      })),
    };
  }),
};
