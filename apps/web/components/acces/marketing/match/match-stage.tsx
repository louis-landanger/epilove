"use client";

import { useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";
import { MATCHES, PEOPLE, type PersonKey } from "./people";
import { cardStyle, ProfileBody, ProfilePicture } from "./profile-parts";
import { createSparks } from "./sparks";

/**
 * The loop of the hero: the two cards bond (a spark, "Liaison établie"),
 * turn over like playing cards, and show the next two people, who wait
 * apart, then bond in turn. The new people come in while the cards are
 * edge-on.
 */
type Phase = "bond" | "turn" | "apart";
const DURATION: Record<Phase, number> = { bond: 3200, turn: 440, apart: 1600 };
const NEXT: Record<Phase, Phase> = { bond: "turn", turn: "apart", apart: "bond" };
/** Past this scroll the loop holds on the bonded cards, which fade with the hero's text. */
const HOLD_SCROLL = 40;
/** When the two cards meet, after the bond starts (their spring takes a moment). */
const SPARK_DELAY = 380;

/** The people who come in turn on each side of the stage. */
const SIDES = {
  first: MATCHES.map((match) => match.people[0]),
  second: MATCHES.map((match) => match.people[1]),
} as const;

/**
 * A profile card as the app draws it: picture, name and age, school, mode and
 * one prompt. It holds the text of everyone who comes on its side, one over
 * the other, and shows the current person's: the card keeps the height of the
 * longest, so nothing around it moves when the next person comes in.
 */
function ProfileCard({ side, current: key }: { side: keyof typeof SIDES; current: PersonKey }) {
  return (
    <article
      className="profile-card"
      data-profile-card={side}
      data-school={PEOPLE[key].school}
      style={cardStyle(key)}
    >
      <ProfilePicture person={key} />
      <div className="profile-bodies">
        {SIDES[side].map((other) => (
          <ProfileBody key={other} person={other} shown={other === key} />
        ))}
      </div>
    </article>
  );
}

/**
 * The hero's stage (docs/02-design.md, section 5): two fictional students of
 * the campus, as profile cards of the app, bond; then the next two. It is an
 * illustration, kept out of reach of assistive technologies (`inert`): the
 * hero's text says it all. Once the ion field is live, its particles wait
 * behind the cards (`data-field-profiles`), unlit, and gather into the logo
 * mark beside the manifesto when the page scrolls.
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
        match: next === "apart" ? (current.match + 1) % MATCHES.length : current.match,
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
    <div ref={stageRef} className="match" data-field-profiles data-hero-stage data-phase={step.phase} inert>
      <div className="match-tilt">
        <p className="match-bond">
          <b>{t("bond")}</b>
          <span>{t(match.mode === "love" ? "score" : "scoreFriends", { score: match.score })}</span>
        </p>
        <span className="match-flash" />
        <ProfileCard key="first" side="first" current={first} />
        <ProfileCard key="second" side="second" current={second} />
      </div>
      <canvas ref={canvasRef} className="match-sparks" />
      <p className="match-fiction">{t("fiction")}</p>
    </div>
  );
}
