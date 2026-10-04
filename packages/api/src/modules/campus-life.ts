import { listSpots } from "@atomes/db/repositories/campus-life";
import { os, requireViewer } from "../procedures";

/** Campus life (IRL-02 Spots). */
export const campusLife = {
  spots: os.campusLife.spots.use(requireViewer).handler(async ({ context, input }) => {
    const rows = await listSpots(context.database());
    return {
      spots: rows.map((row) => ({
        id: row.id,
        slug: row.slug,
        name: input.locale === "en" ? row.nameEn : row.nameFr,
        kind: row.kind,
        area: row.area,
        latitude: row.latitude,
        longitude: row.longitude,
        description: input.locale === "en" ? row.descriptionEn : row.descriptionFr,
      })),
    };
  }),
};
