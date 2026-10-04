import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { type ImgproxyConfig, photoUrl } from "./imgproxy";

const config: ImgproxyConfig = {
  baseUrl: "http://localhost:8080/",
  keyHex: Buffer.from("key").toString("hex"),
  saltHex: Buffer.from("salt").toString("hex"),
  bucket: "atomes-media",
};

describe("photoUrl", () => {
  const now = new Date("2026-10-02T12:00:00Z");

  it("builds a signed, expiring imgproxy URL", () => {
    const url = photoUrl(config, "photos/u1/p1.jpg", { width: 600, height: 800, now });
    const [, signature, ...rest] = new URL(url).pathname.split("/");
    const path = `/${rest.join("/")}`;
    const expected = createHmac("sha256", "key").update("salt").update(path).digest("base64url");
    expect(signature).toBe(expected);
    expect(path).toContain(`exp:${Math.floor(now.getTime() / 1000) + 3600}`);
    expect(path).toContain("rs:fill:600:800");
    expect(path.endsWith(".webp")).toBe(true);
    expect(url.startsWith("http://localhost:8080/")).toBe(true);
  });

  it("rejects path traversal in storage keys", () => {
    expect(() => photoUrl(config, "../secret", { width: 10 })).toThrow();
    expect(() => photoUrl(config, "/abs", { width: 10 })).toThrow();
  });
});
