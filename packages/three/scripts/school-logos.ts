/**
 * Writes the schools' logos that the atoms draw beside the waiting list form
 * (src/ion-field/school-logos.gen.ts) and that the page shows in their place
 * without the field (apps/web/public/schools/<school>.svg), from the
 * schools' own files in scripts/school-logos/ (docs/adr/0016-logos-des-ecoles.md).
 *
 *   PW_CHROMIUM_PATH=/path/to/chromium pnpm --filter @atomes/three logos:schools
 *
 * The shape: Chromium draws the school's file, its white parts kept white and
 * every other paint turned black, and the edge of the black is traced
 * (marching squares at half coverage, then simplified to a fraction of a
 * pixel) into outlines of straight segments. Out comes SVG path data (M, Z
 * and implicit lines) to fill with the even-odd rule, the white parts cut out,
 * in a box whose longer side is 100.
 *
 * The colours: the file as published, averaged over a grid of cells across
 * the logo (a 32nd of its longer side), each lifted in lightness so that the
 * schools' dark blues show on the page's dark ink, their hues and contrasts
 * kept. The fallback's files paint that grid inside the outline.
 *
 * The files, fetched on 13 October 2026, are the schools' property:
 * - epita.svg: www.epita.fr (theme image logo-epita.svg), drawn without its baseline;
 * - esme.png: www.ionis-group.com (ESME_LOGO_SEUL_QUADRI_2021.png, 1772 px; ESME publishes no vector file);
 * - supbiotech.svg: www.supbiotech.fr (logo-contourless-supbiotech-72.svg);
 * - isg.svg: www.isg.fr (theme image logo-isg-no-baseline.svg);
 * - ipsa.svg: fr.wikipedia.org (Fichier:Logo_IPSA.svg; IPSA publishes PNGs only), drawn without its baseline.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { chromium, type Page } from "@playwright/test";

const SOURCES_DIRECTORY = new URL("./school-logos/", import.meta.url);
const MODULE = new URL("../src/ion-field/school-logos.gen.ts", import.meta.url);
const PUBLIC_DIRECTORY = new URL("../../../apps/web/public/schools/", import.meta.url);

/** Pixels on the longer side of each drawing. */
const RESOLUTION = 1600;
/** Outlines are simplified to within this many pixels of the drawing (Douglas–Peucker). */
const TOLERANCE = 0.35;
/** Specks smaller than this many square pixels are anti-aliasing, not the logo. */
const SPECK = 4;
/** The longer side of each logo's box, in path units. */
const BOX = 100;
/** Side of the colour grid's cells, in path units. */
const CELL = BOX / 32;
/** Pixels at least this much ink give the cells their colour: edges blend with what lies around. */
const SOLID = 230;
/**
 * Lightness (OKLCH) of black once lifted: each colour's lightness L becomes
 * LIFT + (1 - LIFT) × L, so that a navy blue shows on the dark page and a
 * logo's light parts stay lighter than its dark ones.
 */
const LIFT = 0.55;

interface Source {
  /** The school's name, the title of its file in the fallback. */
  readonly name: string;
  readonly file: string;
  /** Elements of an SVG file left out (CSS selectors): a baseline drawn over the logo. */
  readonly remove?: readonly string[];
  /** Part of an SVG file kept, in its own units (x, y, width, height): a baseline under the logo left out. */
  readonly viewBox?: readonly [number, number, number, number];
  /** For a raster file: the lightness (0 to 1) its coloured parts stay under. Its white is cut out. */
  readonly inkLightness?: number;
}

const SOURCES: Record<"epita" | "esme" | "supbiotech" | "isg" | "ipsa", Source> = {
  epita: { name: "EPITA", file: "epita.svg", remove: ['path[d^="M188.068"]'] },
  esme: { name: "ESME", file: "esme.png", inkLightness: 0.5 },
  supbiotech: { name: "Sup'Biotech", file: "supbiotech.svg" },
  isg: { name: "ISG", file: "isg.svg" },
  ipsa: { name: "IPSA", file: "ipsa.svg", viewBox: [0, 0, 2003.23, 860] },
};

interface Drawing {
  readonly width: number;
  readonly height: number;
  /** How much of each pixel is ink, 0 to 255, row by row. */
  readonly ink: Uint8Array;
  /** Red, green and blue of each pixel of the file as published (sRGB), row by row. */
  readonly colors: Uint8Array;
}

