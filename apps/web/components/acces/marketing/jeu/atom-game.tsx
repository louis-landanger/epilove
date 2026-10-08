"use client";

import { useToast } from "@atomes/ui/primitives/toast";
import { useTranslations } from "next-intl";
import {
  type CSSProperties,
  type ReactNode,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { PEOPLE } from "../match/people";
import { cardStyle, ProfileBody, ProfilePicture, schoolName } from "../match/profile-parts";
import { createSparks } from "../match/sparks";
import { elementFor, isComplete, matchFor, QUESTION_ORDER, QUESTIONS, type QuestionKey } from "./elements";

/** How long a picked answer stays lit before the next question. */
const PICK_DELAY = 420;
/** The visitor's element shows alone for a moment, then their match comes in. */
const SEARCH_DELAY = 1600;
/** When the two cards meet, after the match comes in (their spring takes a moment). */
const SPARK_DELAY = 380;
/** The title's move from the middle of the hero to its top, as the game starts. */
const TITLE_MOVE: KeyframeAnimationOptions = { duration: 800, easing: "cubic-bezier(0.16, 1, 0.3, 1)" };

/** The message of each answer, question by question. */
type AnswerMessage = {
  [Question in QuestionKey]: `questions.${Question}.${(typeof QUESTIONS)[Question][number]}`;
}[QuestionKey];

const ANSWER_MESSAGES: Record<QuestionKey, readonly AnswerMessage[]> = {
  spot: QUESTIONS.spot.map((answer) => `questions.spot.${answer}` as const),
  flag: QUESTIONS.flag.map((answer) => `questions.flag.${answer}` as const),
  seek: QUESTIONS.seek.map((answer) => `questions.seek.${answer}` as const),
};

const reducedMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/** A note of the landing's sound design, when the sound is on (sound/sound-design.tsx). */
const chime = () => document.dispatchEvent(new Event("atomes:chime"));

function Arrow() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 20 20"
      className="size-4"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
    >
      <path d="M4 10h12m-5-5 5 5-5 5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/**
 * The chemistry test of the hero under study (`/apercu/jeu`): three
 * questions, answered with a click, a tap or the keys 1 to 4. The visitor's
 * element shows as a tile of the periodic table, then bonds with a fictional
 * student's profile card ("Liaison établie"). The answers never leave the
 * browser. The logo's atom orbits whatever the game shows (`data-field-atom`,
 * ion-field/journey.ts): the title, the answers, then the two cards.
 */
