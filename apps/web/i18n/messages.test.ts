import { describe, expect, it } from "vitest";
import { LOCALES, messagesFor } from "./messages";

function keysOf(value: unknown, prefix = ""): string[] {
  if (typeof value !== "object" || value === null) {
    return [prefix];
  }
  return Object.entries(value).flatMap(([key, child]) => keysOf(child, prefix ? `${prefix}.${key}` : key));
}

describe("messages", () => {
  it("has the same keys in every locale", () => {
    const reference = keysOf(messagesFor("fr")).sort();
    for (const locale of LOCALES) {
      expect(keysOf(messagesFor(locale)).sort()).toEqual(reference);
    }
  });
});
