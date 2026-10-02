import { describe, expect, it } from "vitest";
import { clientIp } from "./client-ip";

describe("clientIp", () => {
  it("trusts a single well-formed address only", () => {
    expect(clientIp(new Headers({ "x-forwarded-for": "10.1.2.3" }))).toBe("10.1.2.3");
    expect(clientIp(new Headers({ "x-forwarded-for": "2001:DB8::1" }))).toBe("2001:db8::1");
    expect(clientIp(new Headers({ "x-forwarded-for": "1.1.1.1, 10.0.0.1" }))).toBeNull();
    expect(clientIp(new Headers({ "x-forwarded-for": "<script>" }))).toBeNull();
    expect(clientIp(new Headers())).toBeNull();
  });

  it("reads the configured headers in order", () => {
    const headers = new Headers({ "cf-connecting-ip": "9.9.9.9", "x-forwarded-for": "10.0.0.1" });
    expect(clientIp(headers, ["cf-connecting-ip", "x-forwarded-for"])).toBe("9.9.9.9");
  });
});
