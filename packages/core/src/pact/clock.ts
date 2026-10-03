import { PACT_RULES } from "./rules";

/**
 * Countdown helpers for the reveal (PAC-03). Device clocks drift: the
 * countdown runs on the server's clock, estimated from one API round trip
 * (the server read its clock roughly halfway through the request).
 */
export function clockOffsetMs(sentAt: number, receivedAt: number, serverNow: number): number {
  return serverNow - (sentAt + receivedAt) / 2;
}

export interface Countdown {
  readonly days: number;
  readonly hours: number;
  readonly minutes: number;
  readonly seconds: number;
  readonly done: boolean;
}

export function countdown(remainingMs: number): Countdown {
  const total = Math.max(0, Math.ceil(remainingMs / 1000));
  return {
    days: Math.floor(total / 86_400),
    hours: Math.floor((total % 86_400) / 3600),
    minutes: Math.floor((total % 3600) / 60),
    seconds: total % 60,
    done: total === 0,
  };
}

/**
 * Delay before a client asks for its result once the reveal signal arrives:
 * spreads thousands of requests over a few seconds while the animation plays.
 * `random` is a number in [0, 1).
 */
export function revealDelayMs(random: number, windowMs: number = PACT_RULES.revealJitterMs): number {
  return Math.floor(Math.min(Math.max(random, 0), 0.999_999) * windowMs);
}

/**
 * Window over which clients spread their result requests: the animation's
 * window for a small season, longer for a big one, so that requests reach the
 * API no faster than it serves results (`resultsPerSecond`, the capacity of
 * the deployment, measured with infra/load). An overloaded API would make
 * everyone wait longer, messages included.
 */
export function revealWindowMs(
  participants: number,
  resultsPerSecond: number = PACT_RULES.revealResultsPerSecond,
): number {
  const needed = Math.ceil((Math.max(participants, 0) / Math.max(resultsPerSecond, 1)) * 1000);
  return Math.max(PACT_RULES.revealJitterMs, needed);
}
