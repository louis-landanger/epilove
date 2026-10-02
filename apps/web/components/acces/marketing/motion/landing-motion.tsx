"use client";

import { useEffect } from "react";

/**
 * Loads the landing choreography (Lenis smooth scroll, GSAP ScrollTrigger and
 * SplitText, magnetic buttons, cursor) after the page has loaded, and only
 * when motion is welcome. Without it the page is complete and readable.
 */
export function LandingMotion() {
  useEffect(() => {
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    if (reducedMotion.matches) {
      return;
    }
    let stop: (() => void) | undefined;
    let cancelled = false;

    const start = () => {
      void import("./choreography").then(({ startChoreography }) => {
        if (!cancelled) {
          stop = startChoreography(document.documentElement);
        }
      });
    };
    if (document.readyState === "complete") {
      start();
    } else {
      window.addEventListener("load", start, { once: true });
    }

    const onChange = () => {
      if (reducedMotion.matches) {
        stop?.();
        stop = undefined;
      }
    };
    reducedMotion.addEventListener("change", onChange);

    return () => {
      cancelled = true;
      window.removeEventListener("load", start);
      reducedMotion.removeEventListener("change", onChange);
      stop?.();
    };
  }, []);

  return null;
}
