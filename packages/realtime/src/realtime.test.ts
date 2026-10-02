import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { parseRealtimeEvent, personalChannel } from "./events";
import { createPublisher } from "./publisher";
import { connectionToken } from "./token";

describe("connection token", () => {
  it("is a valid HS256 JWT for the member", () => {
    const secret = "dev-only-centrifugo-token-secret";
    const { token, expiresAt } = connectionToken(secret, "user-1", { now: new Date("2026-10-02T12:00:00Z") });
    const [header, payload, signature] = token.split(".");
    expect(JSON.parse(Buffer.from(header ?? "", "base64url").toString())).toEqual({
      alg: "HS256",
      typ: "JWT",
    });
    expect(JSON.parse(Buffer.from(payload ?? "", "base64url").toString())).toMatchObject({ sub: "user-1" });
    expect(createHmac("sha256", secret).update(`${header}.${payload}`).digest("base64url")).toBe(signature);
    expect(expiresAt.toISOString()).toBe("2026-10-02T12:10:00.000Z");
  });
});

describe("events", () => {
  it("only accepts known events with identifiers", () => {
    const id = "01920000-0000-7000-8000-000000000001";
    expect(parseRealtimeEvent({ type: "message.created", matchId: id, messageId: id })).not.toBeNull();
    expect(parseRealtimeEvent({ type: "message.created", matchId: id })).toBeNull();
    expect(parseRealtimeEvent({ type: "nope" })).toBeNull();
    expect(personalChannel("abc")).toBe("personal:#abc");
  });
});

describe("publisher", () => {
  it("calls the Centrifugo HTTP API with the API key", async () => {
    const calls: { url: string; init: RequestInit }[] = [];
    const publisher = createPublisher({
      url: "http://centrifugo:8000/",
      apiKey: "key",
      fetch: async (url, init) => {
        calls.push({ url: String(url), init: init ?? {} });
        return new Response(JSON.stringify({ result: {} }));
      },
    });
    await publisher.publish("personal:#u", {
      type: "typing",
      matchId: "01920000-0000-7000-8000-000000000001",
    });
    expect(calls[0]?.url).toBe("http://centrifugo:8000/api/publish");
    expect(new Headers(calls[0]?.init.headers).get("x-api-key")).toBe("key");
  });
});

const centrifugo = process.env.CENTRIFUGO_URL;
describe.skipIf(!centrifugo || !process.env.CENTRIFUGO_HTTP_API_KEY)("centrifugo", () => {
  it("accepts publications on personal channels", async () => {
    const publisher = createPublisher({
      url: centrifugo ?? "",
      apiKey: process.env.CENTRIFUGO_HTTP_API_KEY ?? "",
    });
    await expect(
      publisher.publish(personalChannel("01920000-0000-7000-8000-000000000001"), {
        type: "notification.created",
      }),
    ).resolves.toBeUndefined();
  });
});
