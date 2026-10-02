import { describe, expect, it } from "vitest";
import { safeNextPath } from "./routes";

describe("safeNextPath", () => {
  it("keeps relative paths and rejects anything that could leave the site", () => {
    expect(safeNextPath("/messages?x=1")).toBe("/messages?x=1");
    expect(safeNextPath("//evil.example")).toBeNull();
    expect(safeNextPath("/\\evil.example")).toBeNull();
    expect(safeNextPath("https://evil.example")).toBeNull();
    expect(safeNextPath(null)).toBeNull();
  });
});
