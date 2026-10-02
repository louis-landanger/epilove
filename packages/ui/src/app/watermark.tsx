"use client";

import { createContext, type ReactNode, useContext, useId } from "react";
import { cn } from "../cn";

const WatermarkContext = createContext<string | null>(null);

/** Provides the viewer's watermark code (SAF-12) to every photo below. */
export function WatermarkProvider({ code, children }: { code: string | null; children: ReactNode }) {
  return <WatermarkContext.Provider value={code}>{children}</WatermarkContext.Provider>;
}

export function useWatermarkCode(): string | null {
  return useContext(WatermarkContext);
}

/**
 * A discreet pattern repeating the viewer's code over a photo, in light and
 * dark so it shows on any image: a shared screenshot says whose screen it
 * came from. Put it inside the photo's positioned container.
 */
export function Watermark({ code, className }: { code: string; className?: string }) {
  const id = `wm${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;
  return (
    <svg
      aria-hidden="true"
      data-watermark={code}
      className={cn("pointer-events-none absolute inset-0 size-full select-none", className)}
    >
      <defs>
        <pattern id={id} width="150" height="96" patternUnits="userSpaceOnUse" patternTransform="rotate(-24)">
          <text
            x="4"
            y="22"
            fontFamily="ui-monospace, monospace"
            fontSize="11"
            letterSpacing="2"
            fill="#fff"
            fillOpacity="0.11"
          >
            {code}
          </text>
          <text
            x="79"
            y="70"
            fontFamily="ui-monospace, monospace"
            fontSize="11"
            letterSpacing="2"
            fill="#000"
            fillOpacity="0.09"
          >
            {code}
          </text>
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill={`url(#${id})`} />
    </svg>
  );
}

/** The watermark of the current viewer, if a provider gave one. */
export function ViewerWatermark({ className }: { className?: string }) {
  const code = useWatermarkCode();
  return code ? <Watermark code={code} className={className} /> : null;
}
