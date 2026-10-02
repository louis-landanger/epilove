import { describe, expect, it } from "vitest";
import {
  checkPlay,
  choicesOf,
  type GameState,
  gameView,
  NERD_QUIZ,
  pickPrompt,
  WOULD_YOU_RATHER,
} from "./games";

describe("mini-games (CHAT-11)", () => {
  const dilemma: GameState = { game: "would_you_rather", promptId: "cat-dog", authorId: "a", answers: {} };

  it("hides the other's answer until the viewer played", () => {
    const one = { ...dilemma, answers: { b: "a" } };
    expect(gameView(one, "a")).toMatchObject({ mine: null, theirs: null, otherPlayed: true, done: false });
    const both = { ...dilemma, answers: { a: "b", b: "a" } };
    expect(gameView(both, "a")).toMatchObject({ mine: "b", theirs: "a", done: true });
  });

  it("checks choices and lets each member play once", () => {
    expect(choicesOf(dilemma)).toEqual(["a", "b"]);
    expect(checkPlay(dilemma, "a", "c")).toEqual({ ok: false, reason: "invalid_choice" });
    expect(checkPlay(dilemma, "a", "a")).toEqual({ ok: true });
    expect(checkPlay({ ...dilemma, answers: { a: "a" } }, "a", "b")).toEqual({
      ok: false,
      reason: "already_played",
    });
  });

  it("keeps the lie secret until the guess, except for its author", () => {
    const truths: GameState = {
      game: "two_truths",
      promptId: null,
      authorId: "a",
      statements: ["J'ai vu une aurore boréale", "Je parle japonais", "J'ai sauté en parachute"],
      lie: 1,
      answers: {},
    };
    expect(choicesOf(truths)).toEqual(["0", "1", "2"]);
    expect(checkPlay(truths, "a", "1")).toEqual({ ok: false, reason: "own_game" });
    expect(gameView(truths, "b")).toMatchObject({ mine: null, lie: null, done: false, author: false });
    expect(gameView(truths, "a")).toMatchObject({ author: true, lie: "1", theirs: null, otherPlayed: false });
    const guessed = { ...truths, answers: { b: "2" } };
    expect(gameView(guessed, "b")).toMatchObject({ mine: "2", lie: "1", done: true });
    expect(gameView(guessed, "a")).toMatchObject({ theirs: "2", done: true });
  });

  it("picks a prompt not played yet when there is one", () => {
    const played = new Set(WOULD_YOU_RATHER.slice(1).map((p) => p.id));
    expect(pickPrompt("would_you_rather", played, () => 0.99).id).toBe(WOULD_YOU_RATHER[0]?.id);
    const all = new Set(NERD_QUIZ.map((p) => p.id));
    expect(NERD_QUIZ.map((p) => p.id)).toContain(pickPrompt("nerd_quiz", all, () => 0.5).id);
    expect(new Set(WOULD_YOU_RATHER.map((p) => p.id)).size).toBe(WOULD_YOU_RATHER.length);
  });
});
