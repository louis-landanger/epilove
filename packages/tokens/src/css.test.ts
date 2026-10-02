import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { generateThemeCss } from "./css";

describe("theme.gen.css", () => {
  it("is up to date with the tokens (run `pnpm --filter @epilove/tokens generate`)", () => {
    const committed = readFileSync(new URL("../theme.gen.css", import.meta.url), "utf8");
    expect(committed).toBe(generateThemeCss());
  });

  it("exposes one colour per school", () => {
    for (const school of ["epita", "esme", "supbiotech", "isg", "ipsa"]) {
      expect(generateThemeCss()).toContain(`--color-school-${school}: oklch(`);
    }
  });
});
