"use client";

import type { QuestionnaireQuestion, SavedAnswer } from "@epilove/contracts";
import { IMPORTANCES, type Importance } from "@epilove/core";
import { useMutation } from "@tanstack/react-query";
import { AnimatePresence, motion } from "motion/react";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api } from "@/lib/rencontre/api.client";

type Draft = { answer: string | null; acceptable: string[]; importance: Importance };

const SECTION_ORDER = ["values", "lifestyle", "campus", "nerd", "plans"] as const;
type Section = (typeof SECTION_ORDER)[number];
const isSection = (value: string): value is Section => (SECTION_ORDER as readonly string[]).includes(value);

const WEIGHT_DOTS = ["d1", "d2", "d3", "d4"] as const;

const emptyDraft = (): Draft => ({ answer: null, acceptable: [], importance: "somewhat" });

/**
 * The compatibility questionnaire (PAC-01): one question per screen, three
 * choices per question (own answer, accepted answers, importance), saved after
 * each question. Keyboard: 1–4 pick an answer, Enter goes on.
 */
export function Questionnaire({
  questions,
  initialAnswers,
}: {
  questions: QuestionnaireQuestion[];
  initialAnswers: SavedAnswer[];
}) {
  const t = useTranslations("questionnaire");
  const [answers, setAnswers] = useState(() => new Map(initialAnswers.map((a) => [a.questionId, a])));
  const firstUnanswered = questions.findIndex((q) => !answers.has(q.id));
  // -1: introduction, questions.length: done.
  const [index, setIndex] = useState(-1);
  const [direction, setDirection] = useState(1);
  const question = questions[index];

  const [draft, setDraft] = useState<Draft>(emptyDraft);
  useEffect(() => {
    const saved = question && answers.get(question.id);
    setDraft(
      saved
        ? { answer: saved.answer, acceptable: [...saved.acceptable], importance: saved.importance }
        : emptyDraft(),
    );
  }, [question, answers]);

  const save = useMutation({
    mutationFn: (answer: SavedAnswer) => api.questionnaire.answer(answer),
    onSuccess: (_result, answer) => setAnswers((current) => new Map(current).set(answer.questionId, answer)),
  });

  const go = useCallback(
    (next: number) => {
      setDirection(next > index ? 1 : -1);
      setIndex(Math.max(-1, Math.min(questions.length, next)));
      save.reset();
    },
    [index, questions.length, save],
  );

  const submit = useCallback(async () => {
    if (!question || !draft.answer) {
      return;
    }
    const acceptable = draft.acceptable.length > 0 ? draft.acceptable : [draft.answer];
    const answer: SavedAnswer = {
      questionId: question.id,
      answer: draft.answer,
      acceptable,
      importance: draft.importance,
    };
    const saved = answers.get(question.id);
    const unchanged =
      saved &&
      saved.answer === answer.answer &&
      saved.importance === answer.importance &&
      [...saved.acceptable].sort().join() === [...acceptable].sort().join();
    if (!unchanged) {
      try {
        await save.mutateAsync(answer);
      } catch {
        return;
      }
    }
    go(index + 1);
  }, [question, draft, answers, save, go, index]);

  const answeredCount = answers.size;

  if (index === -1) {
    return (
      <Intro
        answered={answeredCount}
        total={questions.length}
        onStart={() => go(firstUnanswered === -1 ? 0 : firstUnanswered)}
      />
    );
  }
  if (!question) {
    return <Done onReview={() => go(0)} />;
  }

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-2xl flex-col px-4 pt-6 pb-8 sm:px-6">
      <Header questions={questions} index={index} answers={answers} onExit={() => go(-1)} />
      <div className="relative mt-6 flex-1">
        <AnimatePresence mode="wait" custom={direction} initial={false}>
          <motion.section
            key={question.id}
            custom={direction}
            initial={{ opacity: 0, x: direction * 48 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: direction * -48 }}
            transition={{ type: "spring", stiffness: 320, damping: 32 }}
            aria-labelledby={`q-${question.id}`}
          >
            <QuestionForm question={question} draft={draft} onChange={setDraft} onSubmit={submit} />
          </motion.section>
        </AnimatePresence>
      </div>
      <footer className="sticky bottom-0 mt-6 flex flex-col gap-3 bg-gradient-to-t from-ink via-ink to-transparent pt-6">
        <p aria-live="polite" className="min-h-5 text-center text-sm">
          {save.isPending && <span className="text-paper/60">{t("saving")}</span>}
          {save.isError && <span className="text-plasma">{t("saveError")}</span>}
        </p>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => go(index - 1)}
            className="rounded-full border border-paper/20 px-5 py-3 text-paper/80 hover:border-paper/50"
          >
            {t("previous")}
          </button>
          <button
            type="button"
            onClick={() => go(index + 1)}
            className="px-3 py-3 text-paper/50 text-sm underline-offset-4 hover:underline"
          >
            {t("skip")}
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={!draft.answer || save.isPending}
            className="ml-auto rounded-full bg-plasma px-6 py-3 font-semibold text-ink transition-opacity disabled:opacity-40"
          >
            {save.isError ? t("retry") : index === questions.length - 1 ? t("finish") : t("next")}
          </button>
        </div>
        <p className="hidden text-center text-paper/40 text-xs sm:block">{t("keyboardHint")}</p>
      </footer>
    </main>
  );
}

