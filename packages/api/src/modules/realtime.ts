import { connectionToken, personalChannel } from "@atomes/realtime";
import { ORPCError } from "@orpc/server";
import { os, requireViewer } from "../procedures";

/** WebSocket endpoint of Centrifugo as seen by browsers. */
function websocketUrl(env: Record<string, string | undefined> = process.env): string {
  if (env.CENTRIFUGO_WS_URL) {
    return env.CENTRIFUGO_WS_URL;
  }
  const base = (env.CENTRIFUGO_URL ?? "http://localhost:8000").replace(/^http/, "ws").replace(/\/$/, "");
  return `${base}/connection/websocket`;
}

export const realtime = {
  token: os.realtime.token.use(requireViewer).handler(({ context }) => {
    const secret = process.env.CENTRIFUGO_TOKEN_SECRET;
    if (!secret) {
      throw new ORPCError("SERVICE_UNAVAILABLE", { message: "realtime_unavailable" });
    }
    const { token, expiresAt } = connectionToken(secret, context.viewer.userId);
    return {
      token,
      url: websocketUrl(),
      channel: personalChannel(context.viewer.userId),
      expiresAt: expiresAt.toISOString(),
    };
  }),
};
