import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  isLocale,
  LOCALES,
  localizedPath,
  negotiateLocale,
  requestLocale,
  splitLocalePrefix,
} from "./locale";

describe("negotiateLocale", () => {
  it.each([
    [null, "fr"],
    ["", "fr"],
    ["en-US,en;q=0.9", "en"],
    ["fr-FR,fr;q=0.9,en;q=0.8", "fr"],
    ["de-DE,de;q=0.9,en;q=0.5", "en"],
    ["en;q=0.4,fr;q=0.6", "fr"],
    ["en;q=0, fr;q=0.1", "fr"],
    ["en;q=0", "fr"],
    ["es, *;q=0.1", "fr"],
    ["EN-gb", "en"],
    ["en;q=abc,fr;q=0.1", "fr"],
    ["zh-Hant;q=1, en;q=1", "en"],
  ])("%s → %s", (header, expected) => {
    expect(negotiateLocale(header)).toBe(expected);
  });

  it("always returns a supported locale", () => {
    fc.assert(fc.property(fc.string(), (header) => isLocale(negotiateLocale(header))));
  });
});

describe("locale prefixes", () => {
  it.each([
    ["/", null, "/"],
    ["/en", "en", "/"],
    ["/en/", "en", "/"],
    ["/en/legal/cgu", "en", "/legal/cgu"],
    ["/english", null, "/english"],
    ["/legal/cgu", null, "/legal/cgu"],
    ["/fr/legal", null, "/fr/legal"],
  ])("%s", (path, locale, rest) => {
    expect(splitLocalePrefix(path)).toEqual({ locale, pathname: rest });
  });

  it("round-trips with localizedPath", () => {
    const segment = fc.stringMatching(/^[a-z0-9-]{1,12}$/).filter((value) => !isLocale(value));
    fc.assert(
      fc.property(fc.constantFrom(...LOCALES), fc.array(segment, { maxLength: 4 }), (locale, segments) => {
        const path = `/${segments.join("/")}`;
        const split = splitLocalePrefix(localizedPath(locale, path));
        expect(split.pathname).toBe(path);
        expect(split.locale).toBe(locale === "fr" ? null : locale);
      }),
    );
  });
});

describe("requestLocale", () => {
  it("prefers the explicit header, then the cookie, then Accept-Language", () => {
    expect(requestLocale(new Headers({ "x-epilove-locale": "en", cookie: "NEXT_LOCALE=fr" }))).toBe("en");
    expect(requestLocale(new Headers({ cookie: "a=1; NEXT_LOCALE=en", "accept-language": "fr" }))).toBe("en");
    expect(requestLocale(new Headers({ cookie: "NEXT_LOCALE=de", "accept-language": "en" }))).toBe("en");
    expect(requestLocale(new Headers({ "x-epilove-locale": "xx" }))).toBe("fr");
  });
});
