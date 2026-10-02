import { oc } from "@orpc/contract";
import { z } from "zod";

export const healthOutput = z.object({
  status: z.literal("ok"),
  version: z.string(),
  time: z.iso.datetime(),
});

export const systemContract = {
  health: oc.output(healthOutput),
};
