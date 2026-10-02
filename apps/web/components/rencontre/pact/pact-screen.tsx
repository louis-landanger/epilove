"use client";

import type { PactCurrent, PactMatchView } from "@epilove/contracts";
import { clockOffsetMs, type Mode, revealDelayMs } from "@epilove/core";
import { PACT_CHANNEL } from "@epilove/realtime/events";
import { ORPCError } from "@orpc/client";
import Link from "next/link";
import { useFormatter, useTranslations } from "next-intl";
import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "@/lib/rencontre/api.client";
import { useBroadcast } from "@/lib/rencontre/realtime";
import { schoolColor } from "../discovery/school";
import { Countdown } from "./countdown";
import { NoMatch, NotParticipant, PactMatchCard } from "./pact-result";
import { PactStats } from "./pact-stats";
import { RevealSequence } from "./reveal-sequence";

/** A reveal seen within this delay plays again on the first visit; later, the result shows directly. */
const REPLAY_WINDOW_MS = 15 * 60_000;
const CAMPUS_TIME_ZONE = "Europe/Paris";

type Reveal =
  | { readonly status: "idle" }
  | { readonly status: "sequence"; readonly matches: PactMatchView[] | null }
  | { readonly status: "done"; readonly matches: PactMatchView[] };

/** Waits for the first photos (at most `timeoutMs`), so that the card never appears empty. */
function preload(matches: readonly PactMatchView[], timeoutMs = 2000) {
  const urls = matches.flatMap((m) => (m.card.photos[0] ? [m.card.photos[0].url] : []));
  const loads = urls.map(
    (url) =>
      new Promise<void>((resolve) => {
        const image = new Image();
        image.onload = () => resolve();
        image.onerror = () => resolve();
        image.src = url;
      }),
  );
  return Promise.race([Promise.all(loads), new Promise((resolve) => setTimeout(resolve, timeoutMs))]);
}

/**
 * The Pact page (PAC-02, PAC-03): sign-up while open, then the campus-wide
 * countdown on the server's clock, the live counter and the synchronised
 * reveal. The reveal starts on the `pact.reveal` broadcast; polling takes
 * over if the realtime connection is down.
 */
