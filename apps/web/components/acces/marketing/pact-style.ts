"use client";

import type { PactStyle } from "@atomes/three";
import { useEffect, useState } from "react";

/** The versions of the Pact's stage, by the name the landing's address takes (`?pacte=couple`). */
const STYLES: Readonly<Record<string, PactStyle>> = { cadran: "dial", couple: "couple", fiole: "vial" };

/**
 * The version of the Pact's stage to show, to compare them: the dial, unless
 * the address asks for another. Read once mounted, the page being static.
 */
export function usePactStyle(): PactStyle {
  "use no memo";
  const [style, setStyle] = useState<PactStyle>("dial");
  useEffect(() => {
    const asked = STYLES[new URLSearchParams(window.location.search).get("pacte") ?? ""];
    if (asked) {
      setStyle(asked);
    }
  }, []);
  return style;
}
