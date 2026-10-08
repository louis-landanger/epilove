"use client";

import { schoolColors, schoolFoils } from "@atomes/tokens";
import { useTranslations } from "next-intl";
import {
  type CSSProperties,
  type ReactNode,
  type PointerEvent as ReactPointerEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { PEOPLE, type PersonKey } from "../match/people";
import { cardStyle, ProfileBody, ProfilePicture, schoolName } from "../match/profile-parts";
import { createSparks } from "../match/sparks";
import { createComet } from "./comet";
import { chemistryWith, flightOf, HAND, type Outcome, outcomeOf, type Sample, velocityOf } from "./hand";

/** How long a thrown card flies, at most, before it is out of sight (ms). */
const FLIGHT_TIME = 1000;
/** A pointer that moves less than this (CSS pixels) clicks the card rather than dragging it. */
const DRAG_START = 6;
/** Tilt of a dragged card, in degrees per pixel it moved sideways. */
const DRAG_TILT = 0.06;
/** How far a card is dragged before its stamp shows fully (CSS pixels). */
const STAMP_DISTANCE = 120;
/** A card that flies spins at this rate (degrees per millisecond). */
const SPIN = 0.12;
/** When the two cards of the match meet, after it opens. */
const SPARK_DELAY = 420;

const reducedMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/** A note of the landing's sound design, when the sound is on (sound/sound-design.tsx). */
const chime = () => document.dispatchEvent(new Event("atomes:chime"));

const clamp01 = (value: number) => Math.min(1, Math.max(0, value));

/** A card of the hand, as the app draws it, with its school's holographic foil and the throw's stamps. */
function CardFace({
  person,
  likeStamp,
  passStamp,
}: {
  person: PersonKey;
  likeStamp: string;
  passStamp: string;
}) {
  const school = PEOPLE[person].school;
  return (
    <div aria-hidden="true" className="holo-face" style={cardStyle(person)}>
      <ProfilePicture person={person} />
      <ProfileBody person={person} />
      <span className="holo-foil" data-foil={schoolFoils[school]} />
      <span className="holo-glare" />
      <span className="holo-stamp" data-stamp="like">
        {likeStamp}
      </span>
      <span className="holo-stamp" data-stamp="pass">
        {passStamp}
      </span>
    </div>
  );
}

/** The visitor's own card, still to come: every school's foil at once. */
function YourCard() {
  const t = useTranslations("home.holo.you");
  return (
    <div aria-hidden="true" className="holo-face holo-you">
      <div className="profile-picture">
        <span className="profile-promo">20??</span>
        <i className="profile-orbit" />
        <span className="profile-symbol">?</span>
      </div>
      <div className="profile-body" data-shown>
        <p className="profile-name">{t("name")}</p>
        <p className="profile-tags">
          <span>{t("school")}</span>
          <span className="profile-mode">{t("soon")}</span>
        </p>
        <div className="profile-prompt">
          <span>{t("prompt")}</span>
          <p>{t("answer")}</p>
        </div>
      </div>
      <span className="holo-foil" data-foil="all" />
      <span className="holo-glare" />
    </div>
  );
}

/**
 * The match after a like: the visitor's card to come and the liked one bond
 * ("Liaison établie"), the logo's atom around them. Focus goes to its title;
 * "Continuer" or Escape deal the cards again.
 */
function HoloMatch({ person, onClose }: { person: PersonKey; onClose: () => void }) {
  const t = useTranslations("home.holo");
  const tm = useTranslations("home.match");
  const titleRef = useRef<HTMLHeadingElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    titleRef.current?.focus({ preventScroll: true });
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const sparks = canvas && !reducedMotion() ? createSparks(canvas) : null;
    const timer = window.setTimeout(() => {
      sparks?.burst(110);
      chime();
    }, SPARK_DELAY);
    return () => {
      window.clearTimeout(timer);
      sparks?.dispose();
    };
  }, []);

  const score = chemistryWith(person);
  const mode = PEOPLE[person].mode;
  return (
    <div className="holo-match">
      <div aria-hidden="true" className="holo-pair">
        <p className="match-bond">
          <b>{tm("bond")}</b>
          <span>{tm(mode === "love" ? "score" : "scoreFriends", { score })}</span>
        </p>
        <div className="holo-pair-cards">
          <span className="field-orbit" data-field-atom />
          <span className="match-flash" />
          <YourCard />
          <div className="holo-face holo-them" style={cardStyle(person)}>
            <ProfilePicture person={person} />
            <ProfileBody person={person} />
            <span className="holo-foil" data-foil={schoolFoils[PEOPLE[person].school]} />
            <span className="holo-glare" />
          </div>
          <canvas ref={canvasRef} className="match-sparks" />
        </div>
      </div>
      <div className="holo-match-text">
        <h2 ref={titleRef} tabIndex={-1} className="holo-match-title">
          {t("matchTitle")}
        </h2>
        <p className="holo-match-lead">
          {t("matchText", { name: PEOPLE[person].name })}{" "}
          <span className="game-score">{tm(mode === "love" ? "score" : "scoreFriends", { score })}</span>
        </p>
        <div className="game-actions">
          <a href="#rejoindre" className="cta-primary">
            {t("join")}
          </a>
          <button type="button" className="cta-ghost" onClick={onClose}>
            {t("continue")}
          </button>
        </div>
      </div>
    </div>
  );
}