export function PactScreen({ initial }: { initial: PactCurrent }) {
  const t = useTranslations("pact");
  const format = useFormatter();
  const [data, setData] = useState(initial);
  const [offset, setOffset] = useState(0);
  // The first render uses the server's instant: identical on the server and in the browser.
  const [clientNow, setClientNow] = useState(() => Date.parse(initial.serverNow));
  const [liveCount, setLiveCount] = useState<number | null>(null);
  const [reveal, setReveal] = useState<Reveal>({ status: "idle" });
  const [error, setError] = useState<string | null>(null);
  const started = useRef(false);

  const season = data.season;
  const participant = data.participation !== null;
  const now = clientNow + offset;

  const refresh = useCallback(async () => {
    const sentAt = Date.now();
    const next = await api.pact.current();
    setOffset(clockOffsetMs(sentAt, Date.now(), Date.parse(next.serverNow)));
    setData(next);
    return next;
  }, []);

  useEffect(() => {
    setClientNow(Date.now());
    const interval = setInterval(() => setClientNow(Date.now()), 250);
    void refresh().catch(() => {});
    return () => clearInterval(interval);
  }, [refresh]);

  const loadResult = useCallback(async (attempt = 0): Promise<PactMatchView[]> => {
    try {
      const { matches } = await api.pact.result({ locale: "fr" });
      await preload(matches);
      return matches;
    } catch (cause) {
      // The broadcast can beat the database replica by a moment: try again shortly.
      if (attempt < 5 && cause instanceof ORPCError && cause.message === "not_revealed") {
        await new Promise((resolve) => setTimeout(resolve, 1500 + Math.random() * 1500));
        return loadResult(attempt + 1);
      }
      throw cause;
    }
  }, []);

  const startReveal = useCallback(
    (animated: boolean) => {
      if (started.current) {
        return;
      }
      started.current = true;
      setReveal(animated ? { status: "sequence", matches: null } : { status: "idle" });
      // Thousands of screens get the signal at once: each waits a random moment before asking.
      const delay = animated ? revealDelayMs(Math.random()) : 0;
      setTimeout(() => {
        loadResult()
          .then((matches) =>
            setReveal((current) =>
              current.status === "sequence" ? { status: "sequence", matches } : { status: "done", matches },
            ),
          )
          .catch((cause) => {
            started.current = false;
            setReveal({ status: "idle" });
            setError(cause instanceof ORPCError ? cause.message : "generic");
          });
      }, delay);
    },
    [loadResult],
  );

  // Already revealed when the page opens: replay the sequence if it just happened.
  useEffect(() => {
    if (season?.phase === "revealed" && participant && !started.current) {
      startReveal(Date.now() - Date.parse(season.revealAt) < REPLAY_WINDOW_MS);
    }
  }, [season?.phase, season?.revealAt, participant, startReveal]);

  useBroadcast(PACT_CHANNEL, (signal) => {
    if (signal.type === "pact.reveal" && signal.seasonId === season?.id) {
      void refresh().catch(() => {});
      if (participant) {
        startReveal(true);
      }
    } else if (signal.type === "resync") {
      void refresh().catch(() => {});
    }
  });

  const target = !season
    ? null
    : season.phase === "upcoming"
      ? Date.parse(season.opensAt)
      : season.phase === "open"
        ? Date.parse(season.closesAt)
        : Date.parse(season.revealAt);
  const remaining = target === null ? 0 : target - now;
  const waitingForReveal =
    season !== null && (season.phase === "revealing" || (season.phase === "closed" && remaining <= 0));

  // A deadline passed (opening, closing): ask the server for the new phase.
  const lastDeadline = useRef<number | null>(null);
  useEffect(() => {
    if (season && (season.phase === "upcoming" || season.phase === "open") && remaining <= 0) {
      if (lastDeadline.current !== target) {
        lastDeadline.current = target;
        void refresh().catch(() => {});
      }
    }
  }, [season, remaining, target, refresh]);

  // Fallback without realtime: poll (with jitter) once the countdown is over.
  useEffect(() => {
    if (!waitingForReveal) {
      return;
    }
    let timer: ReturnType<typeof setTimeout>;
    const poll = () => {
      timer = setTimeout(
        async () => {
          const next = await refresh().catch(() => null);
          if (next?.season?.phase === "revealed") {
            if (next.participation) {
              startReveal(true);
            }
            return;
          }
          poll();
        },
        4000 + Math.random() * 3000,
      );
    };
    poll();
    return () => clearTimeout(timer);
  }, [waitingForReveal, refresh, startReveal]);

  // Live counter around the reveal (Centrifugo presence on the broadcast channel).
  const showLive = season !== null && (season.phase === "closed" || season.phase === "revealing");
  useEffect(() => {
    if (!showLive) {
      return;
    }
    let timer: ReturnType<typeof setTimeout>;
    const tick = async () => {
      const result = await api.pact.liveCount().catch(() => ({ count: null }));
      setLiveCount(result.count);
      timer = setTimeout(tick, 8000 + Math.random() * 4000);
    };
    void tick();
    return () => clearTimeout(timer);
  }, [showLive]);

  const date = (iso: string) =>
    format.dateTime(new Date(iso), { dateStyle: "full", timeStyle: "short", timeZone: CAMPUS_TIME_ZONE });

  const onOpened = useCallback(() => {
    setReveal((current) =>
      current.status === "sequence" && current.matches
        ? { status: "done", matches: current.matches }
        : current,
    );
  }, []);

  const replay = () => {
    if (reveal.status === "done") {
      setReveal({ status: "sequence", matches: reveal.matches });
    }
  };

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-3xl flex-col gap-8 px-4 pt-6 pb-12">
      <header className="flex flex-col gap-2">
        <Link href="/campus" className="self-start text-paper/70 text-sm underline-offset-4 hover:underline">
          {t("back")}
        </Link>
        {season && (
          <p className="font-mono text-paper/70 text-xs uppercase tracking-widest">
            {t("edition", { name: season.name })}
          </p>
        )}
        <h1 className="font-display font-semibold text-4xl tracking-tight sm:text-5xl">{t("title")}</h1>
        <p className="max-w-xl text-paper/75">{t("promise")}</p>
      </header>

      {error && (
        <p role="alert" className="rounded-2xl bg-plasma/15 px-4 py-3 text-sm">
          {t(`errors.${error}` as "errors.generic")}
        </p>
      )}

      {!season ? (
        <section className="flex flex-col items-center gap-3 rounded-3xl border border-paper/10 px-6 py-14 text-center">
          <h2 className="font-display font-semibold text-2xl">{t("none.title")}</h2>
          <p className="max-w-md text-paper/75">{t("none.lead")}</p>
        </section>
      ) : reveal.status === "sequence" ? (
        <RevealSequence
          ready={reveal.matches !== null}
          colors={(reveal.matches ?? []).map((m) => schoolColor(m.card.school.slug))}
          onOpened={onOpened}
        />
      ) : reveal.status === "done" ? (
        <section className="flex flex-col gap-6" aria-labelledby="pact-result-title">
          <div className="flex flex-wrap items-baseline justify-between gap-3">
            <h2 id="pact-result-title" className="font-display font-semibold text-2xl">
              {t("result.title")}
            </h2>
            <button
              type="button"
              onClick={replay}
              className="text-paper/70 text-sm underline-offset-4 hover:underline"
            >
              {t("result.replay")}
            </button>
          </div>
          <p className="sr-only" aria-live="polite">
            {t("sequence.announce", { count: reveal.matches.length })}
          </p>
          {reveal.matches.length === 0 ? (
            <NoMatch />
          ) : (
            reveal.matches.map((match, index) => (
              <PactMatchCard key={match.mode} match={match} animated delay={index * 0.35} />
            ))
          )}
        </section>
      ) : season.phase === "revealed" ? (
        participant ? (
          <p className="text-paper/70">{t("result.title")}…</p>
        ) : (
          <NotParticipant />
        )
      ) : waitingForReveal ? (
        <section className="flex flex-col items-center gap-4 py-10 text-center">
          <h2 className="font-display font-semibold text-3xl">{t("waiting.title")}</h2>
          <p className="max-w-md text-paper/75">{t("waiting.lead")}</p>
          {liveCount !== null && (
            <p className="font-mono text-volt text-sm">{t("live", { count: liveCount })}</p>
          )}
        </section>
      ) : (
        <>
          <section className="flex flex-col items-center gap-4 rounded-3xl border border-paper/10 px-4 py-10 text-center">
            <Countdown remainingMs={remaining} label={t(`phase.${season.phase}`)} />
            <p className="text-paper/75 text-sm">
              {season.phase === "upcoming"
                ? t("dates.opens", { date: date(season.opensAt) })
                : season.phase === "open"
                  ? t("dates.closes", { date: date(season.closesAt) })
                  : t("dates.reveal", { date: date(season.revealAt) })}
            </p>
            {season.phase === "open" && (
              <p className="font-mono text-paper/70 text-xs">
                {t("participants", { count: data.participants })}
              </p>
            )}
            {showLive && liveCount !== null && (
              <p className="font-mono text-volt text-sm">{t("live", { count: liveCount })}</p>
            )}
          </section>
          {season.phase === "open" ? (
            <JoinPanel data={data} onChange={refresh} />
          ) : season.phase === "closed" ? (
            <p className="text-center text-paper/75">
              {participant
                ? t("join.joined", {
                    modes: (data.participation?.modes ?? []).map((m) => t(`join.mode.${m}`)).join(", "),
                  })
                : t("join.notJoined")}
            </p>
          ) : null}
        </>
      )}
      {season?.phase === "revealed" && <PactStats />}
    </main>
  );
}

