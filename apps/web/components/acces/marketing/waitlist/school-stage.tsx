"use client";

import { SCHOOLS, type SchoolSlug } from "@atomes/core";
import { useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";
import { SchoolGlyph } from "../school-glyph";
import { useTypedSchool } from "./typed-school";

/** How long each school's glyph shows before the next one's, in milliseconds. */
const TURN_MS = 3000;

/**
 * Beside the waiting list form (docs/02-design.md, section 5): the atoms of
 * the ion field draw each school's glyph in turn, every three seconds, and
 * hold the school of the address being typed. Our own glyphs, the element
 * families of Atomes, never a school logo; the school's name goes with it.
 * The field reads the school from `data-school` (ion-field-canvas.tsx);
 * without the field (no GPU, reduced motion), the glyph is drawn in dots.
 * It turns only while on screen, and not with reduced motion: the five
 * glyphs then, or the typed school's.
 */
export function SchoolStage() {
  const t = useTranslations("waitlist.glyphs");
  const typed = useTypedSchool();
  const glyphRef = useRef<HTMLDivElement>(null);
  const [turn, setTurn] = useState<number | null>(null);
  const [turning, setTurning] = useState(false);

  useEffect(() => {
    const glyph = glyphRef.current;
    if (!glyph) {
      return;
    }
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    let visible = false;
    const update = () => setTurning(visible && !reducedMotion.matches);
    const observer = new IntersectionObserver((entries) => {
      visible = entries.some((entry) => entry.isIntersecting);
      update();
    });
    observer.observe(glyph);
    reducedMotion.addEventListener("change", update);
    return () => {
      observer.disconnect();
      reducedMotion.removeEventListener("change", update);
    };
  }, []);

  useEffect(() => {
    if (!turning || typed) {
      return;
    }
    // A school drawn at random to begin with: none always comes first.
    setTurn((current) => current ?? Math.floor(Math.random() * SCHOOLS.length));
    const timer = window.setInterval(
      () => setTurn((current) => ((current ?? 0) + 1) % SCHOOLS.length),
      TURN_MS,
    );
    return () => window.clearInterval(timer);
  }, [turning, typed]);

  const shown: SchoolSlug | null = typed ?? (turn === null ? null : (SCHOOLS[turn]?.slug ?? null));
  const name = SCHOOLS.find((school) => school.slug === shown)?.name;

  return (
    <div className="join-stage" aria-hidden="true">
      <div ref={glyphRef} className="join-glyph" data-field-glyph data-school={shown ?? ""}>
        {shown ? (
          <SchoolGlyph key={shown} slug={shown} className="join-glyph-drawing" />
        ) : (
          <div className="join-glyph-all">
            {SCHOOLS.map((school) => (
              <SchoolGlyph key={school.slug} slug={school.slug} className="join-glyph-small" />
            ))}
          </div>
        )}
      </div>
      <p className="join-glyph-caption">
        <span className="join-glyph-label">{typed ? t("yours") : t("campus")}</span>
        <span key={name ?? "all"} className="join-glyph-name">
          {name ?? SCHOOLS.map((school) => school.name).join(" · ")}
        </span>
      </p>
    </div>
  );
}
