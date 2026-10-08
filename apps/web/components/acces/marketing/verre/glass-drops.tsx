"use client";

import { canAffordLiveField, isSoftwareRenderer } from "@atomes/three";
import { useEffect, useRef, useState } from "react";
import { afterLoadAndIdle, deviceProfile, forcedLiveScenes, rendererName } from "../live-scene";
import { type Box, type Drop, pairAt } from "./drops";
import { FRAGMENT_SHADER, VERTEX_SHADER } from "./glass-shader";

/** Light from the top left until the pointer moves it. */
const DEFAULT_LIGHT = { x: -0.55, y: 0.62 } as const;
/** How far the drops lean towards the pointer, as a share of its distance from the title's centre. */
const LEAN = 0.05;
/** For those who asked for reduced motion: one still frame, the drops apart and settled. */
const STILL_AT = 2.4;

function compile(gl: WebGL2RenderingContext, type: number, source: string): WebGLShader {
  const shader = gl.createShader(type);
  if (!shader) {
    throw new Error("shader");
  }
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    throw new Error(gl.getShaderInfoLog(shader) ?? "shader");
  }
  return shader;
}

function program(gl: WebGL2RenderingContext): WebGLProgram {
  const linked = gl.createProgram();
  gl.attachShader(linked, compile(gl, gl.VERTEX_SHADER, VERTEX_SHADER));
  gl.attachShader(linked, compile(gl, gl.FRAGMENT_SHADER, FRAGMENT_SHADER));
  gl.linkProgram(linked);
  if (!gl.getProgramParameter(linked, gl.LINK_STATUS)) {
    throw new Error(gl.getProgramInfoLog(linked) ?? "program");
  }
  return linked;
}

/** A CSS colour as linear-ish RGB in [0, 1], read back from a one-pixel canvas. */
function rgbOf(colour: string): [number, number, number] {
  const probe = document.createElement("canvas");
  probe.width = 1;
  probe.height = 1;
  const context = probe.getContext("2d", { willReadFrequently: true });
  if (!context) {
    return [1, 1, 1];
  }
  context.fillStyle = colour;
  context.fillRect(0, 0, 1, 1);
  const [r = 255, g = 255, b = 255] = context.getImageData(0, 0, 1, 1).data;
  return [r / 255, g / 255, b / 255];
}

/**
 * What the drops look through: the hero's background (its colour and its
 * glow, as the CSS draws them) and the title, word by word where the page
 * lays it out, in the canvas's pixels.
 */