function Header({
  questions,
  index,
  answers,
  onExit,
}: {
  questions: QuestionnaireQuestion[];
  index: number;
  answers: ReadonlyMap<string, SavedAnswer>;
  onExit: () => void;
}) {
  const t = useTranslations("questionnaire");
  const sections = useMemo(
    () =>
      SECTION_ORDER.map((section) => {
        const inSection = questions.filter((q) => q.section === section);
        return {
          section,
          total: inSection.length,
          answered: inSection.filter((q) => answers.has(q.id)).length,
        };
      }).filter((s) => s.total > 0),
    [questions, answers],
  );
  const current = questions[index];
  const sectionName = current && isSection(current.section) ? t(`sections.${current.section}`) : "";

  return (
    <header className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-4">
        <button type="button" onClick={onExit} className="text-paper/60 text-sm hover:text-paper">
          ← {t("title")}
        </button>
        <p className="font-mono text-paper/60 text-xs">
          {t("progress", { current: index + 1, total: questions.length })}
        </p>
      </div>
      <div aria-hidden="true" className="flex gap-1.5">
        {sections.map((s) => (
          <div
            key={s.section}
            className="h-1.5 flex-1 overflow-hidden rounded-full bg-paper/10"
            title={t(`sections.${s.section}`)}
          >
            <motion.div
              className="h-full rounded-full bg-volt"
              initial={false}
              animate={{ width: `${(s.answered / s.total) * 100}%` }}
              transition={{ type: "spring", stiffness: 200, damping: 26 }}
            />
          </div>
        ))}
      </div>
      <p className="font-mono text-volt text-xs uppercase tracking-[0.2em]">{sectionName}</p>
    </header>
  );
}

