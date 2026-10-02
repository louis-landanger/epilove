"use client";

import { canAffordLiveField, type DeviceProfile, particleBudget } from "@epilove/three";
import { useEffect, useRef, useState } from "react";

function deviceProfile(): DeviceProfile {
  const nav = navigator as Navigator & {
    deviceMemory?: number;
    connection?: { saveData?: boolean };
  };
  return {
    cores: nav.hardwareConcurrency || 4,
    memoryGb: nav.deviceMemory,
    coarsePointer: window.matchMedia("(pointer: coarse)").matches,
    saveData: nav.connection?.saveData === true,
    viewportArea: window.innerWidth * window.innerHeight,
  };
}

/** Runs `task` once the page has loaded and the main thread is idle: the 3D never competes with LCP. */
function afterLoadAndIdle(task: () => void): () => void {
  let cancelled = false;
  let idleHandle: number | undefined;
  const run = () => {
    if (cancelled) {
      return;
    }
    if (typeof window.requestIdleCallback === "function") {
      idleHandle = window.requestIdleCallback(task, { timeout: 2500 });
    } else {
      idleHandle = window.setTimeout(task, 400);
    }
  };
  if (document.readyState === "complete") {
    run();
  } else {
    window.addEventListener("load", run, { once: true });
  }
  return () => {
    cancelled = true;
    window.removeEventListener("load", run);
    if (idleHandle !== undefined) {
      if (typeof window.cancelIdleCallback === "function") {
        window.cancelIdleCallback(idleHandle);
      } else {
        window.clearTimeout(idleHandle);
      }
    }
  };
}

const smoothstep = (value: number) => {
  const t = Math.min(1, Math.max(0, value));
  return t * t * (3 - 2 * t);
};

/**
 * The live ion field (docs/02-design.md, moment 1), layered over its static
 * poster. The three.js chunk is imported only after load, when motion is
 * allowed and the device can afford it; otherwise the poster stays.
 * The field condenses into the logo mark while `[data-field-scope]` scrolls by.
 */
export function IonFieldCanvas({ className }: { className?: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [live, setLive] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    if (reducedMotion.matches || !canAffordLiveField(deviceProfile())) {
      return;
    }

    let disposed = false;
    const cleanups: Array<() => void> = [];

    const start = async () => {
      try {
        const { createIonField } = await import("@epilove/three/ion-field");
        if (disposed) {
          return;
        }
        const profile = deviceProfile();
        const field = await createIonField({
          canvas,
          width: canvas.clientWidth,
          height: canvas.clientHeight,
          particleCount: (backend) => particleBudget(backend, profile),
          onFirstFrame: () => setLive(true),
        });
        if (disposed) {
          field.dispose();
          return;
        }
        canvas.dataset.backend = field.backend;
        cleanups.push(() => field.dispose());

        // Run only while visible: on screen and in the foreground tab.
        let onScreen = true;
        const update = () => field.setRunning(onScreen && document.visibilityState === "visible");
        const observer = new IntersectionObserver(([entry]) => {
          onScreen = entry?.isIntersecting ?? false;
          update();
        });
        observer.observe(canvas);
        document.addEventListener("visibilitychange", update);
        cleanups.push(() => {
          observer.disconnect();
          document.removeEventListener("visibilitychange", update);
        });
        update();

        const resizeObserver = new ResizeObserver(() =>
          field.resize(canvas.clientWidth, canvas.clientHeight),
        );
        resizeObserver.observe(canvas);
        cleanups.push(() => resizeObserver.disconnect());

        // The pointer (or finger) is a charged particle; a click or tap flips its charge.
        const onPointerMove = (event: PointerEvent) => {
          const rect = canvas.getBoundingClientRect();
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
          const rect = canvas.getBoundingClientRect();
          if (event.clientY >= rect.top && event.clientY <= rect.bottom) {
            field.setPointer(event.clientX - rect.left, event.clientY - rect.top, true);
            field.pulse();
          }
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

        // Condense into the logo mark while the hero scrolls away.
        const scope = canvas.closest<HTMLElement>("[data-field-scope]");
        const backdrop = canvas.parentElement;
        if (scope) {
          let frame = 0;
          const onScroll = () => {
            cancelAnimationFrame(frame);
            frame = requestAnimationFrame(() => {
              const rect = scope.getBoundingClientRect();
              const viewport = window.innerHeight;
              field.setCondense(smoothstep(-rect.top / (viewport * 0.85)));
              // Fade out as the manifesto leaves, before the next section slides under the mark.
              if (backdrop) {
                backdrop.style.opacity = String(
                  smoothstep((rect.bottom - viewport * 0.3) / (viewport * 0.7)),
                );
              }
            });
          };
          window.addEventListener("scroll", onScroll, { passive: true });
          onScroll();
          cleanups.push(() => {
            cancelAnimationFrame(frame);
            window.removeEventListener("scroll", onScroll);
            backdrop?.style.removeProperty("opacity");
          });
        }
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

  return (
    <canvas
      ref={canvasRef}
      data-live={live ? "true" : "false"}
      className={`transition-opacity duration-[1200ms] ease-out ${live ? "opacity-100" : "opacity-0"} ${className ?? ""}`}
    />
  );
}
