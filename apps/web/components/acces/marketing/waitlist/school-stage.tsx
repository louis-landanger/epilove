"use client";

import { SCHOOLS, type SchoolSlug } from "@atomes/core";
import { useTranslations } from "next-intl";
import { type CSSProperties, useEffect, useRef, useState } from "react";
import { useTypedSchool } from "./typed-school";

/** How long each school's logo shows before the next one's, in milliseconds. */
const TURN_MS = 3000;

/** The school's logo in its colours, lifted for the dark page (public/schools, written by the three package's logos:schools). */
const logoFile = (slug: SchoolSlug) => `/schools/${slug}.svg`;

/**
 * Beside the waiting list form (docs/02-design.md, section 5): the atoms of
 * the ion field draw each school's logo in turn, every three seconds, and
 * hold the school of the address being typed. The schools' own logos, here
 * and nowhere else (docs/adr/0016-logos-des-ecoles.md), the school's name
 * underneath. The field reads the school from `data-school`
 * (ion-field-canvas.tsx); without the field (no GPU, reduced motion), the
 * logo is drawn in dots. It turns only while on screen, and not with reduced
 * motion: the five logos then, or the typed school's.
 */
export function SchoolStage() {
  const t = useTranslations("waitlist.logos");
  const typed = useTypedSchool();
  const stageRef = useRef<HTMLDivElement>(null);
  const [turn, setTurn] = useState<number | null>(null);
  const [turning, setTurning] = useState(false);

  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) {
      return;
    }
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    let visible = false;
    const update = () => setTurning(visible && !reducedMotion.matches);
    const observer = new IntersectionObserver((entries) => {
      visible = entries.some((entry) => entry.isIntersecting);
      update();
    });
    observer.observe(stage);
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
      <div ref={stageRef} className="join-logo" data-field-logo data-school={shown ?? ""}>
        {shown ? (
          // Drawn in dots: the logo seen through a grid of them.
          <span
            key={shown}
            className="join-logo-mark"
            style={{ "--logo": `url(${logoFile(shown)})` } as CSSProperties}
          />
        ) : (
          <span className="join-logo-all">
            {SCHOOLS.map((school) => (
              // Fetched only once near the screen, and not at all while the field draws them.
              // biome-ignore lint/performance/noImgElement: a small static file, nothing to optimise.
              <img
                key={school.slug}
                src={logoFile(school.slug)}
                alt=""
                loading="lazy"
                decoding="async"
                className="join-logo-small"
              />
            ))}
          </span>
        )}
      </div>
      <p className="join-logo-caption">
        <span className="join-logo-label">{typed ? t("yours") : t("campus")}</span>
        <span key={name ?? "all"} className="join-logo-name">
          {name ?? SCHOOLS.map((school) => school.name).join(" · ")}
        </span>
      </p>
    </div>
  );
}