function QuestionForm({
  question,
  draft,
  onChange,
  onSubmit,
}: {
  question: QuestionnaireQuestion;
  draft: Draft;
  onChange: (draft: Draft) => void;
  onSubmit: () => void;
}) {
  const t = useTranslations("questionnaire");
  const heading = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    // Moving focus to the new question lets screen readers announce it.
    heading.current?.focus({ preventScroll: true });
  }, []);

  const pickAnswer = useCallback(
    (value: string) => {
      // Accepting your own answer is the sensible default; previous choices are kept.
      const acceptable = draft.answer === null ? [value] : [...new Set([...draft.acceptable, value])];
      onChange({ ...draft, answer: value, acceptable });
    },
    [draft, onChange],
  );

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const typing =
        target instanceof HTMLTextAreaElement ||
        target instanceof HTMLSelectElement ||
        (target instanceof HTMLInputElement && !["radio", "checkbox"].includes(target.type));
      if (typing || event.altKey || event.ctrlKey || event.metaKey) {
        return;
      }
      const digit = Number(event.key);
      if (Number.isInteger(digit) && digit >= 1 && digit <= question.options.length) {
        const option = question.options[digit - 1];
        if (option) {
          pickAnswer(option.value);
        }
      } else if (event.key === "Enter" && draft.answer && target?.tagName !== "BUTTON") {
        onSubmit();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [question.options, pickAnswer, draft.answer, onSubmit]);

  const toggleAcceptable = (value: string) => {
    const set = new Set(draft.acceptable);
    if (set.has(value)) {
      set.delete(value);
    } else {
      set.add(value);
    }
    onChange({ ...draft, acceptable: question.options.map((o) => o.value).filter((v) => set.has(v)) });
  };
  const allAccepted = draft.acceptable.length === question.options.length;

  return (
    <div className="flex flex-col gap-8">
      <h1
        ref={heading}
        tabIndex={-1}
        id={`q-${question.id}`}
        className="font-display font-semibold text-3xl leading-tight tracking-tight outline-none sm:text-4xl"
      >
        {question.text}
      </h1>

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-3 text-paper/70 text-sm">{t("yourAnswer")}</legend>
        {question.options.map((option, i) => {
          const selected = draft.answer === option.value;
          return (
            <label
              key={option.value}
              className={`flex min-h-12 cursor-pointer items-center gap-3 rounded-2xl border px-4 py-3 transition-colors has-focus-visible:outline-2 has-focus-visible:outline-volt has-focus-visible:outline-offset-2 ${
                selected ? "border-plasma bg-plasma/15 text-paper" : "border-paper/15 hover:border-paper/40"
              }`}
            >
              <input
                type="radio"
                name={`answer-${question.id}`}
                value={option.value}
                checked={selected}
                onChange={() => pickAnswer(option.value)}
                className="sr-only"
              />
              <span
                aria-hidden="true"
                className={`grid size-6 shrink-0 place-items-center rounded-full border font-mono text-xs ${
                  selected ? "border-plasma bg-plasma text-ink" : "border-paper/30 text-paper/60"
                }`}
              >
                {i + 1}
              </span>
              {option.label}
            </label>
          );
        })}
      </fieldset>

      {draft.answer && (
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.22 }}
          className="flex flex-col gap-8"
        >
          <fieldset className="flex flex-col gap-3">
            <legend className="mb-1 text-paper/70 text-sm">{t("acceptable")}</legend>
            <p className="text-paper/50 text-xs">{t("acceptableHint")}</p>
            <div className="flex flex-wrap gap-2">
              {question.options.map((option) => {
                const checked = draft.acceptable.includes(option.value);
                return (
                  <label
                    key={option.value}
                    className={`flex min-h-11 cursor-pointer items-center gap-2 rounded-full border px-4 py-2 text-sm transition-colors has-focus-visible:outline-2 has-focus-visible:outline-volt ${
                      checked ? "border-volt bg-volt/10" : "border-paper/15 hover:border-paper/40"
                    }`}
                  >
                    <input
                      type="checkbox"
                      className="sr-only"
                      checked={checked}
                      onChange={() => toggleAcceptable(option.value)}
                    />
                    <span aria-hidden="true">{checked ? "✓" : "+"}</span>
                    {option.label}
                  </label>
                );
              })}
              <button
                type="button"
                onClick={() =>
                  onChange({
                    ...draft,
                    acceptable: allAccepted ? [draft.answer as string] : question.options.map((o) => o.value),
                  })
                }
                aria-pressed={allAccepted}
                className="min-h-11 rounded-full px-4 py-2 text-paper/60 text-sm underline-offset-4 hover:underline"
              >
                {t("acceptAll")}
              </button>
            </div>
          </fieldset>

          <fieldset className="flex flex-col gap-3">
            <legend className="mb-1 text-paper/70 text-sm">{t("importance")}</legend>
            <div className="grid grid-cols-5 gap-1 rounded-2xl bg-paper/5 p-1">
              {IMPORTANCES.map((level, i) => {
                const selected = draft.importance === level;
                return (
                  <label
                    key={level}
                    className={`relative flex min-h-14 cursor-pointer flex-col items-center justify-center gap-1 rounded-xl px-1 py-2 text-center text-xs transition-colors has-focus-visible:outline-2 has-focus-visible:outline-volt sm:text-sm ${
                      selected ? "text-ink" : "text-paper/70 hover:text-paper"
                    }`}
                  >
                    <input
                      type="radio"
                      name={`importance-${question.id}`}
                      value={level}
                      checked={selected}
                      onChange={() => onChange({ ...draft, importance: level })}
                      className="sr-only"
                    />
                    {selected && (
                      <motion.span
                        layoutId="importance-pill"
                        className={`absolute inset-0 rounded-xl ${level === "mandatory" ? "bg-plasma" : "bg-volt"}`}
                        transition={{ type: "spring", stiffness: 500, damping: 32 }}
                      />
                    )}
                    <span aria-hidden="true" className="relative flex gap-0.5">
                      {WEIGHT_DOTS.map((dot, d) => (
                        <span
                          key={dot}
                          className={`size-1 rounded-full ${
                            d < i
                              ? selected
                                ? "bg-ink"
                                : "bg-paper/70"
                              : selected
                                ? "bg-ink/25"
                                : "bg-paper/20"
                          }`}
                        />
                      ))}
                    </span>
                    <span className="relative">{t(`importanceLevels.${level}`)}</span>
                  </label>
                );
              })}
            </div>
            <p
              aria-live="polite"
              className={`text-sm ${draft.importance === "mandatory" ? "text-plasma" : "text-paper/60"}`}
            >
              {t(`importanceHelp.${draft.importance}`)}
            </p>
          </fieldset>
        </motion.div>
      )}
    </div>
  );
}

