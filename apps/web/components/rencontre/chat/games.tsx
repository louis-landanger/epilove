"use client";

import type { MessageAttachment } from "@epilove/contracts";
import { GAME_RULES } from "@epilove/core";
import { useTranslations } from "next-intl";
import { useId, useState } from "react";
import { Sheet } from "../ui/sheet";

type GameAttachment = Extract<MessageAttachment, { type: "game" }>;

/** A mini-game in the conversation (CHAT-11): play, then see both answers. */
export function GameCard({
  game,
  otherName,
  onPlay,
}: {
  game: GameAttachment;
  otherName: string;
  onPlay: (choice: string) => void;
}) {
  const t = useTranslations("chat.games");
  const [pending, setPending] = useState<string | null>(null);
  const truths = game.game === "two_truths";
  const canPlay = truths ? !game.author && game.mine === null : game.mine === null;
  const question = truths
    ? game.author
      ? t("truths.waitingGuess", { name: otherName })
      : t("truths.guess")
    : game.prompt;

  return (
    <div className="flex w-72 max-w-full flex-col gap-3 rounded-3xl border border-plasma/40 bg-ink p-4 text-paper">
      <p className="font-mono text-plasma text-xs uppercase tracking-widest">{t(`names.${game.game}`)}</p>
      <p className="font-display font-semibold text-lg">{question}</p>
      <ul className="flex flex-col gap-2">
        {game.options.map((option) => {
          const isMine = (truths ? game.mine : game.mine) === option.id;
          const isTheirs = game.theirs === option.id;
          const isLie = game.lie === option.id;
          return (
            <li key={option.id}>
              {canPlay ? (
                <button
                  type="button"
                  disabled={pending !== null}
                  onClick={() => {
                    setPending(option.id);
                    onPlay(option.id);
                  }}
                  className="w-full rounded-2xl border border-paper/20 px-3 py-2.5 text-left text-sm transition hover:border-plasma disabled:opacity-60"
                >
                  {option.label}
                </button>
              ) : (
                <div
                  className={`flex flex-col gap-1 rounded-2xl border px-3 py-2.5 text-sm ${
                    isLie
                      ? "border-plasma bg-plasma/10"
                      : isMine || isTheirs
                        ? "border-volt/60"
                        : "border-paper/10"
                  }`}
                >
                  <span>{option.label}</span>
                  <span className="flex flex-wrap gap-1.5 font-mono text-[11px]">
                    {isMine && <span className="text-volt">{truths ? t("truths.yourGuess") : t("you")}</span>}
                    {isTheirs && (
                      <span className="text-volt">
                        {truths ? t("truths.theirGuess", { name: otherName }) : otherName}
                      </span>
                    )}
                    {isLie && <span className="text-plasma">{t("truths.lie")}</span>}
                  </span>
                </div>
              )}
            </li>
          );
        })}
      </ul>
      <p className="text-paper/70 text-xs" role="status">
        {game.done
          ? truths
            ? (game.author ? game.theirs : game.mine) === game.lie
              ? game.author
                ? t("truths.foundYou", { name: otherName })
                : t("truths.found")
              : game.author
                ? t("truths.fooled", { name: otherName })
                : t("truths.missed")
            : game.mine === game.theirs
              ? t("same")
              : t("different")
          : canPlay
            ? game.otherPlayed && !truths
              ? t("otherPlayed", { name: otherName })
              : t("yourTurn")
            : t("waiting", { name: otherName })}
      </p>
    </div>
  );
}

/** Starts a game: a dilemma, a nerd quiz, or two truths and a lie to write. */
export function GameSheet({
  open,
  onClose,
  onStart,
  onTwoTruths,
}: {
  open: boolean;
  onClose: () => void;
  onStart: (game: "would_you_rather" | "nerd_quiz") => Promise<void>;
  onTwoTruths: (statements: string[], lie: number) => Promise<void>;
}) {
  const t = useTranslations("chat.games");
  const [writing, setWriting] = useState(false);
  const [statements, setStatements] = useState(["", "", ""]);
  const [lie, setLie] = useState(0);
  const [busy, setBusy] = useState(false);
  const group = useId();

  const close = () => {
    setWriting(false);
    setStatements(["", "", ""]);
    setLie(0);
    onClose();
  };
  const run = async (action: () => Promise<void>) => {
    setBusy(true);
    try {
      await action();
      close();
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet open={open} onClose={close} labelledBy="games-title">
      <h2 id="games-title" className="font-display font-semibold text-xl">
        {t("title")}
      </h2>
      {!writing ? (
        <div className="flex flex-col gap-2">
          {(["would_you_rather", "nerd_quiz"] as const).map((game) => (
            <button
              key={game}
              type="button"
              disabled={busy}
              onClick={() => void run(() => onStart(game))}
              className="flex flex-col items-start gap-0.5 rounded-2xl border border-paper/15 px-4 py-3 text-left hover:border-plasma disabled:opacity-50"
            >
              <span className="font-semibold">{t(`names.${game}`)}</span>
              <span className="text-paper/70 text-sm">{t(`leads.${game}`)}</span>
            </button>
          ))}
          <button
            type="button"
            onClick={() => setWriting(true)}
            className="flex flex-col items-start gap-0.5 rounded-2xl border border-paper/15 px-4 py-3 text-left hover:border-plasma"
          >
            <span className="font-semibold">{t("names.two_truths")}</span>
            <span className="text-paper/70 text-sm">{t("leads.two_truths")}</span>
          </button>
        </div>
      ) : (
        <form
          className="flex flex-col gap-3"
          onSubmit={(event) => {
            event.preventDefault();
            void run(() => onTwoTruths(statements, lie));
          }}
        >
          <p className="text-paper/75 text-sm">{t("truths.write")}</p>
          {statements.map((statement, index) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: three fixed fields.
            <div key={index} className="flex items-start gap-2">
              <input
                type="radio"
                name={group}
                checked={lie === index}
                onChange={() => setLie(index)}
                aria-label={t("truths.markLie", { number: index + 1 })}
                className="mt-3.5 size-4 accent-plasma"
              />
              <label className="flex flex-1 flex-col gap-1">
                <span className="text-paper/70 text-xs">{t("truths.statement", { number: index + 1 })}</span>
                <input
                  value={statement}
                  required
                  maxLength={GAME_RULES.statementMaxLength}
                  onChange={(event) =>
                    setStatements((current) => current.map((s, i) => (i === index ? event.target.value : s)))
                  }
                  className="rounded-xl border border-paper/20 bg-transparent px-3 py-2 focus:border-plasma focus:outline-none"
                />
              </label>
            </div>
          ))}
          <p className="text-paper/60 text-xs">{t("truths.lieHint")}</p>
          <button
            type="submit"
            disabled={busy || statements.some((s) => !s.trim())}
            className="self-start rounded-full bg-plasma px-5 py-3 font-semibold text-ink disabled:opacity-50"
          >
            {t("send")}
          </button>
        </form>
      )}
    </Sheet>
  );
}
