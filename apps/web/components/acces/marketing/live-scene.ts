import type { DeviceProfile } from "@atomes/three";

/**
 * What the landing's live ion field needs to know before starting: the
 * device, its GPU, and a moment when the page is ready for it.
 */

export function deviceProfile(): DeviceProfile {
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

/** The GPU behind WebGL, to skip the scenes on software rasterisers (no acceleration). */
export function rendererName(): string | null {
  try {
    const probe = document.createElement("canvas");
    const gl = probe.getContext("webgl2") ?? probe.getContext("webgl");
    if (!gl) {
      return null;
    }
    const info = gl.getExtension("WEBGL_debug_renderer_info");
    const name: unknown = gl.getParameter(info ? info.UNMASKED_RENDERER_WEBGL : gl.RENDERER);
    gl.getExtension("WEBGL_lose_context")?.loseContext();
    return typeof name === "string" ? name : null;
  } catch {
    return null;
  }
}

/** Runs `task` once the page has loaded and the main thread is idle: the 3D never competes with LCP. */
export function afterLoadAndIdle(task: () => void): () => void {
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

/**
 * Switches in the page's address, to try the landing on a device:
 * - `?debug=field` shows the field's diagnostics over the page (field-hud.ts),
 *   and `&no=grain,backdrop,filters,anim,field,cap` turns the named costs off
 *   (marketing.css, trial switches; the field itself and its frame rate cap on
 *   touch screens, ion-field-canvas.tsx), to compare;
 * - development only, `?field=live` runs the scenes on software renderers too,
 *   at full quality, and `&particles=8000` sets the ion field's particle count
 *   (to preview another device's budget).
 */
export function landingSwitches(): {
  readonly forced: boolean;
  readonly particles: number;
  readonly debug: boolean;
  readonly off: readonly string[];
} {
  const query = new URLSearchParams(window.location.search);
  const forced = process.env.NODE_ENV !== "production" && query.get("field") === "live";
  return {
    forced,
    particles: forced ? Number(query.get("particles")) || 0 : 0,
    debug: query.get("debug") === "field",
    off: query.get("no")?.split(",") ?? [],
  };
}