/**
 * Has Chromium draw a school's file twice, as published and in one colour,
 * and reads the colour of each pixel and how much of it is ink.
 */
async function draw(page: Page, source: Source): Promise<Drawing> {
  const bytes = readFileSync(new URL(source.file, SOURCES_DIRECTORY));
  const vector = source.file.endsWith(".svg");
  const drawn = await page.evaluate(
    async ({ vector, text, base64, remove, viewBox, inkLightness, resolution }) => {
      let url = `data:image/png;base64,${base64}`;
      let published = url;
      let width = 0;
      let height = 0;
      if (vector) {
        const root = new DOMParser().parseFromString(text, "image/svg+xml").documentElement;
        // Nothing active: no scripts, no foreign content, no event handlers.
        for (const element of Array.from(root.querySelectorAll("script, foreignObject"))) {
          element.remove();
        }
        for (const element of [root, ...Array.from(root.querySelectorAll("*"))]) {
          for (const { name } of Array.from(element.attributes)) {
            if (name.toLowerCase().startsWith("on")) {
              element.removeAttribute(name);
            }
          }
        }
        for (const selector of remove) {
          for (const element of Array.from(root.querySelectorAll(selector))) {
            element.remove();
          }
        }
        const box =
          viewBox ??
          (root.getAttribute("viewBox") ?? "")
            .trim()
            .split(/[\s,]+/)
            .map(Number);
        const [left = 0, top = 0, boxWidth = 0, boxHeight = 0] = box;
        const scale = resolution / Math.max(boxWidth, boxHeight);
        width = Math.round(boxWidth * scale);
        height = Math.round(boxHeight * scale);
        root.setAttribute("viewBox", `${left} ${top} ${boxWidth} ${boxHeight}`);
        root.setAttribute("width", String(width));
        root.setAttribute("height", String(height));
        root.setAttribute("preserveAspectRatio", "none");
        const svgUrl = () =>
          URL.createObjectURL(
            new Blob([new XMLSerializer().serializeToString(root)], { type: "image/svg+xml" }),
          );
        // As published, for its colours…
        published = svgUrl();
        // …then in one colour, for its ink, in the page for the paints its classes and groups give.
        document.body.replaceChildren(root);
        const white = (paint: string) => {
          const channels = /rgba?\(([^)]*)\)/
            .exec(paint)?.[1]
            ?.split(/[\s,/]+/)
            .map(Number);
          if (!channels) {
            return false;
          }
          const [red = 0, green = 0, blue = 0, alpha = 1] = channels;
          return alpha > 0 && red > 230 && green > 230 && blue > 230;
        };
        const recolour = (paint: string) => (paint === "none" ? "none" : white(paint) ? "#fff" : "#000");
        for (const element of Array.from(
          root.querySelectorAll<SVGElement>("path, rect, circle, ellipse, polygon, polyline, line, text"),
        )) {
          const style = getComputedStyle(element);
          const fill = recolour(style.fill);
          const stroke = recolour(style.stroke);
          element.style.fill = fill;
          element.style.stroke = stroke;
          element.style.opacity = "1";
          element.style.fillOpacity = "1";
          element.style.strokeOpacity = "1";
        }
        url = svgUrl();
        root.remove();
      }
      const pixels = async (source: string) => {
        const image = new Image();
        image.src = source;
        await image.decode();
        if (!vector) {
          const scale = resolution / Math.max(image.naturalWidth, image.naturalHeight);
          width = Math.round(image.naturalWidth * scale);
          height = Math.round(image.naturalHeight * scale);
        }
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const context = canvas.getContext("2d", { willReadFrequently: true });
        if (!context) {
          throw new Error("No 2D canvas");
        }
        context.drawImage(image, 0, 0, width, height);
        return context.getImageData(0, 0, width, height).data;
      };
      const original = await pixels(published);
      const data = await pixels(url);
      const colors = new Uint8Array(width * height * 3);
      for (let pixel = 0; pixel < width * height; pixel += 1) {
        colors[pixel * 3] = original[pixel * 4] ?? 0;
        colors[pixel * 3 + 1] = original[pixel * 4 + 1] ?? 0;
        colors[pixel * 3 + 2] = original[pixel * 4 + 2] ?? 0;
      }
      const ink = new Uint8Array(width * height);
      for (let pixel = 0; pixel < ink.length; pixel += 1) {
        const alpha = (data[pixel * 4 + 3] ?? 0) / 255;
        const lightness =
          (0.2126 * (data[pixel * 4] ?? 0) +
            0.7152 * (data[pixel * 4 + 1] ?? 0) +
            0.0722 * (data[pixel * 4 + 2] ?? 0)) /
          255;
        // Linear in the coverage across an edge, black against white or against nothing.
        const inked = Math.min(1, Math.max(0, (1 - lightness) / (1 - inkLightness)));
        ink[pixel] = Math.round(255 * alpha * inked);
      }
      const encode = (bytes: Uint8Array) => {
        let binary = "";
        for (let start = 0; start < bytes.length; start += 0x8000) {
          binary += String.fromCharCode(...bytes.subarray(start, start + 0x8000));
        }
        return btoa(binary);
      };
      return { width, height, ink: encode(ink), colors: encode(colors) };
    },
    {
      vector,
      text: vector ? bytes.toString("utf8") : "",
      base64: vector ? "" : bytes.toString("base64"),
      remove: [...(source.remove ?? [])],
      viewBox: source.viewBox ? [...source.viewBox] : null,
      inkLightness: source.inkLightness ?? 0,
      resolution: RESOLUTION,
    },
  );
  return {
    width: drawn.width,
    height: drawn.height,
    ink: new Uint8Array(Buffer.from(drawn.ink, "base64")),
    colors: new Uint8Array(Buffer.from(drawn.colors, "base64")),
  };
}

