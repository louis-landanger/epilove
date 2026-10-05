import type { DeviceProfile } from "@atomes/three";

/**
 * What the live 3D scenes of the landing (the hero's molecule, the ion field)
 * need to know before starting: the device, its GPU, and a moment when the
 * page is ready for them.
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
 * Development only: `?field=live` runs the scenes on software renderers too,
 * at full quality, and `&particles=8000` sets the ion field's particle count
 * (to preview another device's budget).
 */
export function forcedLiveScenes(): { readonly forced: boolean; readonly particles: number } {
  const query = new URLSearchParams(window.location.search);
  const forced = process.env.NODE_ENV !== "production" && query.get("field") === "live";
  return { forced, particles: forced ? Number(query.get("particles")) || 0 : 0 };
}
