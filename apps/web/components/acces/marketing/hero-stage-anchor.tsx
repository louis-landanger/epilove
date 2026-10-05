"use client";

import { useEffect } from "react";

/**
 * Keeps the hero's stage level with the title on wide screens: on short
 * viewports the copy below the title pushes it up (marketing.css,
 * `.hero-layout`), and the two atoms follow it. Without script, the
 * stylesheet's default holds: the middle of the title row.
 */
export function HeroStageAnchor() {
  useEffect(() => {
    const title = document.getElementById("hero-title");
    const scope = document.querySelector<HTMLElement>("[data-field-scope]");
    const stage = document.querySelector<HTMLElement>("[data-field-pair]");
    const hero = document.getElementById("hero");
    if (!title || !scope || !stage || !hero) {
      return;
    }
    const update = () => {
      // Layout position, transforms aside: the hero copy drifts up as the page scrolls.
      let top = title.offsetHeight / 2;
      for (
        let element: Element | null = title;
        element instanceof HTMLElement && element !== scope;
        element = element.offsetParent
      ) {
        top += element.offsetTop;
      }
      stage.style.setProperty("--hero-title-y", `${top}px`);
    };
    const observer = new ResizeObserver(update);
    observer.observe(title);
    observer.observe(hero);
    return () => {
      observer.disconnect();
      stage.style.removeProperty("--hero-title-y");
    };
  }, []);

  return null;
}
