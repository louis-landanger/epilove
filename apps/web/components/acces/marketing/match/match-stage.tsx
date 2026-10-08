"use client";

import { SCHOOLS } from "@atomes/core";
import { schoolColors } from "@atomes/tokens";
import { useTranslations } from "next-intl";
import { type CSSProperties, useEffect, useRef, useState } from "react";
import { SchoolGlyph } from "../school-glyph";
import { MATCHES, PEOPLE, type PersonKey } from "./people";
import { createSparks } from "./sparks";

/**
 * The loop of the hero: the cards come in, wait apart, bond (a spark,
 * "Liaison établie"), then dissolve into atoms, and the next two come in.
 */
type Phase = "materialize" | "apart" | "bond" | "dissolve";
const DURATION: Record<Phase, number> = { materialize: 700, apart: 1700, bond: 3000, dissolve: 1100 };
const NEXT: Record<Phase, Phase> = {
  materialize: "apart",
  apart: "bond",
  bond: "dissolve",
  dissolve: "materialize",
};
/** Past this scroll the loop holds on the bonded cards: they dissolve into the logo mark instead (journey.ts). */
const HOLD_SCROLL = 40;
/** When the two cards meet, after the bond starts (their spring takes a moment). */
const SPARK_DELAY = 380;

const ACCENTS = {
  plasma: "var(--color-plasma)",
  volt: "var(--color-volt)",
  violet: "oklch(0.6 0.2 295)",
} as const;
const SCHOOL_NAMES: Record<string, string> = Object.fromEntries(
  SCHOOLS.map((school) => [school.slug, school.name]),
);

/** A profile card as the app draws it: picture, name and age, school, mode and one prompt. */
function ProfileCard({ person: key, side }: { person: PersonKey; side: "first" | "second" }) {
  const t = useTranslations("home.match");
  const person = PEOPLE[key];
  return (
    <article
      className="profile-card"
      data-profile-card={side}
      data-school={person.school}
      style={
        {
          "--glow-a": schoolColors[person.school],
          "--glow-b": ACCENTS[person.accent],
        } as CSSProperties
      }
    >
      <div className="profile-picture">
        <span className="profile-promo">{person.promo}</span>
        <i className="profile-orbit" />
        <span className="profile-symbol">{person.symbol}</span>
      </div>
      <div className="profile-body">
        <p className="profile-name">
          {person.name} <span>{person.age}</span>
        </p>
        <p className="profile-tags">
          <span>
            <SchoolGlyph slug={person.school} className="size-3" />
            {SCHOOL_NAMES[person.school]}
          </span>
          <span className="profile-mode" data-mode={person.mode}>
            {t(person.mode)}
          </span>
        </p>
        <div className="profile-prompt">
          <span>{t(`people.${key}.prompt`)}</span>
          <p>{t(`people.${key}.answer`)}</p>
        </div>
      </div>
    </article>
  );
}

/**
 * The hero's stage (docs/02-design.md, section 5): two fictional students of
 * the campus, as profile cards of the app, bond; then the next two. It is an
 * illustration, kept out of reach of assistive technologies (`inert`): the
 * hero's text says it all. The cards are made of atoms: once the ion field is
 * live, its particles sit right behind them (`data-field-profiles`), show when
 * the cards dissolve, and stream into the logo mark when the page scrolls.
 */
export function MatchStage() {
  const t = useTranslations("home.match");
  const [step, setStep] = useState<{ match: number; phase: Phase; at?: number }>({ match: 0, phase: "bond" });
  const stageRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sparksRef = useRef<ReturnType<typeof createSparks> | null>(null);
  const match = MATCHES[step.match] ?? MATCHES[0];

  // The loop, while the hero is on screen and at the top of the page.
  useEffect(() => {
    const stage = stageRef.current;
    if (!stage || window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      return;
    }
    let visible = true;
    let phase: Phase = "bond";
    let waiting = false;
    let timer = 0;
    const held = () => !visible || window.scrollY > HOLD_SCROLL;
    const advance = () => {
      if (phase === "bond" && held()) {
        waiting = true;
        return;
      }
      phase = NEXT[phase];
      const next = phase;
      setStep((current) => ({
        match: next === "materialize" ? (current.match + 1) % MATCHES.length : current.match,
        phase: next,
        at: Math.round(performance.now()),
      }));
      timer = window.setTimeout(advance, DURATION[next]);
    };
    const resume = () => {
      if (waiting && !held()) {
        waiting = false;
        timer = window.setTimeout(advance, 1200);
      }
    };
    const observer = new IntersectionObserver(([entry]) => {
      visible = entry?.isIntersecting ?? false;
      resume();
    });
    observer.observe(stage);
    window.addEventListener("scroll", resume, { passive: true });
    timer = window.setTimeout(advance, DURATION.bond);
    return () => {
      window.clearTimeout(timer);
      observer.disconnect();
      window.removeEventListener("scroll", resume);
    };
  }, []);

  // The spark, where the two cards meet.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }
    sparksRef.current = createSparks(canvas);
    return () => sparksRef.current?.dispose();
  }, []);
  useEffect(() => {
    if (step.phase !== "bond" || step.at === undefined) {
      return;
    }
    const timer = window.setTimeout(() => sparksRef.current?.burst(), SPARK_DELAY);
    return () => window.clearTimeout(timer);
  }, [step]);

  // The cards lean towards the pointer, and their holographic sheen follows it.
  useEffect(() => {
    const stage = stageRef.current;
    if (
      !stage ||
      !window.matchMedia("(pointer: fine)").matches ||
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    ) {
      return;
    }
    const onMove = (event: PointerEvent) => {
      const box = stage.getBoundingClientRect();
      const x = (event.clientX - box.left) / box.width;
      const y = (event.clientY - box.top) / box.height;
      const near = x > -0.25 && x < 1.25 && y > -0.25 && y < 1.25;
      stage.style.setProperty("--tilt-x", near ? `${((0.5 - y) * 10).toFixed(2)}deg` : "0deg");
      stage.style.setProperty("--tilt-y", near ? `${((x - 0.5) * 14).toFixed(2)}deg` : "0deg");
      stage.style.setProperty("--sheen-x", `${(x * 100).toFixed(1)}%`);
      stage.style.setProperty("--sheen-y", `${(y * 100).toFixed(1)}%`);
    };
    window.addEventListener("pointermove", onMove, { passive: true });
    return () => window.removeEventListener("pointermove", onMove);
  }, []);

  const [first, second] = match.people;
  return (
    <div
      ref={stageRef}
      className="match"
      data-field-profiles
      data-phase={step.phase}
      data-phase-at={step.at}
      inert
    >
      <div className="match-tilt">
        <p className="match-bond">
          <b>{t("bond")}</b>
          <span>{t(match.mode === "love" ? "score" : "scoreFriends", { score: match.score })}</span>
        </p>
        <span className="match-flash" />
        <ProfileCard key="first" person={first} side="first" />
        <ProfileCard key="second" person={second} side="second" />
      </div>
      <canvas ref={canvasRef} className="match-sparks" />
      <p className="match-fiction">{t("fiction")}</p>
    </div>
  );
}
