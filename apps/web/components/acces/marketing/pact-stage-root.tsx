"use client";

import type { ReactNode } from "react";
import { usePactStyle } from "./pact-style";

/**
 * The Pact's stage (pact-stage.tsx), showing the version asked for: the field
 * reads which from `data-pact` (ion-field-canvas.tsx) and draws it with its
 * atoms; CSS shows its face (marketing.css).
 */
export function PactStageRoot({ children }: { children: ReactNode }) {
  "use no memo";
  const style = usePactStyle();
  return (
    <div
      aria-hidden="true"
      data-field-pact
      data-pact={style}
      className={`pact-stage pact-stage-${style} relative mx-auto aspect-square w-full max-w-[30rem]`}
    >
      {children}
    </div>
  );
}