function paintScene(scene: HTMLCanvasElement, hero: HTMLElement, title: HTMLElement, ratio: number) {
  const context = scene.getContext("2d");
  if (!context) {
    return;
  }
  const heroBox = hero.getBoundingClientRect();
  const tokens = getComputedStyle(hero);
  const ink = rgbOf(tokens.getPropertyValue("--color-ink").trim() || "#141020");
  const plasma = rgbOf(tokens.getPropertyValue("--color-plasma").trim() || "#ff4fa0");
  const css = ([r, g, b]: readonly number[], alpha = 1) =>
    `rgb(${Math.round((r ?? 0) * 255)} ${Math.round((g ?? 0) * 255)} ${Math.round((b ?? 0) * 255)} / ${alpha})`;
  context.setTransform(ratio, 0, 0, ratio, 0, 0);
  context.fillStyle = css(ink);
  context.fillRect(0, 0, heroBox.width, heroBox.height);
  // The glow behind the title, as the hero's CSS draws it: an ellipse 60 % × 55 % of the hero at 50 % 42 %.
  context.save();
  context.translate(heroBox.width * 0.5, heroBox.height * 0.42);
  context.scale(heroBox.width * 0.6, heroBox.height * 0.55);
  const glow = context.createRadialGradient(0, 0, 0, 0, 0, 1);
  glow.addColorStop(0, css(plasma, 0.16));
  glow.addColorStop(0.75, css(plasma, 0));
  context.fillStyle = glow;
  context.fillRect(-1, -1, 2, 2);
  context.restore();

  for (const word of title.querySelectorAll<HTMLElement>("[data-glass-word]")) {
    const text = word.textContent ?? "";
    const box = word.getBoundingClientRect();
    const style = getComputedStyle(word);
    context.font = `${style.fontStyle} ${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
    context.letterSpacing = style.letterSpacing === "normal" ? "0px" : style.letterSpacing;
    context.fillStyle = style.color;
    context.textBaseline = "alphabetic";
    const metrics = context.measureText(text);
    if (metrics.width <= 0) {
      continue;
    }
    // The canvas cannot set the font's width axis: each word is stretched to the page's width.
    context.save();
    context.translate(box.left - heroBox.left, box.top - heroBox.top + metrics.fontBoundingBoxAscent);
    context.scale(box.width / metrics.width, 1);
    context.fillText(text, 0, 0);
    context.restore();
  }
}

/**
 * The two drops of glass in front of the title (`/apercu/verre`), drawn by
 * WebGL2 over the page: the page shows through, magnified and bent. Only on
 * devices with a GPU, once the page has loaded; one still frame for those who
 * asked for reduced motion; nothing at all otherwise (the title stays as it
 * is). The drops lean towards the pointer, and the light comes from it.
 */
export function GlassDrops() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [live, setLive] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    const hero = canvas?.closest("section");
    const title = hero?.querySelector<HTMLElement>("[data-glass-title]");
    if (!canvas || !hero || !title) {
      return;
    }
    const { forced } = forcedLiveScenes();
    if (!forced && !canAffordLiveField(deviceProfile())) {
      return;
    }
    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let disposed = false;
    const cleanups: Array<() => void> = [];

    const start = async () => {
      if (!forced && isSoftwareRenderer(rendererName())) {
        return;
      }
      await document.fonts.ready;
      await Promise.all(
        title.getAnimations({ subtree: true }).map((animation) => animation.finished.catch(() => null)),
      );
      const gl = canvas.getContext("webgl2", { alpha: true, premultipliedAlpha: true, antialias: false });
      if (disposed || !gl) {
        return;
      }
      let linked: WebGLProgram;
      try {
        linked = program(gl);
      } catch {
        return;
      }
      // biome-ignore lint/correctness/useHookAtTopLevel: WebGL's useProgram, not a React hook.
      gl.useProgram(linked);
      const buffer = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
      // One triangle covering the screen.
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
      const position = gl.getAttribLocation(linked, "position");
      gl.enableVertexAttribArray(position);
      gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);
      const texture = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
      const uniform = (name: string) => gl.getUniformLocation(linked, name);
      const at = {
        resolution: uniform("uResolution"),
        first: uniform("uFirst"),
        second: uniform("uSecond"),
        firstTint: uniform("uFirstTint"),
        secondTint: uniform("uSecondTint"),
        light: uniform("uLight"),
        bridge: uniform("uBridge"),
        pixel: uniform("uPixel"),
      };
      const tokens = getComputedStyle(hero);
      gl.uniform3fv(at.firstTint, rgbOf(tokens.getPropertyValue("--color-plasma").trim() || "#ff4fa0"));
      gl.uniform3fv(at.secondTint, rgbOf(tokens.getPropertyValue("--color-volt").trim() || "#d4f54a"));

      const scene = document.createElement("canvas");
      let ratio = 1;
      let size = { width: 0, height: 0 };
      let titleBox: Box = { x: 0, y: 0, width: 1, height: 1 };
      const layout = () => {
        const heroBox = hero.getBoundingClientRect();
        const coarse = window.matchMedia("(pointer: coarse)").matches;
        ratio = Math.min(window.devicePixelRatio || 1, coarse ? 1.25 : 1.5);
        size = { width: heroBox.width, height: heroBox.height };
        canvas.width = Math.round(size.width * ratio);
        canvas.height = Math.round(size.height * ratio);
        scene.width = canvas.width;
        scene.height = canvas.height;
        paintScene(scene, hero, title, ratio);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, scene);
        gl.viewport(0, 0, canvas.width, canvas.height);
        gl.uniform2f(at.resolution, canvas.width, canvas.height);
        gl.uniform1f(at.pixel, ratio);
        const box = title.getBoundingClientRect();
        titleBox = {
          x: box.left - heroBox.left,
          y: box.top - heroBox.top,
          width: box.width,
          height: box.height,
        };
      };
      layout();

      // The pointer: the drops lean towards it, the light comes from it (both eased).
      const pointer = { x: 0, y: 0, active: false };
      const eased: Record<"leanX" | "leanY" | "lightX" | "lightY", number> = {
        leanX: 0,
        leanY: 0,
        lightX: DEFAULT_LIGHT.x,
        lightY: DEFAULT_LIGHT.y,
      };
      const onPointer = (event: PointerEvent) => {
        const box = hero.getBoundingClientRect();
        pointer.x = event.clientX - box.left;
        pointer.y = event.clientY - box.top;
        pointer.active = pointer.y >= 0 && pointer.y <= box.height;
      };

      const began = performance.now();
      const draw = (now: number) => {
        const time = still ? STILL_AT : (now - began) / 1000;
        const centre = { x: titleBox.x + titleBox.width / 2, y: titleBox.y + titleBox.height / 2 };
        const target =
          pointer.active && !still
            ? {
                leanX: (pointer.x - centre.x) * LEAN,
                leanY: (pointer.y - centre.y) * LEAN,
                lightX: Math.max(-1, Math.min(1, (pointer.x - centre.x) / (0.5 * size.width))),
                lightY: Math.max(-1, Math.min(1, -(pointer.y - centre.y) / (0.5 * size.height))),
              }
            : { leanX: 0, leanY: 0, lightX: DEFAULT_LIGHT.x, lightY: DEFAULT_LIGHT.y };
        for (const key of ["leanX", "leanY", "lightX", "lightY"] as const) {
          eased[key] += (target[key] - eased[key]) * (still ? 1 : 0.06);
        }
        const {
          drops: [first, second],
          bridge,
        } = pairAt(time, titleBox);
        const toGl = (drop: Drop) =>
          [
            (drop.x + eased.leanX) * ratio,
            canvas.height - (drop.y + eased.leanY) * ratio,
            drop.radius * ratio,
          ] as const;
        gl.uniform3f(at.first, ...toGl(first));
        gl.uniform3f(at.second, ...toGl(second));
        gl.uniform1f(at.bridge, bridge * ratio);
        gl.uniform2f(at.light, eased.lightX, eased.lightY);
        gl.clearColor(0, 0, 0, 0);
        gl.clear(gl.COLOR_BUFFER_BIT);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
      };

      // Runs only while the hero shows, in the foreground tab.
      let frame = 0;
      let inView = true;
      const loop = (now: number) => {
        draw(now);
        frame = requestAnimationFrame(loop);
      };
      const update = () => {
        cancelAnimationFrame(frame);
        frame = 0;
        if (still) {
          requestAnimationFrame(draw);
        } else if (inView && document.visibilityState === "visible") {
          frame = requestAnimationFrame(loop);
        }
      };
      const observer = new IntersectionObserver(([entry]) => {
        inView = entry?.isIntersecting ?? true;
        update();
      });
      observer.observe(hero);
      const resize = new ResizeObserver(() => {
        layout();
        update();
      });
      resize.observe(hero);
      document.addEventListener("visibilitychange", update);
      window.addEventListener("pointermove", onPointer, { passive: true });
      cleanups.push(() => {
        cancelAnimationFrame(frame);
        observer.disconnect();
        resize.disconnect();
        document.removeEventListener("visibilitychange", update);
        window.removeEventListener("pointermove", onPointer);
        gl.getExtension("WEBGL_lose_context")?.loseContext();
      });
      update();
      requestAnimationFrame(() => setLive(true));
    };

    cleanups.push(afterLoadAndIdle(() => void start()));
    return () => {
      disposed = true;
      for (const cleanup of cleanups.splice(0)) {
        cleanup();
      }
    };
  }, []);

  return <canvas ref={canvasRef} className="verre-canvas" data-live={live || undefined} />;
}
