"use client";

import { useEffect, useRef } from "react";
import type { SoundEngine } from "./sound-engine";
import { useSoundEnabled } from "./sound-store";

/**
 * Plays the landing's sounds while the switch is on: a tick over links and
 * buttons (mouse only), a bell when the ion field is touched or a hero asks
 * for one (an `atomes:chime` event), a breath when a section comes into view.
 * Silent in background tabs.
 */
export function SoundDesign() {
  const enabled = useSoundEnabled();
  const engineRef = useRef<SoundEngine | null>(null);

  useEffect(() => {
    if (!enabled) {
      engineRef.current?.setAudible(false);
      return;
    }
    let cancelled = false;
    const cleanups: Array<() => void> = [];

    const start = async () => {
      if (!engineRef.current) {
        const { createSoundEngine } = await import("./sound-engine");
        if (cancelled) return;
        engineRef.current = createSoundEngine();
      }
      const engine = engineRef.current;
      engine.setAudible(document.visibilityState === "visible");

      const onOver = (event: PointerEvent) => {
        if (event.pointerType !== "mouse") return;
        const target = event.target as Element | null;
        const interactive = target?.closest("a, button, [data-magnetic]");
        const from = (event.relatedTarget as Element | null)?.closest("a, button, [data-magnetic]");
        if (interactive && interactive !== from) engine.tick();
      };
      let step = 0;
      const ring = () => {
        step += 1 + Math.floor(Math.random() * 3);
        engine.chime(step);
      };
      const onDown = (event: PointerEvent) => {
        if ((event.target as Element | null)?.closest("[data-ion-field]")) {
          ring();
        }
      };
      const onVisibility = () => engine.setAudible(document.visibilityState === "visible");
      const heard = new Set<Element>();
      const observer = new IntersectionObserver(
        (entries) => {
          for (const entry of entries) {
            if (entry.isIntersecting && !heard.has(entry.target)) {
              heard.add(entry.target);
              engine.swell();
            }
          }
        },
        { threshold: 0.35 },
      );
      for (const section of document.querySelectorAll("main section")) observer.observe(section);
      document.addEventListener("pointerover", onOver);
      document.addEventListener("pointerdown", onDown);
      document.addEventListener("atomes:chime", ring);
      document.addEventListener("visibilitychange", onVisibility);
      cleanups.push(() => {
        observer.disconnect();
        document.removeEventListener("pointerover", onOver);
        document.removeEventListener("pointerdown", onDown);
        document.removeEventListener("atomes:chime", ring);
        document.removeEventListener("visibilitychange", onVisibility);
      });
    };

    // Browsers only let audio start after a gesture: the switch itself, or the first one after a reload.
    if (navigator.userActivation?.hasBeenActive ?? true) {
      void start();
    } else {
      const once = () => void start();
      window.addEventListener("pointerdown", once, { once: true });
      window.addEventListener("keydown", once, { once: true });
      cleanups.push(() => {
        window.removeEventListener("pointerdown", once);
        window.removeEventListener("keydown", once);
      });
    }

    return () => {
      cancelled = true;
      engineRef.current?.setAudible(false);
      for (const cleanup of cleanups) cleanup();
    };
  }, [enabled]);

  useEffect(
    () => () => {
      void engineRef.current?.dispose();
      engineRef.current = null;
    },
    [],
  );

  return null;
}
