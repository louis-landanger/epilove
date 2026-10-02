import { oc } from "@orpc/contract";
import { z } from "zod";
import { contentLocale } from "./questionnaire";

/** A Spot (IRL-02): a real public place around the campus. */
export const spotView = z.object({
  id: z.uuid(),
  slug: z.string(),
  name: z.string(),
  /** park, square, riverbank, viewpoint */
  kind: z.string(),
  area: z.string(),
  latitude: z.number(),
  longitude: z.number(),
  description: z.string(),
});
export type SpotView = z.infer<typeof spotView>;

export const campusLifeContract = {
  /** Public places for a first date (IRL-02). */
  spots: oc.input(z.object({ locale: contentLocale })).output(z.object({ spots: z.array(spotView) })),
};