type Point = [number, number];

/**
 * The outlines of the ink at half coverage (marching squares, corners at the
 * pixels' centres, an empty border so that every outline closes): closed
 * rings of points, in pixels.
 */
function trace({ width, height, ink }: Drawing): Point[][] {
  const level = 127.5;
  const value = (x: number, y: number) =>
    x < 0 || y < 0 || x >= width || y >= height ? 0 : (ink[y * width + x] ?? 0);
  const columns = width + 2;
  const points = new Map<number, Point>();
  const links = new Map<number, number[]>();
  // An edge between two corners, identified by its first corner and its direction.
  const edge = (ax: number, ay: number, bx: number, by: number) => {
    const id = 2 * ((ay + 1) * columns + (ax + 1)) + (bx === ax ? 1 : 0);
    if (!points.has(id)) {
      const from = value(ax, ay);
      const t = (level - from) / (value(bx, by) - from);
      points.set(id, [ax + (bx - ax) * t + 0.5, ay + (by - ay) * t + 0.5]);
    }
    return id;
  };
  const link = (a: number, b: number) => {
    links.set(a, [...(links.get(a) ?? []), b]);
    links.set(b, [...(links.get(b) ?? []), a]);
  };
  for (let y = -1; y < height; y += 1) {
    for (let x = -1; x < width; x += 1) {
      const tl = value(x, y);
      const tr = value(x + 1, y);
      const br = value(x + 1, y + 1);
      const bl = value(x, y + 1);
      const code = (tl > level ? 8 : 0) | (tr > level ? 4 : 0) | (br > level ? 2 : 0) | (bl > level ? 1 : 0);
      if (code === 0 || code === 15) {
        continue;
      }
      const top = () => edge(x, y, x + 1, y);
      const bottom = () => edge(x, y + 1, x + 1, y + 1);
      const left = () => edge(x, y, x, y + 1);
      const right = () => edge(x + 1, y, x + 1, y + 1);
      const centre = (tl + tr + br + bl) / 4 > level;
      switch (code) {
        case 1:
        case 14:
          link(left(), bottom());
          break;
        case 2:
        case 13:
          link(bottom(), right());
          break;
        case 3:
        case 12:
          link(left(), right());
          break;
        case 4:
        case 11:
          link(top(), right());
          break;
        case 6:
        case 9:
          link(top(), bottom());
          break;
        case 7:
        case 8:
          link(top(), left());
          break;
        case 5:
          // Top right and bottom left inside: joined through the centre, or apart.
          if (centre) {
            link(top(), left());
            link(right(), bottom());
          } else {
            link(top(), right());
            link(left(), bottom());
          }
          break;
        case 10:
          if (centre) {
            link(top(), right());
            link(left(), bottom());
          } else {
            link(top(), left());
            link(right(), bottom());
          }
          break;
      }
    }
  }
  const rings: Point[][] = [];
  const visited = new Set<number>();
  for (const start of links.keys()) {
    if (visited.has(start)) {
      continue;
    }
    const ring: Point[] = [];
    let previous = -1;
    let current = start;
    while (!visited.has(current)) {
      visited.add(current);
      ring.push(points.get(current) as Point);
      const [a = -1, b = -1] = links.get(current) ?? [];
      const next = a === previous ? b : a;
      previous = current;
      current = next;
    }
    rings.push(ring);
  }
  return rings;
}

