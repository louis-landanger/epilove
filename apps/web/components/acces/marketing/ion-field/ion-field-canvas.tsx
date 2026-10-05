"use client";

import {
  canAffordLiveField,
  isSoftwareRenderer,
  type PixelBox,
  particleBudget,
  SCHOOL_KEYS,
} from "@atomes/three";
import { useEffect, useRef, useState } from "react";
import { afterLoadAndIdle, deviceProfile, forcedLiveScenes, rendererName } from "../live-scene";
import { type JourneyMeasures, journey } from "./journey";

const toBox = (element: Element): PixelBox => {
  const rect = element.getBoundingClientRect();
  return { left: rect.left, top: rect.top, width: rect.width, height: rect.height };
};

/**
 * Reads the page for the field's journey (journey.ts). Elements and their
 * static styles are looked up once (and again on resize); positions are read
 * every frame, so the formations stick to the page while it scrolls. The
 * sections far below the fold are rendered only when they come near
 * (`content-visibility: auto`): their contents are read only from then on,
 * so the field never forces their layout early.
 */
function createPageMeasurer() {
  let elements = lookUp();

  function lookUp() {
    const steps = [...document.querySelectorAll<HTMLElement>("[data-step]")];
    const firstCard = steps[0]?.querySelector("article");
    const rack = document.querySelector("[data-field-rack]");
    const pact = document.querySelector("[data-field-pact]");
    return {
      rackSection: rack?.closest("section") ?? null,
      pactSection: pact?.closest("section") ?? null,
      scope: document.querySelector("[data-field-scope]"),
      cards: steps.flatMap((step) => {
        const card = step.querySelector("article");
        return card ? [{ card, stuckTop: Number.parseFloat(getComputedStyle(step).top) || 0 }] : [];
      }),
      cardRadius: firstCard ? Number.parseFloat(getComputedStyle(firstCard).borderTopLeftRadius) || 0 : 0,
      cardList: document.querySelector("[data-steps]"),
      rack,
      tubes: SCHOOL_KEYS.map((school) => {
        const slot = document.querySelector(`[data-tube="${school}"]`);
        const glass = slot?.querySelector(".tube-glass");
        const liquid = slot?.querySelector(".tube-liquid");
        return glass && liquid ? { glass, liquid } : null;
      }),
      pact,
      covers: [...document.querySelectorAll("[data-field-cover]")],
    };
  }

  return {
    refresh() {
      elements = lookUp();
    },
    measure(): JourneyMeasures {
      const height = window.innerHeight;
      const near = (section: Element | null) => {
        if (!section) {
          return true;
        }
        const rect = section.getBoundingClientRect();
        return rect.bottom > -1.5 * height && rect.top < 2.5 * height;
      };
      const raceNear = near(elements.rackSection);
      return {
        width: window.innerWidth,
        height,
        scope: elements.scope ? toBox(elements.scope) : null,
        cards: elements.cards.map(({ card, stuckTop }) => ({ box: toBox(card), stuckTop })),
        cardList: elements.cardList ? toBox(elements.cardList) : null,
        cardRadius: elements.cardRadius,
        rack: elements.rack && raceNear ? toBox(elements.rack) : null,
        tubes: elements.tubes.map((tube) => {
          if (!tube || !raceNear) {
            return null;
          }
          const box = toBox(tube.glass);
          // The liquid's surface, as the CSS transition raises it.
          const surface = tube.liquid.getBoundingClientRect().top;
          const level = Math.min(1, Math.max(0, (box.top + box.height - surface) / Math.max(1, box.height)));
          return { box, level };
        }),
        pact: elements.pact && near(elements.pactSection) ? toBox(elements.pact) : null,
        covers: elements.covers.map(toBox),
      };
    },
  };
}

/**
 * The live ion field (docs/02-design.md, section 5), behind the whole landing.
 * The three.js chunk is imported only after load, when motion is allowed and
 * the device can afford it; otherwise there is no field. Dim dust drifting
 * behind the hero's molecule, the particles gather into the logo mark beside
 * the manifesto, then trace the stacked cards, fill the school race tubes
 * and orbit the Pact (journey.ts).
 */
