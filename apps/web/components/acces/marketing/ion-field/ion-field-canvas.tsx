"use client";

import {
  canAffordLiveField,
  isSoftwareRenderer,
  type PixelBox,
  particleBudget,
  SCHOOL_KEYS,
} from "@atomes/three";
import type { FrameTimings, IonField } from "@atomes/three/ion-field";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { onCityFlight, setCityFlying } from "../fleuves/city-flight";
import { afterLoadAndIdle, deviceProfile, landingSwitches, rendererName } from "../live-scene";
import { PACT_REVEAL_AT } from "../pact";
import type { FieldHud } from "./field-hud";
import { type JourneyMeasures, journey } from "./journey";

const toBox = (element: Element): PixelBox => {
  const rect = element.getBoundingClientRect();
  return { left: rect.left, top: rect.top, width: rect.width, height: rect.height };
};

const REVEAL = Date.parse(PACT_REVEAL_AT);

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
    const logo = document.querySelector<HTMLElement>("[data-field-logo]");
    const rivers = document.querySelector("[data-field-rivers]");
    return {
      rivers,
      riversHero: rivers?.closest("section") ?? null,
      manifesto: document.querySelector("[data-field-manifesto]"),
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
      logo,
      logoSection: logo?.closest("section") ?? null,
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
        rivers: elements.rivers?.isConnected ? toBox(elements.rivers) : null,
        riversHero: elements.riversHero?.isConnected ? toBox(elements.riversHero) : null,
        manifesto: elements.manifesto ? toBox(elements.manifesto) : null,
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
        // The school whose logo it shows (the stage sets it as it goes, or as an address is typed).
        logo:
          elements.logo && near(elements.logoSection)
            ? {
                box: toBox(elements.logo),
                school: SCHOOL_KEYS.indexOf(elements.logo.dataset.school as (typeof SCHOOL_KEYS)[number]),
              }
            : null,
        pact: elements.pact && near(elements.pactSection) ? toBox(elements.pact) : null,
        // The countdown's seconds, which the hand of the Pact's dial goes round with.
        pactSeconds: ((((REVEAL - Date.now()) / 1000) % 60) + 60) % 60,
        covers: elements.covers.map(toBox),
      };
    },
  };
}

/**
 * The live ion field (docs/02-design.md, section 5), behind the whole landing.
 * The three.js chunk is imported only after load, when motion is allowed and
 * the device can afford it; otherwise there is no field, and the hero draws
 * its rivers in dots instead. The particles flow down Lyon's two rivers in
 * the hero, gather into the logo mark beside the manifesto with the plan of
 * Lyon as the hero leaves, then trace the stacked cards, fill the school race
 * tubes, draw the schools' logos beside the waiting list and orbit the Pact
 * (journey.ts).
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
    const { forced, particles: forcedCount, debug, off } = landingSwitches();
    let disposed = false;
    const cleanups: Array<() => void> = [];

    // Diagnostics over the page (`?debug=field`, live-scene.ts): their own chunk, loaded only then.
    let liveField: IonField | null = null;
    let hud: FieldHud | null = null;
    if (debug) {
      void import("./field-hud").then((module) => {
        if (disposed) {
          return;
        }
        hud = module.mountFieldHud(container, off);
        cleanups.push(() => hud?.dispose());
        if (liveField) {
          hud.attach(liveField);
        }
      });
    }

    if (reducedMotion.matches || off.includes("field") || (!forced && !canAffordLiveField(deviceProfile()))) {
      return () => {
        disposed = true;
        for (const cleanup of cleanups.splice(0)) {
          cleanup();
        }
      };
    }

    const start = async (forceWebGL = false) => {
      if (!forced && isSoftwareRenderer(rendererName())) {
        // No GPU acceleration: no field, rather than hogging the main thread.
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
        // The hero: Lyon's two rivers, in the plan of Lyon the field flies into the logo.
        const rivers = document.querySelector("[data-field-rivers]") !== null;
        const field = await createIonField({
          container,
          // Lyon's two rivers across the hero need more particles than a shape.
          particleCount: () => (forcedCount > 0 ? forcedCount : particleBudget(profile, rivers)),
          // And particles for the plan's patches of streets to land as in the logo.
          flight: rivers,
          // Past the hero, the shapes light as many as the landing has, as there: the others fuse into them.
          ...(rivers ? { shapeParticles: particleBudget(profile) } : {}),
          // While the field flies the plan's dots, the plan's own canvas steps aside.
          onFlightChange: setCityFlying,
          adaptiveQuality: !forced,
          beforeFrame: () => followPage(),
          ...(debug ? { onFrameTimings: (timings: FrameTimings) => hud?.frame(timings) } : {}),
          // The particles start in the shapes on screen (a reload further down the page).
          initialFormations: journey(page.measure()).formations,
          onFirstFrame: () => setLive(true),
          // For bug reports: how many particles the field draws, at which pixel ratio, once it adapts.
          onQuality: ({ pixelRatio, visibleParticles }) => {
            container.dataset.quality = `${visibleParticles}@${pixelRatio}`;
          },
          // The device cannot keep up even at the lowest quality: no field, for good.
          onGiveUp: () => {
            setLive(false);
            for (const cleanup of cleanups.splice(0)) {
              cleanup();
            }
          },
          // A frame failed after start-up: no field.
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
        liveField = field;
        hud?.attach(field);

        // Run only while something shows: in the foreground tab, not behind an opaque
        // section, and not while the shape holding the particles is off screen.
        // Hidden, the field fades out first and only then rests: particles still on
        // their way never freeze in view (a jump down the page, for instance).
        let hidden = journey(page.measure()).hidden;
        let restTimer = 0;
        let running = false;
        const run = (next: boolean) => {
          running = next;
          field.setRunning(next);
        };
        const update = () => {
          window.clearTimeout(restTimer);
          container.dataset.resting = hidden ? "true" : "false";
          if (document.visibilityState !== "visible") {
            run(false);
          } else if (hidden) {
            restTimer = window.setTimeout(() => run(false), 1300);
          } else {
            run(true);
          }
        };
        const setHidden = (next: boolean) => {
          if (next !== hidden) {
            hidden = next;
            update();
          }
        };

        // The plan of Lyon's dots (fleuves hero), once lit: the field flies them into the mark.
        cleanups.push(
          onCityFlight((flight) => field.setFlight(flight)),
          () => {
            setCityFlying(false);
          },
        );

        // Every frame: where the page stands in the journey.
        followPage = () => {
          const state = journey(page.measure());
          field.setFormations(state.formations);
          setHidden(state.hidden);
        };

        // While the field rests, scrolling wakes it up (running, it follows the page every frame).
        let scrollFrame = 0;
        const onScroll = () => {
          cancelAnimationFrame(scrollFrame);
          if (running) {
            return;
          }
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
        // No WebGPU and no WebGL2, or the chunk failed to load: no field.
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

  // Once the particles flow, the page sets some of its drawings aside (marketing.css), keyed on this
  // attribute of the root, set along with `data-live` before the page paints. Not on
  // `:has([data-live="true"])`: with it, Chrome restyles the whole page at every element added to it
  // or removed from it (the schools' stage swaps its logo every three seconds).
  useLayoutEffect(() => {
    document.documentElement.toggleAttribute("data-field-live", live);
    return () => document.documentElement.removeAttribute("data-field-live");
  }, [live]);

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