function Intro({ answered, total, onStart }: { answered: number; total: number; onStart: () => void }) {
  const t = useTranslations("questionnaire");
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-2xl flex-col justify-center gap-8 px-4 py-10 sm:px-6">
      <a href="/campus" className="text-paper/60 text-sm hover:text-paper">
        ← {t("back")}
      </a>
      <p className="font-mono text-volt text-xs uppercase tracking-[0.2em]">{t("intro.eyebrow")}</p>
      <h1 className="font-display font-semibold text-4xl leading-tight tracking-tight sm:text-5xl">
        {t("intro.title")}
      </h1>
      <p className="text-lg text-paper/80">{t("intro.lead")}</p>
      <section aria-labelledby="how" className="rounded-3xl border border-paper/15 p-5">
        <h2 id="how" className="mb-3 font-semibold">
          {t("intro.howTitle")}
        </h2>
        <ol className="flex flex-col gap-2 text-paper/80">
          {(["how1", "how2", "how3"] as const).map((key, i) => (
            <li key={key} className="flex gap-3">
              <span className="font-mono text-volt">{i + 1}</span>
              {t(`intro.${key}`)}
            </li>
          ))}
        </ol>
        <p className="mt-4 text-paper/60 text-sm">{t("intro.privacy")}</p>
      </section>
      <button
        type="button"
        onClick={onStart}
        className="self-start rounded-full bg-plasma px-7 py-3.5 font-semibold text-ink"
      >
        {answered > 0 ? t("intro.resume", { answered, total }) : t("intro.start")}
      </button>
    </main>
  );
}

function Done({ onReview }: { onReview: () => void }) {
  const t = useTranslations("questionnaire");
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-xl flex-col items-start justify-center gap-6 px-4 py-10">
      <motion.span
        aria-hidden="true"
        initial={{ scale: 0.4, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: "spring", stiffness: 320, damping: 14 }}
        className="relative block size-20"
      >
        <span className="absolute inset-0 rounded-full border border-volt/50" />
        <span className="absolute inset-4 rounded-full bg-volt/80 shadow-[0_0_40px_var(--color-volt)]" />
      </motion.span>
      <h1 className="font-display font-semibold text-4xl tracking-tight">{t("done.title")}</h1>
      <p role="status" className="text-lg text-paper/80">
        {t("done.lead")}
      </p>
      <div className="flex flex-wrap gap-3">
        <a href="/decouvrir" className="rounded-full bg-plasma px-6 py-3 font-semibold text-ink">
          {t("done.discover")}
        </a>
        <button type="button" onClick={onReview} className="rounded-full border border-paper/20 px-6 py-3">
          {t("done.review")}
        </button>
      </div>
    </main>
  );
}