export function IonFieldCanvas({ className }: { className?: string }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [live, setLive] = useState(false);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) {
      return;
    }
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const { forced, particles: forcedCount } = forcedLiveScenes();
    if (reducedMotion.matches || (!forced && !canAffordLiveField(deviceProfile()))) {
      return;
    }

    let disposed = false;
    const cleanups: Array<() => void> = [];

    const start = async (forceWebGL = false) => {
      if (!forced && isSoftwareRenderer(rendererName())) {
        // No GPU acceleration: the poster stays rather than hogging the main thread.
        return;
      }
      try {
        const { createIonField } = await import("@atomes/three/ion-field");
        if (disposed) {
          return;
        }
        const profile = deviceProfile();
        const page = createPageMeasurer();
        let followPage = () => {};
        const field = await createIonField({
          container,
          particleCount: (backend) => (forcedCount > 0 ? forcedCount : particleBudget(backend, profile)),
          adaptiveQuality: !forced,
          beforeFrame: () => followPage(),
          // The particles start in the shapes on screen (a reload further down the page).
          initialFormations: journey(page.measure()).formations,
          onFirstFrame: () => setLive(true),
          // The device cannot keep up even at the lowest quality: back to the poster for good.
          onGiveUp: () => {
            setLive(false);
            for (const cleanup of cleanups.splice(0)) {
              cleanup();
            }
          },
          // A frame failed after start-up: back to the poster.
          forceWebGL,
          onError: () => {
            setLive(false);
            // WebGPU failed after start-up (device lost…): start again on WebGL2.
            if (!forceWebGL && !disposed) {
              for (const cleanup of cleanups.splice(0)) {
                cleanup();
              }
              void start(true);
            }
          },
        });
        if (disposed) {
          field.dispose();
          return;
        }
        container.dataset.backend = field.backend;
        cleanups.push(() => field.dispose());

        // Run only while something shows: in the foreground tab, not behind an opaque
        // section, and not while the shape holding the particles is off screen.
        // Hidden, the field fades out first and only then rests: particles still on
        // their way never freeze in view (a jump down the page, for instance).
        let hidden = journey(page.measure()).hidden;
        let restTimer = 0;
        const update = () => {
          window.clearTimeout(restTimer);
          container.dataset.resting = hidden ? "true" : "false";
          if (document.visibilityState !== "visible") {
            field.setRunning(false);
          } else if (hidden) {
            restTimer = window.setTimeout(() => field.setRunning(false), 1300);
          } else {
            field.setRunning(true);
          }
        };
        const setHidden = (next: boolean) => {
          if (next !== hidden) {
            hidden = next;
            update();
          }
        };

        // Every frame: where the page stands in the journey.
        followPage = () => {
          const state = journey(page.measure());
          field.setFormations(state.formations);
          setHidden(state.hidden);
        };

        // While the field rests, scrolling wakes it up.
        let scrollFrame = 0;
        const onScroll = () => {
          cancelAnimationFrame(scrollFrame);
          scrollFrame = requestAnimationFrame(() => setHidden(journey(page.measure()).hidden));
        };
        window.addEventListener("scroll", onScroll, { passive: true });
        document.addEventListener("visibilitychange", update);
        cleanups.push(() => {
          window.clearTimeout(restTimer);
          delete container.dataset.resting;
          cancelAnimationFrame(scrollFrame);
          window.removeEventListener("scroll", onScroll);
          document.removeEventListener("visibilitychange", update);
        });
        update();

        const resizeObserver = new ResizeObserver(() => {
          field.resize(container.clientWidth, container.clientHeight);
          page.refresh();
        });
        resizeObserver.observe(container);
        cleanups.push(() => resizeObserver.disconnect());

        // The pointer (or finger) is a charged particle; a click or tap flips its charge.
        const onPointerMove = (event: PointerEvent) => {
          const rect = container.getBoundingClientRect();
          const x = event.clientX - rect.left;
          const y = event.clientY - rect.top;
          const inside = x >= 0 && y >= 0 && x <= rect.width && y <= rect.height;
          field.setPointer(
            x,
            y,
            inside && (event.pointerType !== "touch" || event.buttons > 0 || event.pressure > 0),
          );
        };
        const onPointerEnd = (event: PointerEvent) => {
          if (event.pointerType === "touch") {
            field.setPointer(0, 0, false);
          }
        };
        const onLeave = () => field.setPointer(0, 0, false);
        const onClick = (event: MouseEvent) => {
          const target = event.target as Element | null;
          if (target?.closest("a, button, input, label, summary, textarea, select")) {
            return;
          }
          const rect = container.getBoundingClientRect();
          field.setPointer(event.clientX - rect.left, event.clientY - rect.top, true);
          field.pulse();
        };
        window.addEventListener("pointermove", onPointerMove, { passive: true });
        window.addEventListener("pointerup", onPointerEnd, { passive: true });
        window.addEventListener("pointercancel", onPointerEnd, { passive: true });
        document.documentElement.addEventListener("pointerleave", onLeave);
        window.addEventListener("click", onClick);
        cleanups.push(() => {
          window.removeEventListener("pointermove", onPointerMove);
          window.removeEventListener("pointerup", onPointerEnd);
          window.removeEventListener("pointercancel", onPointerEnd);
          document.documentElement.removeEventListener("pointerleave", onLeave);
          window.removeEventListener("click", onClick);
        });
      } catch {
        // No WebGPU and no WebGL2, or the chunk failed to load: the poster stays.
        setLive(false);
      }
    };

    cleanups.push(afterLoadAndIdle(() => void start()));

    const onMotionPreference = () => {
      if (reducedMotion.matches) {
        disposed = true;
        setLive(false);
        for (const cleanup of cleanups.splice(0)) {
          cleanup();
        }
      }
    };
    reducedMotion.addEventListener("change", onMotionPreference);

    return () => {
      disposed = true;
      reducedMotion.removeEventListener("change", onMotionPreference);
      for (const cleanup of cleanups.splice(0)) {
        cleanup();
      }
    };
  }, []);

  // The scene creates its own canvas in here (it may need a fresh one to fall back to WebGL2).
  return (
    <div
      ref={containerRef}
      data-ion-field
      data-live={live ? "true" : "false"}
      className={`transition-opacity duration-[1200ms] ease-out ${live ? "opacity-100" : "opacity-0"} ${className ?? ""}`}
    />
  );
}
