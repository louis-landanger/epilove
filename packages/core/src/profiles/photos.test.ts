import { describe, expect, it } from "vitest";
import { canViewPhoto } from "./photos";

describe("canViewPhoto", () => {
  const owner = "owner";

  it("shows the owner every processed photo", () => {
    for (const status of ["pending", "approved", "rejected"] as const) {
      expect(canViewPhoto(owner, { ownerId: owner, stage: "ready", status })).toBe(true);
    }
  });

  it("shows other members approved photos only", () => {
    expect(canViewPhoto("other", { ownerId: owner, stage: "ready", status: "approved" })).toBe(true);
    expect(canViewPhoto("other", { ownerId: owner, stage: "ready", status: "pending" })).toBe(false);
    expect(canViewPhoto("other", { ownerId: owner, stage: "ready", status: "rejected" })).toBe(false);
  });

  it("never serves an unprocessed upload, not even to its owner", () => {
    expect(canViewPhoto(owner, { ownerId: owner, stage: "uploading", status: "pending" })).toBe(false);
    expect(canViewPhoto(owner, { ownerId: owner, stage: "processing", status: "approved" })).toBe(false);
    expect(canViewPhoto(owner, { ownerId: owner, stage: "failed", status: "pending" })).toBe(false);
  });
});