export function AtomGame({ eyebrow, meta }: { eyebrow: ReactNode; meta: ReactNode }) {
  const t = useTranslations("home");
  const tg = useTranslations("home.game");
  const tm = useTranslations("home.match");
  const toast = useToast();
  const [started, setStarted] = useState(false);
  const [answers, setAnswers] = useState<readonly number[]>([]);
  const [picked, setPicked] = useState<number | null>(null);
  const [bonded, setBonded] = useState(false);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const titleFrom = useRef<DOMRect | null>(null);
  const askRef = useRef<HTMLHeadingElement>(null);
  const resultRef = useRef<HTMLHeadingElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const pickTimer = useRef(0);

  const result = isComplete(answers)
    ? { element: elementFor(answers), match: matchFor(answers), seek: QUESTIONS.seek[answers[2]] ?? "open" }
    : null;
  const question = started && !result ? QUESTION_ORDER[answers.length] : undefined;
  const stage = !started ? "intro" : result ? "result" : "question";
  const done = result !== null;

  const start = () => {
    titleFrom.current = titleRef.current?.getBoundingClientRect() ?? null;
    setStarted(true);
  };

  const choose = useCallback(
    (index: number) => {
      if (!question || picked !== null) {
        return;
      }
      setPicked(index);
      chime();
      pickTimer.current = window.setTimeout(() => {
        setPicked(null);
        setAnswers((current) => [...current, index]);
      }, PICK_DELAY);
    },
    [question, picked],
  );

  const replay = () => {
    window.clearTimeout(pickTimer.current);
    setPicked(null);
    setBonded(false);
    setAnswers([]);
  };

  useEffect(() => () => window.clearTimeout(pickTimer.current), []);

  // The title glides from the middle of the hero to its top (it changes size: FLIP).
  useLayoutEffect(() => {
    const title = titleRef.current;
    const from = titleFrom.current;
    titleFrom.current = null;
    if (!started || !title || !from || reducedMotion()) {
      return;
    }
    const to = title.getBoundingClientRect();
    if (to.width === 0) {
      return;
    }
    const x = from.left + from.width / 2 - (to.left + to.width / 2);
    const y = from.top - to.top;
    title.animate(
      [{ transform: `translate(${x}px, ${y}px) scale(${from.width / to.width})` }, { transform: "none" }],
      TITLE_MOVE,
    );
  }, [started]);

  // Keys 1 to 4 answer the question on screen.
  useEffect(() => {
    if (!question) {
      return;
    }
    const onKey = (event: KeyboardEvent) => {
      if (event.altKey || event.ctrlKey || event.metaKey || event.repeat) {
        return;
      }
      if ((event.target as Element | null)?.closest("input, textarea, select, [contenteditable]")) {
        return;
      }
      const index = Number.parseInt(event.key, 10) - 1;
      if (index >= 0 && index < QUESTIONS[question].length) {
        event.preventDefault();
        choose(index);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [question, choose]);

  // Focus follows the game: each question, then the result.
  useEffect(() => {
    if (question) {
      askRef.current?.focus({ preventScroll: true });
    }
  }, [question]);
  useEffect(() => {
    if (done) {
      resultRef.current?.focus({ preventScroll: true });
    }
  }, [done]);

  // The match comes in after a moment; the cards meet in a burst of sparks.
  useEffect(() => {
    if (!done) {
      return;
    }
    const timer = window.setTimeout(() => setBonded(true), SEARCH_DELAY);
    return () => window.clearTimeout(timer);
  }, [done]);
  useEffect(() => {
    if (!bonded) {
      return;
    }
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
  }, [bonded]);

  const share = async () => {
    if (!result) {
      return;
    }
    const text = tg("shareText", {
      element: tg(`elements.${result.element.key}.name`),
      symbol: result.element.symbol,
      number: result.element.number,
      score: result.match.score,
    });
    const url = `${window.location.origin}/`;
    if (navigator.share) {
      try {
        await navigator.share({ text, url });
        return;
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") {
          return;
        }
      }
    }
    try {
      await navigator.clipboard.writeText(`${text} ${url}`);
      toast.success(tg("copied"));
    } catch {
      // Neither a share sheet nor the clipboard: nothing to do.
    }
  };

  return (
    <div className="game" data-stage={stage}>
      <div data-hero-content className="game-head">
        {stage === "intro" ? eyebrow : null}
        <h1 id="hero-title" ref={titleRef} className="game-title">
          {t("titleLead")} <em>{t("titleAccent")}</em>
          {stage === "intro" ? <span aria-hidden="true" className="field-orbit" data-field-atom /> : null}
        </h1>
      </div>

      {stage === "intro" ? (
        <div data-hero-content className="game-intro">
          <p className="game-lead">{tg("lead")}</p>
          <div className="game-actions">
            <button type="button" data-magnetic className="cta-primary" onClick={start}>
              <span>{tg("start")}</span>
              <Arrow />
            </button>
            <a href="#rejoindre" className="cta-ghost">
              {t("cta")}
            </a>
          </div>
          {meta}
        </div>
      ) : null}

      {question ? (
        <div className="game-question" data-picking={picked !== null || undefined}>
          <span aria-hidden="true" className="field-orbit" data-field-atom />
          <ol aria-hidden="true" className="game-steps">
            {QUESTION_ORDER.map((key, index) => (
              <li key={key} data-done={index <= answers.length || undefined} />
            ))}
          </ol>
          <h2 key={question} ref={askRef} tabIndex={-1} className="game-ask">
            <span className="game-progress">
              {tg("label")} · {tg("progress", { current: answers.length + 1, total: QUESTION_ORDER.length })}
            </span>{" "}
            <span className="game-ask-text">{tg(`questions.${question}.ask`)}</span>
          </h2>
          <ul key={`${question}-answers`} className="game-answers">
            {ANSWER_MESSAGES[question].map((message, index) => (
              <li key={message} style={{ "--index": index } as CSSProperties}>
                <button
                  type="button"
                  aria-keyshortcuts={String(index + 1)}
                  data-picked={picked === index || undefined}
                  className="game-answer"
                  onClick={() => choose(index)}
                >
                  <span aria-hidden="true" className="game-answer-key">
                    {index + 1}
                  </span>
                  <span>{tg(message)}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {result ? (
        <div className="game-result" data-bonded={bonded || undefined}>
          <div aria-hidden="true" className="game-pair">
            <p className="match-bond">
              <b>{tm("bond")}</b>
              <span>
                {tm(result.match.mode === "love" ? "score" : "scoreFriends", { score: result.match.score })}
              </span>
            </p>
            <div className="game-cards">
              <span className="field-orbit" data-field-atom />
              <span className="match-flash" />
              <div className="element-card" data-seek={result.seek}>
                <span className="element-number">{result.element.number}</span>
                <span className="element-tag">{tg(`seekTag.${result.seek}`)}</span>
                <span className="element-symbol">{result.element.symbol}</span>
                <span className="element-name">{tg(`elements.${result.element.key}.name`)}</span>
                <span className="element-foot">{tg("yourAtom")}</span>
              </div>
              <article className="profile-card game-match" style={cardStyle(result.match.person)}>
                <ProfilePicture person={result.match.person} />
                <ProfileBody person={result.match.person} />
              </article>
              <canvas ref={canvasRef} className="match-sparks" />
            </div>
          </div>

          <div className="game-reading">
            <h2 ref={resultRef} tabIndex={-1} className="game-element">
              <span className="game-kicker">{tg("yourAtom")}</span>{" "}
              <span className="game-element-name">{tg(`elements.${result.element.key}.name`)}</span>
            </h2>
            <p className="game-line">{tg(`elements.${result.element.key}.line`)}</p>
            <div aria-live="polite" className="game-verdict">
              {bonded ? (
                <>
                  <p className="game-verdict-text">
                    {tg.rich("verdict", {
                      name: PEOPLE[result.match.person].name,
                      school: schoolName(result.match.person),
                      b: (chunks) => <b>{chunks}</b>,
                    })}
                  </p>
                  <p className="game-score">
                    {tm(result.match.mode === "love" ? "score" : "scoreFriends", {
                      score: result.match.score,
                    })}
                  </p>
                  <p className="game-fiction">{tg("fiction")}</p>
                </>
              ) : (
                <p className="game-searching">{tg("searching")}</p>
              )}
            </div>
            <div className="game-result-actions" inert={!bonded}>
              <a href="#rejoindre" className="cta-primary">
                <span>{tg("join")}</span>
                <Arrow />
              </a>
              <button type="button" className="cta-ghost" onClick={share}>
                {tg("share")}
              </button>
            </div>
            <p className="game-privacy">
              {tg("privacy")}{" "}
              <button type="button" className="game-replay" onClick={replay}>
                {tg("replay")}
              </button>
            </p>
          </div>
        </div>
      ) : null}
    </div>
  );
}
