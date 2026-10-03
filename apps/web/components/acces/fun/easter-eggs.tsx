"use client";

import { useToast } from "@epilove/ui/primitives/toast";
import { useTranslations } from "next-intl";
import { useEffect } from "react";

const KONAMI = [
  "ArrowUp",
  "ArrowUp",
  "ArrowDown",
  "ArrowDown",
  "ArrowLeft",
  "ArrowRight",
  "ArrowLeft",
  "ArrowRight",
  "b",
  "a",
];
let greeted = false;

/** COM-05: a message for console readers and the Konami code. Nothing is tracked. */
export function EasterEggs() {
  const t = useTranslations("common");
  const toast = useToast();

  useEffect(() => {
    if (!greeted) {
      greeted = true;
      console.info(
        "%cepilove%c.\n%c%s",
        "font: 700 32px system-ui; color: #f5f0e6",
        "font: 700 32px system-ui; color: #ff3fa4",
        "font: 14px ui-monospace, monospace; color: #c8f74a",
        t("console"),
      );
    }
    let position = 0;
    const onKey = (event: KeyboardEvent) => {
      const expected = KONAMI[position];
      position = event.key === expected ? position + 1 : event.key === KONAMI[0] ? 1 : 0;
      if (position === KONAMI.length) {
        position = 0;
        document.documentElement.classList.add("chemistry");
        toast.show(t("konami"));
        window.setTimeout(() => document.documentElement.classList.remove("chemistry"), 12_000);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [t, toast]);

  return null;
}
