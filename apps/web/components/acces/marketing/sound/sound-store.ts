"use client";

import { useSyncExternalStore } from "react";
import { SOUND_STORAGE_KEY } from "./notes";

/** Sound on or off, remembered in this browser only; off by default. */
let enabled: boolean | null = null;
const listeners = new Set<() => void>();

function read(): boolean {
  if (enabled === null) {
    try {
      enabled = window.localStorage.getItem(SOUND_STORAGE_KEY) === "on";
    } catch {
      enabled = false;
    }
  }
  return enabled;
}

export function setSoundEnabled(next: boolean) {
  enabled = next;
  try {
    window.localStorage.setItem(SOUND_STORAGE_KEY, next ? "on" : "off");
  } catch {
    // Not remembered: fine.
  }
  for (const listener of listeners) listener();
}

export function useSoundEnabled(): boolean {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    read,
    () => false,
  );
}