interface Drag {
  readonly index: number;
  readonly pointer: number;
  readonly x0: number;
  readonly y0: number;
  samples: Sample[];
  moved: boolean;
}

/**
 * The holographic hand of the hero under study (`/apercu/holo`): five
 * fictional students, one per school, fanned out at the bottom of the hero.
 * Hovered, a card rises and its foil follows the pointer; dragged and thrown,
 * it flies off with a comet of sparks, liked to the right ("Liker"), passed to
 * the left ("Passer"); a click or a key likes it. A like ends in a match. The
 * logo's atom orbits the title, then the match (`data-field-atom`).
 */
export function HoloDeck({ eyebrow, meta }: { eyebrow: ReactNode; meta: ReactNode }) {
  const t = useTranslations("home");
  const th = useTranslations("home.holo");
  const [matched, setMatched] = useState<PersonKey | null>(null);
  const cardRefs = useRef<Array<HTMLDivElement | null>>([]);
  const buttonRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const cometRef = useRef<HTMLCanvasElement>(null);
  const comet = useRef<ReturnType<typeof createComet> | null>(null);
  const drag = useRef<Drag | null>(null);
  /** Cards flying, or away during a match: they take no new throw. */
  const busy = useRef(new Set<number>());
  /** A drag ends with a click on the card, which must not like it again. */
  const dragged = useRef(false);
  /** A like is on its way to its match: no other card can be liked until the match closes. */
  const liking = useRef(false);
  const frames = useRef(new Set<number>());
  const timers = useRef(new Set<number>());

  useEffect(() => {
    const canvas = cometRef.current;
    if (canvas) {
      comet.current = createComet(canvas);
    }
    const pending = { frames: frames.current, timers: timers.current };
    return () => {
      comet.current?.dispose();
      for (const frame of pending.frames) {
        cancelAnimationFrame(frame);
      }
      for (const timer of pending.timers) {
        window.clearTimeout(timer);
      }
    };
  }, []);

  const later = useCallback((callback: () => void, delay: number) => {
    const timer = window.setTimeout(() => {
      timers.current.delete(timer);
      callback();
    }, delay);
    timers.current.add(timer);
  }, []);

  /** Back into the hand, from below, as if dealt again. */
  const deal = useCallback(
    (index: number) => {
      const card = cardRefs.current[index];
      if (!card) {
        busy.current.delete(index);
        return;
      }
      card.style.removeProperty("translate");
      card.style.removeProperty("rotate");
      card.style.removeProperty("--like");
      card.style.removeProperty("--pass");
      delete card.dataset.flying;
      delete card.dataset.away;
      if (reducedMotion()) {
        busy.current.delete(index);
        return;
      }
      card.dataset.dealing = "";
      later(() => {
        delete card.dataset.dealing;
        busy.current.delete(index);
      }, 700);
    },
    [later],
  );

  /** A card leaves the hand, with a comet of sparks behind it; a like ends in a match. */
  const fly = useCallback(
    (
      index: number,
      outcome: Exclude<Outcome, "back">,
      velocity: { vx: number; vy: number },
      from = { x: 0, y: 0 },
    ) => {
      const card = cardRefs.current[index];
      const person = HAND[index];
      if (!card || !person) {
        return;
      }
      busy.current.add(index);
      if (outcome === "like") {
        liking.current = true;
      }
      chime();
      const land = () => {
        if (outcome === "like") {
          card.dataset.away = "";
          // The match takes the whole hero: bring it back to the top of the screen.
          const hero = card.closest("section");
          if (hero && Math.abs(hero.getBoundingClientRect().top) > 1) {
            hero.scrollIntoView({ block: "start" });
          }
          setMatched(person);
        } else {
          later(() => deal(index), 250);
        }
      };
      if (reducedMotion()) {
        land();
        return;
      }
      card.dataset.flying = "";
      card.style.setProperty(outcome === "like" ? "--like" : "--pass", "1");
      const colour = schoolColors[PEOPLE[person].school];
      const bounds = cometRef.current?.getBoundingClientRect();
      const start = performance.now();
      let last = start;
      let { x, y } = from;
      let spin = from.x * DRAG_TILT;
      const step = (now: number) => {
        const elapsed = Math.min(48, now - last);
        last = now;
        x += velocity.vx * elapsed;
        y += velocity.vy * elapsed;
        spin += Math.sign(velocity.vx || 1) * SPIN * elapsed;
        card.style.translate = `${x.toFixed(1)}px ${y.toFixed(1)}px`;
        card.style.rotate = `${spin.toFixed(1)}deg`;
        const box = card.getBoundingClientRect();
        if (bounds) {
          comet.current?.shed(
            box.left + box.width / 2 - bounds.left,
            box.top + box.height / 2 - bounds.top,
            velocity.vx,
            velocity.vy,
            colour,
          );
        }
        const gone =
          !bounds ||
          box.right < bounds.left ||
          box.left > bounds.right ||
          box.bottom < bounds.top ||
          box.top > bounds.bottom;
        if (gone || now - start > FLIGHT_TIME) {
          land();
          return;
        }
        const frame = requestAnimationFrame((time) => {
          frames.current.delete(frame);
          step(time);
        });
        frames.current.add(frame);
      };
      step(start);
    },
    [deal, later],
  );

  const like = (index: number) => {
    if (dragged.current) {
      dragged.current = false;
      return;
    }
    if (matched || liking.current || busy.current.has(index)) {
      return;
    }
    fly(index, "like", flightOf("like", { vx: 0, vy: 0 }));
  };

  const closeMatch = useCallback(() => {
    const index = matched ? HAND.indexOf(matched) : -1;
    liking.current = false;
    setMatched(null);
    if (index >= 0) {
      deal(index);
      requestAnimationFrame(() => buttonRefs.current[index]?.focus({ preventScroll: true }));
    }
  }, [matched, deal]);

  const onPointerDown = (index: number, event: ReactPointerEvent<HTMLDivElement>) => {
    if (
      matched ||
      liking.current ||
      busy.current.has(index) ||
      (event.pointerType === "mouse" && event.button !== 0)
    ) {
      return;
    }
    dragged.current = false;
    drag.current = {
      index,
      pointer: event.pointerId,
      x0: event.clientX,
      y0: event.clientY,
      samples: [{ x: event.clientX, y: event.clientY, t: event.timeStamp }],
      moved: false,
    };
  };

  const onPointerMove = (index: number, event: ReactPointerEvent<HTMLDivElement>) => {
    const card = cardRefs.current[index];
    if (!card) {
      return;
    }
    const state = drag.current;
    if (!state || state.pointer !== event.pointerId || state.index !== index) {
      // Hovered with a mouse: the card leans towards the pointer, its foil follows it.
      if (event.pointerType === "mouse" && !busy.current.has(index)) {
        const box = card.getBoundingClientRect();
        const x = clamp01((event.clientX - box.left) / box.width);
        const y = clamp01((event.clientY - box.top) / box.height);
        card.style.setProperty("--mx", `${(x * 100).toFixed(1)}%`);
        card.style.setProperty("--my", `${(y * 100).toFixed(1)}%`);
        card.style.setProperty("--rx", `${((0.5 - y) * 16).toFixed(2)}deg`);
        card.style.setProperty("--ry", `${((x - 0.5) * 20).toFixed(2)}deg`);
      }
      return;
    }
    const dx = event.clientX - state.x0;
    const dy = event.clientY - state.y0;
    if (!state.moved) {
      if (Math.hypot(dx, dy) < DRAG_START) {
        return;
      }
      state.moved = true;
      dragged.current = true;
      card.setPointerCapture(event.pointerId);
      card.dataset.dragging = "";
    }
    state.samples.push({ x: event.clientX, y: event.clientY, t: event.timeStamp });
    if (state.samples.length > 12) {
      state.samples.shift();
    }
    card.style.translate = `${dx.toFixed(1)}px ${dy.toFixed(1)}px`;
    card.style.rotate = `${(dx * DRAG_TILT).toFixed(2)}deg`;
    card.style.setProperty("--like", clamp01(dx / STAMP_DISTANCE).toFixed(2));
    card.style.setProperty("--pass", clamp01(-dx / STAMP_DISTANCE).toFixed(2));
  };

  const onPointerUp = (index: number, event: ReactPointerEvent<HTMLDivElement>) => {
    const state = drag.current;
    const card = cardRefs.current[index];
    if (!state || state.pointer !== event.pointerId || state.index !== index || !card) {
      return;
    }
    drag.current = null;
    if (!state.moved) {
      return;
    }
    // The click that may follow this release must not like the card; the next one may.
    later(() => {
      dragged.current = false;
    }, 0);
    delete card.dataset.dragging;
    const offset = { dx: event.clientX - state.x0, dy: event.clientY - state.y0 };
    const velocity = velocityOf(state.samples);
    const thrown = event.type === "pointercancel" ? "back" : outcomeOf(offset, velocity);
    // A card passed while another is liked flies; a second like goes back into the hand.
    const outcome = thrown === "like" && liking.current ? "back" : thrown;
    if (outcome === "back") {
      card.style.removeProperty("translate");
      card.style.removeProperty("rotate");
      card.style.removeProperty("--like");
      card.style.removeProperty("--pass");
      return;
    }
    fly(index, outcome, flightOf(outcome, velocity), { x: offset.dx, y: offset.dy });
  };

  const onPointerLeave = (index: number) => {
    const card = cardRefs.current[index];
    if (card && !drag.current) {
      for (const property of ["--mx", "--my", "--rx", "--ry"]) {
        card.style.removeProperty(property);
      }
    }
  };

  return (
    <>
      <div className="holo-stage" data-matched={matched ? "" : undefined} inert={matched !== null}>
        <div data-hero-content className="holo-copy">
          {eyebrow}
          <h1 id="hero-title" className="game-title holo-title">
            {t("titleLead")} <em>{t("titleAccent")}</em>
            {matched ? null : <span aria-hidden="true" className="field-orbit" data-field-atom />}
          </h1>
          <p className="game-lead">{th("lead")}</p>
          <div className="game-actions">
            <a href="#rejoindre" data-magnetic className="cta-primary">
              {t("cta")}
            </a>
            <a href="#concept" className="cta-ghost">
              {t("secondary")}
            </a>
          </div>
          {meta}
        </div>
        <p aria-hidden="true" className="holo-hint">
          <span>←</span> {th("hint")} <span>→</span>
        </p>
        <ul aria-label={th("hand")} className="holo-hand">
          {HAND.map((person, index) => (
            <li key={person} style={{ "--c": index - (HAND.length - 1) / 2 } as CSSProperties}>
              <div
                ref={(element) => {
                  cardRefs.current[index] = element;
                }}
                className="holo-card"
                onPointerDown={(event) => onPointerDown(index, event)}
                onPointerMove={(event) => onPointerMove(index, event)}
                onPointerUp={(event) => onPointerUp(index, event)}
                onPointerCancel={(event) => onPointerUp(index, event)}
                onPointerLeave={() => onPointerLeave(index)}
              >
                <CardFace person={person} likeStamp={th("likeStamp")} passStamp={th("passStamp")} />
                <button
                  ref={(element) => {
                    buttonRefs.current[index] = element;
                  }}
                  type="button"
                  className="holo-hit"
                  aria-label={th("like", { name: PEOPLE[person].name, school: schoolName(person) })}
                  onClick={() => like(index)}
                />
              </div>
            </li>
          ))}
        </ul>
      </div>
      <canvas ref={cometRef} className="holo-comet" />
      {matched ? <HoloMatch person={matched} onClose={closeMatch} /> : null}
    </>
  );
}
