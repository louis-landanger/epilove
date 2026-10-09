"use client";

import { type CityView, cityViewFor } from "@atomes/three";
import { useEffect, useRef, useState } from "react";
import { afterLoadAndIdle } from "../live-scene";
import type { CityWorkerMessage, CityWorkerReply } from "./city.worker";
import { publishCityFlight } from "./city-flight";

const PLAN_URL = "/apercu/fleuves/lyon-plan.bin";

const box = (element: Element) => {
  const rect = element.getBoundingClientRect();
  return { left: rect.left, top: rect.top, width: rect.width, height: rect.height };
};

/**
 * The plan of Lyon in dots, behind the rivers hero (fleuves-hero.tsx): some
 * hundred and fifty thousand of them along the streets, the railways and in
 * the parks, lit up from the campus outwards once the page has loaded,
 * with a torch of light under the pointer. Drawn in 2D, in a worker when the
 * browser allows it: no GPU needed, the same crisp dots on every device. It
 * fits the map's box (`[data-field-rivers]`) as the ion field's rivers do,
 * so the streets line the rivers' banks. Once lit, it hands its dots to the
 * ion field (city-flight.ts), which takes over as the page scrolls and flies
 * them into the logo mark; meanwhile this canvas is hidden.
 */
export function CityCanvas() {
  const containerRef = useRef<HTMLDivElement>(null);
  const [lit, setLit] = useState(false);

  useEffect(() => {
    const container = containerRef.current;
    const map = container?.closest("section")?.querySelector("[data-field-rivers]");
    if (!container || !map) {
      return;
    }
    const reveal = !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const finePointer = window.matchMedia("(hover: hover) and (pointer: fine)").matches;
    const measure = (): CityView =>
      cityViewFor(box(map), box(container), Math.min(2, window.devicePixelRatio || 1));

    // Fresh canvases each time: a canvas handed to a worker cannot be handed over again.
    const base = document.createElement("canvas");
    base.className = "fleuves-city-base";
    const torch = finePointer ? document.createElement("canvas") : null;
    if (torch) {
      torch.className = "fleuves-city-torch";
    }
    container.append(...(torch ? [base, torch] : [base]));

    let disposed = false;
    const cleanups: Array<() => void> = [
      () => {
        disposed = true;
      },
      () => base.remove(),
      () => torch?.remove(),
      () => publishCityFlight(null),
    ];
    let send: (message: CityWorkerMessage) => void = () => {};

    const start = async () => {
      const view = measure();
      if (typeof Worker === "function" && "transferControlToOffscreen" in base) {
        const worker = new Worker(new URL("./city.worker.ts", import.meta.url), { type: "module" });
        cleanups.push(() => worker.terminate());
        worker.onmessage = (event: MessageEvent<CityWorkerReply>) => {
          if (event.data.type === "lit") {
            setLit(true);
          } else if (event.data.type === "flight" && !disposed) {
            publishCityFlight(event.data.flight);
          }
        };
        const baseSurface = base.transferControlToOffscreen();
        const torchSurface = torch ? torch.transferControlToOffscreen() : null;
        worker.postMessage(
          { type: "start", base: baseSurface, torch: torchSurface, url: PLAN_URL, view, reveal },
          torchSurface ? [baseSurface, torchSurface] : [baseSurface],
        );
        send = (message) => worker.postMessage(message);
      } else {
        // No OffscreenCanvas: the same drawing, on the page's own canvases.
        const { createCityRenderer } = await import("./city-renderer");
        if (disposed) {
          return;
        }
        const renderer = createCityRenderer(
          base,
          torch,
          (width, height) => Object.assign(document.createElement("canvas"), { width, height }),
          (flight) => {
            if (!disposed) {
              publishCityFlight(flight);
            }
          },
        );
        cleanups.push(() => renderer.dispose());
        send = (message) => {
          if (message.type === "view") {
            renderer.setView(message.view);
          } else if (message.type === "pointer") {
            renderer.setPointer(message.x, message.y, message.active);
          }
        };
        renderer.start(PLAN_URL, view, reveal).then(
          () => setLit(true),
          () => {},
        );
      }

      const resizeObserver = new ResizeObserver(() => send({ type: "view", view: measure() }));
      resizeObserver.observe(container);
      resizeObserver.observe(map);
      cleanups.push(() => resizeObserver.disconnect());

      if (torch) {
        let frame = 0;
        let last = { x: 0, y: 0, active: false };
        const onPointer = (event: PointerEvent) => {
          const rect = container.getBoundingClientRect();
          const x = event.clientX - rect.left;
          const y = event.clientY - rect.top;
          last = {
            x,
            y,
            active: event.pointerType !== "touch" && x >= 0 && y >= 0 && x <= rect.width && y <= rect.height,
          };
          if (!frame) {
            frame = requestAnimationFrame(() => {
              frame = 0;
              send({ type: "pointer", ...last });
            });
          }
        };
        const onLeave = () => send({ type: "pointer", x: 0, y: 0, active: false });
        window.addEventListener("pointermove", onPointer, { passive: true });
        document.documentElement.addEventListener("pointerleave", onLeave);
        cleanups.push(() => {
          cancelAnimationFrame(frame);
          window.removeEventListener("pointermove", onPointer);
          document.documentElement.removeEventListener("pointerleave", onLeave);
        });
      }
    };

    cleanups.push(afterLoadAndIdle(() => void start()));
    return () => {
      for (const cleanup of cleanups.splice(0)) {
        cleanup();
      }
    };
  }, []);

  return (
    <div ref={containerRef} className="fleuves-city" data-lit={lit ? "true" : "false"} aria-hidden="true" />
  );
}
