import { colors, durations, easings, schoolColors } from "./tokens";

const kebab = (value: string) => value.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`);

/** Tailwind CSS v4 theme generated from the tokens. */
export function generateThemeCss(): string {
  const themeVariables = [
    ...Object.entries(colors).map(([name, value]) => `  --color-${kebab(name)}: ${value};`),
    ...Object.entries(schoolColors).map(([name, value]) => `  --color-school-${name}: ${value};`),
    ...Object.entries(easings).map(([name, value]) => `  --ease-${kebab(name)}: ${value};`),
  ];
  const rootVariables = Object.entries(durations).map(
    ([name, value]) => `  --motion-duration-${kebab(name)}: ${value}ms;`,
  );
  return [
    "/* Generated from packages/tokens/src/tokens.ts. Do not edit by hand. */",
    "@theme {",
    ...themeVariables,
    "}",
    "",
    ":root {",
    ...rootVariables,
    "}",
    "",
  ].join("\n");
}
