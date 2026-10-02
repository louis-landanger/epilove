"use client";

import { type RefObject, useEffect } from "react";

/**
 * Drives the holographic foil of a card from the pointer (desktop) or the
 * gyroscope (phones), through the --mx / --my custom properties. Does nothing
 * when the visitor asked for reduced motion.
 */
export function useFoil(ref: RefObject<HTMLElement | null>, enabled = true) {
  useEffect(() => {
    const element = ref.current;
    if (!element || !enabled || window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      return;
    }
    let frame = 0;
    const set = (x: number, y: number) => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        element.style.setProperty("--mx", `${Math.round(x * 100)}%`);
        element.style.setProperty("--my", `${Math.round(y * 100)}%`);
      });
    };
    const onPointer = (event: PointerEvent) => {
      const rect = element.getBoundingClientRect();
      set((event.clientX - rect.left) / rect.width, (event.clientY - rect.top) / rect.height);
    };
    const onLeave = () => set(0.5, 0.5);
    const onTilt = (event: DeviceOrientationEvent) => {
      if (event.gamma === null || event.beta === null) {
        return;
      }
      const clamp = (v: number) => Math.max(0, Math.min(1, v));
      set(clamp(0.5 + event.gamma / 60), clamp(0.5 + (event.beta - 45) / 60));
    };
    element.addEventListener("pointermove", onPointer);
    element.addEventListener("pointerleave", onLeave);
    window.addEventListener("deviceorientation", onTilt);
    return () => {
      cancelAnimationFrame(frame);
      element.removeEventListener("pointermove", onPointer);
      element.removeEventListener("pointerleave", onLeave);
      window.removeEventListener("deviceorientation", onTilt);
    };
  }, [ref, enabled]);
}