/** Area of a ring (shoelace), signed. */
function area(ring: readonly Point[]): number {
  let total = 0;
  for (let index = 0; index < ring.length; index += 1) {
    const [ax, ay] = ring[index] as Point;
    const [bx, by] = ring[(index + 1) % ring.length] as Point;
    total += ax * by - bx * ay;
  }
  return total / 2;
}

/** Douglas–Peucker on an open line, both ends kept. */
function simplifyLine(points: readonly Point[], tolerance: number): Point[] {
  if (points.length < 3) {
    return [...points];
  }
  const keep = new Uint8Array(points.length);
  keep[0] = 1;
  keep[points.length - 1] = 1;
  const stack: Array<[number, number]> = [[0, points.length - 1]];
  while (stack.length > 0) {
    const [from, to] = stack.pop() as [number, number];
    const [ax, ay] = points[from] as Point;
    const [bx, by] = points[to] as Point;
    const length = Math.hypot(bx - ax, by - ay);
    let farthest = -1;
    let at = -1;
    for (let index = from + 1; index < to; index += 1) {
      const [px, py] = points[index] as Point;
      const distance =
        length > 0
          ? Math.abs((px - ax) * (by - ay) - (py - ay) * (bx - ax)) / length
          : Math.hypot(px - ax, py - ay);
      if (distance > farthest) {
        farthest = distance;
        at = index;
      }
    }
    if (farthest > tolerance) {
      keep[at] = 1;
      stack.push([from, at], [at, to]);
    }
  }
  return points.filter((_, index) => keep[index] === 1);
}

/** Douglas–Peucker on a ring: cut in two at the point farthest from its first. */
function simplifyRing(ring: readonly Point[], tolerance: number): Point[] {
  const [sx, sy] = ring[0] as Point;
  let far = 0;
  let farthest = -1;
  for (let index = 1; index < ring.length; index += 1) {
    const [x, y] = ring[index] as Point;
    const distance = Math.hypot(x - sx, y - sy);
    if (distance > farthest) {
      farthest = distance;
      far = index;
    }
  }
  const first = simplifyLine(ring.slice(0, far + 1), tolerance);
  const second = simplifyLine([...ring.slice(far), ring[0] as Point], tolerance);
  return [...first, ...second.slice(1, -1)];
}

interface Logo {
  readonly width: number;
  readonly height: number;
  readonly path: string;
  readonly rings: number;
  readonly points: number;
  /** Where the drawing's pixels land in the logo's box: units = (pixel + 0.5 - min) × scale. */
  readonly placement: { readonly minX: number; readonly minY: number; readonly scale: number };
}

const round = (value: number) => Math.round(value * 100) / 100;
const number = (value: number) => String(round(value)).replace(/^0\./, ".");

/** The ink's outlines, simplified, in a box whose longer side is BOX, as path data. */
function outline(drawing: Drawing): Logo {
  const rings = trace(drawing)
    .filter((ring) => Math.abs(area(ring)) >= SPECK)
    .map((ring) => simplifyRing(ring, TOLERANCE))
    .filter((ring) => ring.length >= 3);
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  for (const ring of rings) {
    for (const [x, y] of ring) {
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    }
  }
  const scale = BOX / Math.max(maxX - minX, maxY - minY);
  let points = 0;
  const path = rings
    .map((ring) => {
      const placed: Point[] = [];
      for (const [x, y] of ring) {
        const point: Point = [round((x - minX) * scale), round((y - minY) * scale)];
        const last = placed[placed.length - 1];
        if (!last || last[0] !== point[0] || last[1] !== point[1]) {
          placed.push(point);
        }
      }
      points += placed.length;
      return `M${placed.map(([x, y]) => `${number(x)} ${number(y)}`).join(" ")}Z`;
    })
    .join("");
  return {
    width: round((maxX - minX) * scale),
    height: round((maxY - minY) * scale),
    path,
    rings: rings.length,
    points,
    placement: { minX, minY, scale },
  };
}

