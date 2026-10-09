import { colors } from "@atomes/tokens";
import { linearSrgbToHex, tokenToLinearSrgb } from "../colors";
import { CITY_LAYERS, type CityDots } from "./city";
import { CAMPUS, RIVER_MAP } from "./rivers";

/**
 * Paints the plan of Lyon (city.ts) on a 2D canvas, dot by dot: no GPU, no
 * glow, the same crisp dots on every device. Works on a page's canvas or an
 * `OffscreenCanvas` in a worker.
 */

type Context = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;
type Surface = HTMLCanvasElement | OffscreenCanvas;

export interface CityView {
  /** Size of the canvas in CSS pixels, and its pixel ratio. */
  readonly width: number;
  readonly height: number;
  readonly pixelRatio: number;
  /** Where 0 km, 0 km lands on the canvas, in CSS pixels, and how many CSS pixels a kilometre spans. */
  readonly x: number;
  readonly y: number;
  readonly scale: number;
}

export interface ScreenBox {
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly height: number;
}

/**
 * The view that fits RIVER_MAP into `map` (centred, contained), as the
 * rivers formation of the ion field does, on a canvas covering `canvas`:
 * the plan's streets and the field's rivers line up.
 */
export function cityViewFor(map: ScreenBox, canvas: ScreenBox, pixelRatio: number): CityView {
  const mapWidth = RIVER_MAP.maxX - RIVER_MAP.minX;
  const mapHeight = RIVER_MAP.maxY - RIVER_MAP.minY;
  const scale = Math.min(map.width / mapWidth, map.height / mapHeight);
  const centreX = map.left + map.width / 2 - canvas.left;
  const centreY = map.top + map.height / 2 - canvas.top;
  return {
    width: canvas.width,
    height: canvas.height,
    pixelRatio,
    x: centreX - ((RIVER_MAP.minX + RIVER_MAP.maxX) / 2) * scale,
    y: centreY + ((RIVER_MAP.minY + RIVER_MAP.maxY) / 2) * scale,
    scale,
  };
}

/**
 * How each layer is drawn: radius in CSS pixels, opacity, colour token. Main
 * roads light the most, residential streets less, railways least; the parks
 * are a faint stipple of volt. The rivers, in the field, outshine them all.
 */
export const CITY_LOOK: ReadonlyArray<{ radius: number; alpha: number; color: "paper" | "volt" }> = [
  { radius: 1.05, alpha: 0.6, color: "paper" },
  { radius: 1, alpha: 0.52, color: "paper" },
  { radius: 0.92, alpha: 0.4, color: "paper" },
  { radius: 0.88, alpha: 0.3, color: "paper" },
  { radius: 0.66, alpha: 0.1, color: "paper" },
  { radius: 0.8, alpha: 0.24, color: "volt" },
];

/** The plan is brightest around the campus and dims with distance (kilometres): a drawing, not a map. */
const FOCUS = { x: CAMPUS[0], y: CAMPUS[1], reach: 4.8, floor: 0.3 } as const;
/** Cells of the grid that finds the dots near the pointer, in kilometres. */
const CELL = 0.25;
/** How much the torch adds to the dots it lights, at its centre. */
const TORCH_GAIN = 1.6;

export interface CityPainter {
  /** Paints, over what is already there, the dots whose order is in (from, to]: the plan lights up. */
  paint(context: Context, view: CityView, from: number, to: number): void;
  /**
   * Lights the dots within `radius` CSS pixels of (x, y), on a canvas of
   * their own; returns the rectangle it drew in (device pixels), to clear
   * it next time.
   */
  torch(
    context: Context,
    view: CityView,
    x: number,
    y: number,
    radius: number,
  ): { x: number; y: number; width: number; height: number };
}

/** A small disc of the layer's colour, its edge anti-aliased, the size it takes on screen. */
function sprite(makeSurface: (width: number, height: number) => Surface, radius: number, color: string) {
  const size = Math.max(2, Math.ceil(radius * 2 + 2));
  const surface = makeSurface(size, size);
  const context = surface.getContext("2d") as Context | null;
  if (context) {
    const centre = size / 2;
    const gradient = context.createRadialGradient(centre, centre, 0, centre, centre, radius + 0.5);
    gradient.addColorStop(0, color);
    gradient.addColorStop(Math.max(0, (radius - 0.5) / (radius + 0.5)), color);
    gradient.addColorStop(1, `${color}00`);
    context.fillStyle = gradient;
    context.fillRect(0, 0, size, size);
  }
  return { surface, size };
}

