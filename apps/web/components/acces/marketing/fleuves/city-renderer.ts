import {
  type CityFlight,
  type CityPainter,
  type CityView,
  cityDots,
  cityFlight,
  createCityPainter,
  decodeCityPlan,
} from "@atomes/three";

/**
 * Draws the plan of Lyon behind the rivers hero (city-canvas.tsx): fetches
 * it, lays its dots out, lights them up from the campus outwards, and keeps
 * a torch of light under the pointer. Once lit, hands its dots over
 * (`onFlight`) for the ion field to fly them into the logo mark as the page
 * scrolls. Runs in a worker on two `OffscreenCanvas` (city.worker.ts), or on
 * the page's own canvases where the browser cannot hand them to a worker.
 */

type Surface = HTMLCanvasElement | OffscreenCanvas;
type Context = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

/** How long the city takes to light up, in milliseconds. */
const REVEAL_MS = 2600;
/** Radius of the torch under the pointer, in CSS pixels. */
export const TORCH_RADIUS = 150;

export interface CityRenderer {
  /** Fetches and draws the plan; resolves once the whole city is lit. */
  start(url: string, view: CityView, reveal: boolean): Promise<void>;
  setView(view: CityView): void;
  /** Pointer in CSS pixels on the canvas; `active` false when it leaves. */
  setPointer(x: number, y: number, active: boolean): void;
  dispose(): void;
}

const sameView = (a: CityView | null, b: CityView) =>
  a !== null &&
  a.width === b.width &&
  a.height === b.height &&
  a.pixelRatio === b.pixelRatio &&
  Math.abs(a.x - b.x) < 0.25 &&
  Math.abs(a.y - b.y) < 0.25 &&
  Math.abs(a.scale - b.scale) < 0.001;

export function createCityRenderer(
  base: Surface,
  torch: Surface | null,
  makeSurface: (width: number, height: number) => Surface,
  onFlight?: (flight: CityFlight) => void,
): CityRenderer {
  const baseContext = base.getContext("2d") as Context | null;
  const torchContext = torch ? (torch.getContext("2d") as Context | null) : null;
  const nextFrame = (callback: () => void) => {
    if (typeof requestAnimationFrame === "function") {
      requestAnimationFrame(() => callback());
    } else {
      setTimeout(callback, 16);
    }
  };

  let painter: CityPainter | null = null;
  let view: CityView | null = null;
  /** How far the city is lit, in the dots' order: 1 once it all is. */
  let lit = 0;
  let disposed = false;
  let pointer = { x: 0, y: 0, active: false };
  let torchScheduled = false;
  let torchDirty: { x: number; y: number; width: number; height: number } | null = null;

  const sizeCanvases = (next: CityView) => {
    const width = Math.max(1, Math.round(next.width * next.pixelRatio));
    const height = Math.max(1, Math.round(next.height * next.pixelRatio));
    for (const surface of torch ? [base, torch] : [base]) {
      // Resizing a canvas clears it, even to the same size: only when it changes.
      if (surface.width !== width || surface.height !== height) {
        surface.width = width;
        surface.height = height;
      }
    }
  };

  const repaint = () => {
    if (!painter || !view || !baseContext) {
      return;
    }
    baseContext.setTransform(1, 0, 0, 1, 0, 0);
    baseContext.clearRect(0, 0, base.width, base.height);
    painter.paint(baseContext, view, -1, lit);
    torchDirty = null;
    drawTorch();
  };

  const drawTorch = () => {
    torchScheduled = false;
    if (!painter || !view || !torchContext || !torch) {
      return;
    }
    torchContext.setTransform(1, 0, 0, 1, 0, 0);
    if (torchDirty) {
      torchContext.clearRect(torchDirty.x, torchDirty.y, torchDirty.width, torchDirty.height);
    } else {
      torchContext.clearRect(0, 0, torch.width, torch.height);
    }
    torchDirty = pointer.active
      ? painter.torch(torchContext, view, pointer.x, pointer.y, TORCH_RADIUS)
      : null;
  };

  return {
    async start(url, firstView, reveal) {
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`The city plan answered ${response.status}.`);
      }
      const dots = cityDots(decodeCityPlan(await response.arrayBuffer()));
      if (disposed) {
        return;
      }
      const painted = createCityPainter(dots, makeSurface);
      painter = painted;
      // The page may have been resized while the plan loaded: its latest view wins.
      view ??= firstView;
      sizeCanvases(view);
      const handOver = () => {
        if (!disposed) {
          onFlight?.(cityFlight(dots, painted.alpha));
        }
      };
      if (!reveal) {
        lit = 1;
        repaint();
        handOver();
        return;
      }
      await new Promise<void>((resolve) => {
        const started = performance.now();
        const step = () => {
          if (disposed || !painter || !view || !baseContext) {
            resolve();
            return;
          }
          const progress = Math.min(1, (performance.now() - started) / REVEAL_MS);
          // Fast at first, then slower towards the outskirts.
          const next = progress >= 1 ? 1 : 1 - (1 - progress) ** 2.2;
          painter.paint(baseContext, view, lit, next);
          lit = next;
          if (progress >= 1) {
            resolve();
          } else {
            nextFrame(step);
          }
        };
        nextFrame(step);
      });
      handOver();
    },
    setView(next) {
      if (sameView(view, next)) {
        return;
      }
      view = next;
      sizeCanvases(next);
      repaint();
    },
    setPointer(x, y, active) {
      pointer = { x, y, active };
      if (!torchScheduled) {
        torchScheduled = true;
        nextFrame(drawTorch);
      }
    },
    dispose() {
      disposed = true;
    },
  };
}
