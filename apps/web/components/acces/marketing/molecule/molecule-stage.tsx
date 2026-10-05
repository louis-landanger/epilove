"use client";

import { canAffordLiveField, isSoftwareRenderer } from "@atomes/three";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { afterLoadAndIdle, deviceProfile, forcedLiveScenes, rendererName } from "../live-scene";

/**
 * The hero's molecule: the static poster (its child) under the live scene,
 * which takes over once it draws its first frame. The three.js chunk is
 * imported only after load, when motion is allowed and the device can
 * afford it; otherwise the poster stays. The scene runs only while the stage
 * is on screen in the foreground tab, and leans towards a fine pointer.
 */
export function MoleculeStage({ children, className }: { children: ReactNode; className?: string }) {
  const stageRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [live, setLive] = useState(false);

  useEffect(() => {
    const stage = stageRef.current;
    const container = containerRef.current;
    if (!stage || !container) {
      return;
    }
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const { forced } = forcedLiveScenes();
    if (reducedMotion.matches || (!forced && !canAffordLiveField(deviceProfile()))) {
      return;
    }

    let disposed = false;
    const cleanups: Array<() => void> = [];
    const stop = () => {
      for (const cleanup of cleanups.splice(0)) {
        cleanup();
      }
    };

    const start = async (forceWebGL = false) => {
      if (!forced && isSoftwareRenderer(rendererName())) {
        return;
      }
      try {
        const { createMolecule } = await import("@atomes/three/molecule");
        if (disposed) {
          return;
        }
        const molecule = await createMolecule({
          container,
          forceWebGL,
          onFirstFrame: () => setLive(true),
          // A frame failed after start-up: back to the poster, or again on WebGL2 if WebGPU failed.
          onError: () => {
            setLive(false);
            stop();
            if (!forceWebGL && !disposed) {
              void start(true);
            }
          },
        });
        if (disposed) {
          molecule.dispose();
          return;
        }
        stage.dataset.backend = molecule.backend;
        cleanups.push(() => molecule.dispose());

        let onScreen = true;
        const update = () => molecule.setRunning(onScreen && document.visibilityState === "visible");
        const observer = new IntersectionObserver(([entry]) => {
          onScreen = entry?.isIntersecting ?? true;
          update();
        });
        observer.observe(stage);
        document.addEventListener("visibilitychange", update);
        cleanups.push(() => {
          observer.disconnect();
          document.removeEventListener("visibilitychange", update);
        });
        update();

        const resizeObserver = new ResizeObserver(() =>
          molecule.resize(container.clientWidth, container.clientHeight),
        );
        resizeObserver.observe(container);
        cleanups.push(() => resizeObserver.disconnect());

        if (window.matchMedia("(pointer: fine)").matches) {
          const onPointerMove = (event: PointerEvent) => {
            if (event.pointerType === "touch") {
              return;
            }
            molecule.setPointer(
              (event.clientX / window.innerWidth) * 2 - 1,
              1 - (event.clientY / window.innerHeight) * 2,
              true,
            );
          };
          const onLeave = () => molecule.setPointer(0, 0, false);
          window.addEventListener("pointermove", onPointerMove, { passive: true });
          document.documentElement.addEventListener("pointerleave", onLeave);
          cleanups.push(() => {
            window.removeEventListener("pointermove", onPointerMove);
            document.documentElement.removeEventListener("pointerleave", onLeave);
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
        stop();
      }
    };
    reducedMotion.addEventListener("change", onMotionPreference);

    return () => {
      disposed = true;
      reducedMotion.removeEventListener("change", onMotionPreference);
      stop();
    };
  }, []);

  return (
    <div ref={stageRef} data-molecule data-live={live ? "true" : "false"} className={className}>
      {children}
      <div ref={containerRef} className="molecule-live" />
    </div>
  );
}