export function createCityPainter(
  dots: CityDots,
  makeSurface: (width: number, height: number) => Surface,
): CityPainter {
  const { count, x, y, layer, light, order } = dots;

  // Each dot's opacity, once and for all.
  const alpha = new Float32Array(count);
  for (let index = 0; index < count; index += 1) {
    const look = CITY_LOOK[layer[index] ?? CITY_LAYERS.minor];
    const dx = (x[index] ?? 0) - FOCUS.x;
    const dy = (y[index] ?? 0) - FOCUS.y;
    const focus =
      FOCUS.floor + (1 - FOCUS.floor) * Math.exp(-(dx * dx + dy * dy) / (FOCUS.reach * FOCUS.reach));
    alpha[index] = Math.min(1, (look?.alpha ?? 0.3) * (light[index] ?? 1) * focus);
  }

  // The dots in the order they light up.
  const byOrder = Uint32Array.from({ length: count }, (_, index) => index).sort(
    (a, b) => (order[a] ?? 0) - (order[b] ?? 0),
  );
  const firstAfter = (value: number) => {
    let low = 0;
    let high = count;
    while (low < high) {
      const middle = (low + high) >> 1;
      if ((order[byOrder[middle] ?? 0] ?? 0) <= value) {
        low = middle + 1;
      } else {
        high = middle;
      }
    }
    return low;
  };

  // A grid of the dots, to find those near the pointer.
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  for (let index = 0; index < count; index += 1) {
    minX = Math.min(minX, x[index] ?? 0);
    maxX = Math.max(maxX, x[index] ?? 0);
    minY = Math.min(minY, y[index] ?? 0);
    maxY = Math.max(maxY, y[index] ?? 0);
  }
  const columns = Math.max(1, Math.ceil((maxX - minX) / CELL) + 1);
  const rows = Math.max(1, Math.ceil((maxY - minY) / CELL) + 1);
  const cellOf = (index: number) =>
    Math.floor(((y[index] ?? 0) - minY) / CELL) * columns + Math.floor(((x[index] ?? 0) - minX) / CELL);
  const cellStart = new Uint32Array(columns * rows + 1);
  for (let index = 0; index < count; index += 1) {
    cellStart[cellOf(index) + 1] = (cellStart[cellOf(index) + 1] ?? 0) + 1;
  }
  for (let cell = 1; cell < cellStart.length; cell += 1) {
    cellStart[cell] = (cellStart[cell] ?? 0) + (cellStart[cell - 1] ?? 0);
  }
  const cellItems = new Uint32Array(count);
  const filled = cellStart.slice(0, -1);
  for (let index = 0; index < count; index += 1) {
    const cell = cellOf(index);
    cellItems[filled[cell] ?? 0] = index;
    filled[cell] = (filled[cell] ?? 0) + 1;
  }

  // Sprites for the current pixel ratio.
  let sprites: Array<{ surface: Surface; size: number }> = [];
  let spriteRatio = 0;
  const spritesFor = (pixelRatio: number) => {
    if (pixelRatio !== spriteRatio) {
      sprites = CITY_LOOK.map((look) =>
        sprite(makeSurface, look.radius * pixelRatio, linearSrgbToHex(tokenToLinearSrgb(colors[look.color]))),
      );
      spriteRatio = pixelRatio;
    }
    return sprites;
  };

  const draw = (context: Context, view: CityView, index: number, gain: number) => {
    const ratio = view.pixelRatio;
    const px = (view.x + (x[index] ?? 0) * view.scale) * ratio;
    const py = (view.y - (y[index] ?? 0) * view.scale) * ratio;
    const dot = sprites[layer[index] ?? 0];
    if (!dot || px < -dot.size || py < -dot.size || px > view.width * ratio + dot.size) {
      return;
    }
    if (py > view.height * ratio + dot.size) {
      return;
    }
    context.globalAlpha = Math.min(1, (alpha[index] ?? 0) * gain);
    context.drawImage(dot.surface, px - dot.size / 2, py - dot.size / 2);
  };

  return {
    paint(context, view, from, to) {
      spritesFor(view.pixelRatio);
      context.setTransform(1, 0, 0, 1, 0, 0);
      const end = firstAfter(to);
      for (let rank = firstAfter(from); rank < end; rank += 1) {
        draw(context, view, byOrder[rank] ?? 0, 1);
      }
      context.globalAlpha = 1;
    },
    torch(context, view, pointerX, pointerY, radius) {
      spritesFor(view.pixelRatio);
      context.setTransform(1, 0, 0, 1, 0, 0);
      const kmX = (pointerX - view.x) / view.scale;
      const kmY = (view.y - pointerY) / view.scale;
      const reach = radius / view.scale;
      const fromColumn = Math.max(0, Math.floor((kmX - reach - minX) / CELL));
      const toColumn = Math.min(columns - 1, Math.floor((kmX + reach - minX) / CELL));
      const fromRow = Math.max(0, Math.floor((kmY - reach - minY) / CELL));
      const toRow = Math.min(rows - 1, Math.floor((kmY + reach - minY) / CELL));
      for (let row = fromRow; row <= toRow; row += 1) {
        for (let column = fromColumn; column <= toColumn; column += 1) {
          const cell = row * columns + column;
          for (let item = cellStart[cell] ?? 0; item < (cellStart[cell + 1] ?? 0); item += 1) {
            const index = cellItems[item] ?? 0;
            const distance = Math.hypot((x[index] ?? 0) - kmX, (y[index] ?? 0) - kmY) / reach;
            if (distance < 1) {
              const fade = 1 - distance * distance;
              draw(context, view, index, TORCH_GAIN * fade * fade);
            }
          }
        }
      }
      context.globalAlpha = 1;
      const ratio = view.pixelRatio;
      const margin = 4 * ratio;
      return {
        x: Math.floor((pointerX - radius) * ratio - margin),
        y: Math.floor((pointerY - radius) * ratio - margin),
        width: Math.ceil(2 * radius * ratio + 2 * margin),
        height: Math.ceil(2 * radius * ratio + 2 * margin),
      };
    },
  };
}
