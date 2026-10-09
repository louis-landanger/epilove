import type { CityView } from "@atomes/three";
import { createCityRenderer } from "./city-renderer";

/**
 * Draws the plan of Lyon off the main thread (city-canvas.tsx): the page
 * hands over its two canvases, then sends the view and the pointer.
 */

export type CityWorkerMessage =
  | {
      type: "start";
      base: OffscreenCanvas;
      torch: OffscreenCanvas | null;
      url: string;
      view: CityView;
      reveal: boolean;
    }
  | { type: "view"; view: CityView }
  | { type: "pointer"; x: number; y: number; active: boolean };

export type CityWorkerReply = { type: "lit" } | { type: "failed" };

// The app's types are the page's (DOM): the little of the worker's scope this needs.
const scope = self as unknown as {
  onmessage: ((event: MessageEvent<CityWorkerMessage>) => void) | null;
  postMessage(message: CityWorkerReply): void;
};
let renderer: ReturnType<typeof createCityRenderer> | null = null;

scope.onmessage = (event) => {
  const message = event.data;
  if (message.type === "start") {
    renderer = createCityRenderer(
      message.base,
      message.torch,
      (width, height) => new OffscreenCanvas(width, height),
    );
    renderer.start(message.url, message.view, message.reveal).then(
      () => scope.postMessage({ type: "lit" }),
      () => scope.postMessage({ type: "failed" }),
    );
  } else if (message.type === "view") {
    renderer?.setView(message.view);
  } else {
    renderer?.setPointer(message.x, message.y, message.active);
  }
};
