"use client";

import { useSyncExternalStore } from "react";

/** Chromium's install prompt event (not in the DOM typings). */
interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  readonly userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

interface InstallState {
  readonly canPrompt: boolean;
  readonly installed: boolean;
}

let deferred: BeforeInstallPromptEvent | null = null;
let state: InstallState = { canPrompt: false, installed: false };
const SERVER_STATE: InstallState = { canPrompt: false, installed: false };
const listeners = new Set<() => void>();
let listening = false;

function set(next: Partial<InstallState>) {
  state = { ...state, ...next };
  for (const listener of listeners) listener();
}

function isStandalone() {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

/**
 * Keeps the browser's install prompt for our own button (Android, desktop
 * Chromium). The event fires once per page load, so the listener is set up
 * by the app shell, before the guide is opened.
 */
export function listenForInstallPrompt() {
  if (listening || typeof window === "undefined") {
    return;
  }
  listening = true;
  set({ installed: isStandalone() });
  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    deferred = event as BeforeInstallPromptEvent;
    set({ canPrompt: true });
  });
  window.addEventListener("appinstalled", () => {
    deferred = null;
    set({ canPrompt: false, installed: true });
  });
}

export async function promptInstall(): Promise<boolean> {
  const event = deferred;
  if (!event) {
    return false;
  }
  deferred = null;
  set({ canPrompt: false });
  await event.prompt();
  const { outcome } = await event.userChoice;
  return outcome === "accepted";
}

export function useInstallState(): InstallState {
  return useSyncExternalStore(
    (listener) => {
      listenForInstallPrompt();
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => state,
    () => SERVER_STATE,
  );
}
