import { oc } from "@orpc/contract";
import { z } from "zod";

export const realtimeContract = {
  /** Short-lived Centrifugo connection token for the signed-in member, and their personal channel. */
  token: oc.output(
    z.object({ token: z.string(), url: z.string(), channel: z.string(), expiresAt: z.iso.datetime() }),
  ),
};
