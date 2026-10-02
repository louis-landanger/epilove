"use client";

import type { WaitlistStats } from "@epilove/contracts";
import { useSyncExternalStore } from "react";

/**
 * Live waiting list statistics, shared by the hero counter and the school race:
 * one poll every 20 seconds for the whole page, paused while the tab is hidden.
 * The RPC client is loaded lazily so it stays out of the initial JavaScript.
 */
const POLL_MS = 20_000;

let current: WaitlistStats | null = null;
const listeners = new Set<() => void>();
let timer: ReturnType<typeof setTimeout> | undefined;
let inFlight: Promise<void> | null = null;

async function fetchStats(): Promise<void> {
  const { createApiClient } = await import("@epilove/contracts/client");
  const client = createApiClient({ url: `${window.location.origin}/api/rpc` });
  try {
    current = await client.waitlist.stats();
    for (const listener of listeners) {
      listener();
    }
  } catch {
    // Keep the last known values; the next poll retries.
  }
}

/** Fetches fresh statistics now (after joining, for instance). */
export function refreshWaitlistStats(): Promise<void> {
  inFlight ??= fetchStats().finally(() => {
    inFlight = null;
  });
  return inFlight;
}

function schedule(delay: number = POLL_MS) {
  clearTimeout(timer);
  timer = setTimeout(async () => {
    if (document.visibilityState === "visible") {
      await refreshWaitlistStats();
    }
    if (listeners.size > 0) {
      schedule();
    }
  }, delay);
}

function onVisibilityChange() {
  if (document.visibilityState === "visible") {
    void refreshWaitlistStats();
    schedule();
  }
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  if (listeners.size === 1) {
    document.addEventListener("visibilitychange", onVisibilityChange);
    // The server snapshot may be a few seconds old (static page, revalidated
    // every 30 s): refresh soon after load, once the page has settled.
    schedule(current ? POLL_MS : 2_500);
  }
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) {
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    }
  };
}

/** The latest statistics, starting from the server-rendered snapshot. */
export function useWaitlistStats(initial: WaitlistStats | null): WaitlistStats | null {
  return useSyncExternalStore(
    subscribe,
    () => current ?? initial,
    () => initial,
  );
}