function JoinPanel({ data, onChange }: { data: PactCurrent; onChange: () => Promise<unknown> }) {
  const t = useTranslations("pact");
  const [modes, setModes] = useState<Mode[]>(data.participation?.modes ?? data.availableModes);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const joined = data.participation !== null;
  const { answered, required } = data.questionnaire;
  const ready = answered >= required;

  const run = async (action: () => Promise<unknown>) => {
    setPending(true);
    setError(null);
    try {
      await action();
      await onChange();
    } catch (cause) {
      setError(cause instanceof ORPCError ? cause.message : "generic");
    } finally {
      setPending(false);
    }
  };

  return (
    <section
      className="flex flex-col gap-4 rounded-3xl border border-paper/10 p-5"
      aria-labelledby="pact-join"
    >
      <h2 id="pact-join" className="font-display font-semibold text-2xl">
        {t("join.title")}
      </h2>
      {joined && (
        <p className="rounded-2xl bg-volt/10 px-4 py-3 text-sm">
          {t("join.joined", {
            modes: (data.participation?.modes ?? []).map((m) => t(`join.mode.${m}`)).join(", "),
          })}
        </p>
      )}
      {!ready && (
        <div className="flex flex-col items-start gap-2 rounded-2xl bg-paper/5 px-4 py-3 text-sm">
          <p>{t("join.questionnaire", { answered, required })}</p>
          <Link href="/campus/questionnaire" className="font-semibold underline underline-offset-4">
            {t("join.questionnaireAction")}
          </Link>
        </div>
      )}
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-2 font-mono text-paper/70 text-xs uppercase tracking-widest">
          {t("join.modes")}
        </legend>
        <div className="flex flex-wrap gap-3">
          {data.availableModes.map((mode) => (
            <label
              key={mode}
              className="flex cursor-pointer items-center gap-2 rounded-full border border-paper/20 px-4 py-2 has-checked:border-volt has-checked:bg-volt/10"
            >
              <input
                type="checkbox"
                className="accent-volt"
                checked={modes.includes(mode)}
                onChange={(event) =>
                  setModes((current) =>
                    event.target.checked ? [...current, mode] : current.filter((m) => m !== mode),
                  )
                }
              />
              {t(`join.mode.${mode}`)}
            </label>
          ))}
        </div>
      </fieldset>
      <p className="text-paper/70 text-sm">{t("join.consent")}</p>
      {error && (
        <p role="alert" className="rounded-2xl bg-plasma/15 px-4 py-3 text-sm">
          {t(`errors.${error}` as "errors.generic")}
        </p>
      )}
      {modes.length === 0 && <p className="text-paper/70 text-sm">{t("join.pickOne")}</p>}
      <div className="flex flex-wrap gap-3">
        <button
          type="button"
          disabled={!ready || modes.length === 0 || pending}
          onClick={() => run(() => api.pact.join({ modes }))}
          className="rounded-full bg-paper px-5 py-3 font-semibold text-ink transition hover:bg-volt disabled:cursor-not-allowed disabled:opacity-50"
        >
          {joined ? t("join.update") : t("join.action")}
        </button>
        {joined && (
          <button
            type="button"
            disabled={pending}
            onClick={() => run(() => api.pact.leave())}
            className="rounded-full border border-paper/25 px-5 py-3 font-semibold transition hover:border-paper/60 disabled:opacity-50"
          >
            {t("join.leave")}
          </button>
        )}
      </div>
    </section>
  );
}