type Rgb = [number, number, number];

const toLinear = (channel: number) =>
  channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
const toGamma = (channel: number) =>
  channel <= 0.0031308 ? 12.92 * channel : 1.055 * channel ** (1 / 2.4) - 0.055;

/** Linear sRGB to OKLab (Björn Ottosson). */
function oklab([r, g, b]: Rgb): Rgb {
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ];
}

/** OKLab to linear sRGB, out of gamut as it comes. */
function linear([lightness, a, b]: Rgb): Rgb {
  const l = (lightness + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (lightness - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (lightness - 0.0894841775 * a - 1.291485548 * b) ** 3;
  return [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ];
}

/** A colour lifted in lightness (LIFT), its hue kept, its chroma lowered only as far as the sRGB gamut needs. */
function lifted(colour: Rgb): Rgb {
  const [lightness, a, b] = oklab(colour);
  const target = LIFT + (1 - LIFT) * lightness;
  const fits = (k: number) =>
    linear([target, a * k, b * k]).every((channel) => channel >= -1e-6 && channel <= 1 + 1e-6);
  let low = 0;
  let high = 1;
  if (!fits(1)) {
    for (let step = 0; step < 24; step += 1) {
      const middle = (low + high) / 2;
      if (fits(middle)) {
        low = middle;
      } else {
        high = middle;
      }
    }
  } else {
    low = 1;
  }
  return linear([target, a * low, b * low]).map((channel) => Math.min(1, Math.max(0, channel))) as Rgb;
}

interface Colors {
  readonly columns: number;
  readonly rows: number;
  /** Red, green and blue of each cell (sRGB), row by row. */
  readonly rgb: Uint8Array;
}

/**
 * The logo's colours over a grid of CELL-wide cells across its box: each
 * cell the average of the pixels it holds that are all ink, lifted; a cell
 * with none takes the colour of the nearest that has some, so that the
 * colours never fade into black along the edges.
 */
function colorGrid(drawing: Drawing, logo: Logo): Colors {
  const columns = Math.max(1, Math.ceil(logo.width / CELL - 1e-9));
  const rows = Math.max(1, Math.ceil(logo.height / CELL - 1e-9));
  const sums = new Float64Array(columns * rows * 4);
  const { minX, minY, scale } = logo.placement;
  for (let y = 0; y < drawing.height; y += 1) {
    const row = Math.min(rows - 1, Math.max(0, Math.floor(((y + 0.5 - minY) * scale) / CELL)));
    for (let x = 0; x < drawing.width; x += 1) {
      const pixel = y * drawing.width + x;
      if ((drawing.ink[pixel] ?? 0) < SOLID) {
        continue;
      }
      const column = Math.min(columns - 1, Math.max(0, Math.floor(((x + 0.5 - minX) * scale) / CELL)));
      const cell = (row * columns + column) * 4;
      for (let channel = 0; channel < 3; channel += 1) {
        sums[cell + channel] =
          (sums[cell + channel] ?? 0) + toLinear((drawing.colors[pixel * 3 + channel] ?? 0) / 255);
      }
      sums[cell + 3] = (sums[cell + 3] ?? 0) + 1;
    }
  }
  const averages: Array<Rgb | null> = Array.from({ length: columns * rows }, (_, cell) => {
    const weight = sums[cell * 4 + 3] ?? 0;
    return weight > 0
      ? [
          (sums[cell * 4] ?? 0) / weight,
          (sums[cell * 4 + 1] ?? 0) / weight,
          (sums[cell * 4 + 2] ?? 0) / weight,
        ]
      : null;
  });
  // Breadth first from the cells with ink.
  let frontier = averages.flatMap((colour, cell) => (colour ? [cell] : []));
  while (frontier.length > 0) {
    const next: number[] = [];
    for (const cell of frontier) {
      const column = cell % columns;
      const row = Math.floor(cell / columns);
      for (const [dx, dy] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ] as const) {
        const x = column + dx;
        const y = row + dy;
        const neighbour = y * columns + x;
        if (x >= 0 && x < columns && y >= 0 && y < rows && !averages[neighbour]) {
          averages[neighbour] = averages[cell] ?? null;
          next.push(neighbour);
        }
      }
    }
    frontier = next;
  }
  const rgb = new Uint8Array(columns * rows * 3);
  for (const [cell, colour] of averages.entries()) {
    const display = lifted(colour ?? [1, 1, 1]);
    for (let channel = 0; channel < 3; channel += 1) {
      rgb[cell * 3 + channel] = Math.round(toGamma(display[channel] ?? 0) * 255);
    }
  }
  return { columns, rows, rgb };
}

/** The colour grid as a PNG, a pixel per cell, for the fallback's files. */
function gridPng(page: Page, colors: Colors): Promise<string> {
  return page.evaluate(
    ({ columns, rows, rgb }) => {
      const bytes = Uint8Array.from(atob(rgb), (character) => character.charCodeAt(0));
      const canvas = document.createElement("canvas");
      canvas.width = columns;
      canvas.height = rows;
      const context = canvas.getContext("2d");
      if (!context) {
        throw new Error("No 2D canvas");
      }
      const image = context.createImageData(columns, rows);
      for (let cell = 0; cell < columns * rows; cell += 1) {
        image.data[cell * 4] = bytes[cell * 3] ?? 0;
        image.data[cell * 4 + 1] = bytes[cell * 3 + 1] ?? 0;
        image.data[cell * 4 + 2] = bytes[cell * 3 + 2] ?? 0;
        image.data[cell * 4 + 3] = 255;
      }
      context.putImageData(image, 0, 0);
      return canvas.toDataURL("image/png");
    },
    { columns: colors.columns, rows: colors.rows, rgb: Buffer.from(colors.rgb).toString("base64") },
  );
}

const browser = await chromium.launch(
  process.env.PW_CHROMIUM_PATH ? { executablePath: process.env.PW_CHROMIUM_PATH } : {},
);
const logos = new Map<string, { logo: Logo; colors: Colors }>();
try {
  const page = await browser.newPage();
  // The files are drawn from memory: nothing goes out.
  await page.route("**/*", (route) => route.abort());
  await page.setContent("<!doctype html><body></body>");
  // tsx keeps the names of the functions it compiles with a helper the page lacks.
  await page.evaluate("globalThis.__name = (target) => target");
  for (const [school, source] of Object.entries(SOURCES)) {
    const drawing = await draw(page, source);
    const logo = outline(drawing);
    const colors = colorGrid(drawing, logo);
    logos.set(school, { logo, colors });
    // The fallback: the colour grid, smoothed by the browser, inside the outline.
    writeFileSync(
      new URL(`${school}.svg`, PUBLIC_DIRECTORY),
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${logo.width} ${logo.height}"><title>${source.name}</title><clipPath id="ink"><path clip-rule="evenodd" d="${logo.path}"/></clipPath><image href="${await gridPng(page, colors)}" width="${round(colors.columns * CELL)}" height="${round(colors.rows * CELL)}" preserveAspectRatio="none" clip-path="url(#ink)"/></svg>\n`,
    );
    console.log(
      `${school}: ${logo.width} × ${logo.height}, ${logo.rings} outlines, ${logo.points} points, ${logo.path.length} characters, ${colors.columns} × ${colors.rows} colours`,
    );
  }
} finally {
  await browser.close();
}

const entries = [...logos]
  .map(
    ([school, { logo, colors }]) =>
      `  ${school}: {\n    width: ${logo.width},\n    height: ${logo.height},\n    path: "${logo.path}",\n    colors: {\n      cell: ${CELL},\n      columns: ${colors.columns},\n      rgb: "${Buffer.from(colors.rgb).toString("base64")}",\n    },\n  },`,
  )
  .join("\n");
writeFileSync(
  MODULE,
  `// Generated by scripts/school-logos.ts from the schools' own files: do not edit.

/**
 * The schools' logos, their property, which the atoms draw beside the waiting
 * list form, and nowhere else (docs/adr/0016-logos-des-ecoles.md), in a box of
 * \`width\` × \`height\` whose longer side is ${BOX} (y down): their shape, white
 * parts cut out, as outlines of straight segments (SVG path data, M, Z and
 * implicit lines) to fill with the even-odd rule; their colours, lifted for
 * the dark page, over a grid of square cells \`cell\` wide, \`columns\` across,
 * row by row from the top left (\`rgb\`: base64 of red, green, blue bytes, sRGB).
 */
export const SCHOOL_LOGOS = {
${entries}
} as const;
`,
);
