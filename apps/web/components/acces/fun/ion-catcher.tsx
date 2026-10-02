"use client";

import { colors } from "@epilove/tokens";
import { Button } from "@epilove/ui";
import { useTranslations } from "next-intl";
import { type PointerEvent, useCallback, useEffect, useRef, useState } from "react";

const WIDTH = 640;
const HEIGHT = 400;
const ROUND_SECONDS = 30;
const BEST_KEY = "epilove.404.best";

interface Ion {
  x: number;
  y: number;
  vx: number;
  vy: number;
  charge: 1 | -1;
}

function readBest(): number {
  try {
    return Number(localStorage.getItem(BEST_KEY) ?? 0) || 0;
  } catch {
    return 0;
  }
}

/** COM-05: the 404 page you can play. Positive ion vs. stray ions, 30 seconds. */
export function IonCatcher() {
  const t = useTranslations("common.notFound");
  const canvas = useRef<HTMLCanvasElement>(null);
  const [state, setState] = useState<"idle" | "playing" | "over">("idle");
  const [score, setScore] = useState(0);
  const [best, setBest] = useState(0);
  const [seconds, setSeconds] = useState(ROUND_SECONDS);
  const keys = useRef(new Set<string>());
  const player = useRef({ x: WIDTH / 2, y: HEIGHT / 2 });

  useEffect(() => setBest(readBest()), []);

  const start = useCallback(() => {
    setScore(0);
    setSeconds(ROUND_SECONDS);
    player.current = { x: WIDTH / 2, y: HEIGHT / 2 };
    setState("playing");
  }, []);

  useEffect(() => {
    if (state !== "playing") {
      return;
    }
    const context = canvas.current?.getContext("2d");
    if (!context) {
      return;
    }
    const ions: Ion[] = [];
    let points = 0;
    let frame = 0;
    let last = performance.now();
    const started = last;
    const spawn = () => {
      const charge: 1 | -1 = Math.random() < 0.7 ? -1 : 1;
      const angle = Math.random() * Math.PI * 2;
      ions.push({
        x: Math.random() * WIDTH,
        y: Math.random() < 0.5 ? -10 : HEIGHT + 10,
        vx: Math.cos(angle) * 60,
        vy: Math.sin(angle) * 60,
        charge,
      });
    };
    for (let index = 0; index < 8; index += 1) spawn();

    const tick = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const elapsed = (now - started) / 1000;
      const remaining = Math.max(0, ROUND_SECONDS - elapsed);
      setSeconds(Math.ceil(remaining));

      const speed = 320 * dt;
      if (keys.current.has("ArrowLeft")) player.current.x -= speed;
      if (keys.current.has("ArrowRight")) player.current.x += speed;
      if (keys.current.has("ArrowUp")) player.current.y -= speed;
      if (keys.current.has("ArrowDown")) player.current.y += speed;
      player.current.x = Math.min(WIDTH - 12, Math.max(12, player.current.x));
      player.current.y = Math.min(HEIGHT - 12, Math.max(12, player.current.y));

      for (let index = ions.length - 1; index >= 0; index -= 1) {
        const ion = ions[index];
        if (!ion) continue;
        const dx = player.current.x - ion.x;
        const dy = player.current.y - ion.y;
        const distance = Math.hypot(dx, dy) || 1;
        // Opposite charges attract, like charges repel.
        const pull = (ion.charge === -1 ? 900 : -1400) / Math.max(distance, 40);
        ion.vx += (dx / distance) * pull * dt * 10;
        ion.vy += (dy / distance) * pull * dt * 10;
        ion.vx *= 0.98;
        ion.vy *= 0.98;
        ion.x += ion.vx * dt;
        ion.y += ion.vy * dt;
        if (distance < 20) {
          ions.splice(index, 1);
          points = Math.max(0, points + (ion.charge === -1 ? 1 : -2));
          setScore(points);
          spawn();
        } else if (ion.x < -40 || ion.x > WIDTH + 40 || ion.y < -40 || ion.y > HEIGHT + 40) {
          ions.splice(index, 1);
          spawn();
        }
      }
      if (ions.length < 8 + Math.floor(elapsed / 5)) spawn();

      context.clearRect(0, 0, WIDTH, HEIGHT);
      for (const ion of ions) {
        context.beginPath();
        context.fillStyle = ion.charge === -1 ? colors.volt : colors.danger;
        context.arc(ion.x, ion.y, 8, 0, Math.PI * 2);
        context.fill();
        context.fillStyle = colors.ink;
        context.font = "bold 12px monospace";
        context.textAlign = "center";
        context.textBaseline = "middle";
        context.fillText(ion.charge === -1 ? "−" : "+", ion.x, ion.y + 1);
      }
      context.beginPath();
      context.fillStyle = colors.plasma;
      context.shadowColor = colors.plasma;
      context.shadowBlur = 24;
      context.arc(player.current.x, player.current.y, 12, 0, Math.PI * 2);
      context.fill();
      context.shadowBlur = 0;

      if (remaining <= 0) {
        setState("over");
        const record = Math.max(readBest(), points);
        try {
          localStorage.setItem(BEST_KEY, String(record));
        } catch {
          // Private browsing: no record, no problem.
        }
        setBest(record);
        return;
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [state]);

  useEffect(() => {
    const down = (event: KeyboardEvent) => {
      if (state === "playing" && event.key.startsWith("Arrow")) {
        event.preventDefault();
        keys.current.add(event.key);
      }
    };
    const up = (event: KeyboardEvent) => keys.current.delete(event.key);
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
    };
  }, [state]);

  function follow(event: PointerEvent<HTMLCanvasElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    player.current = {
      x: ((event.clientX - rect.left) / rect.width) * WIDTH,
      y: ((event.clientY - rect.top) / rect.height) * HEIGHT,
    };
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between font-mono text-paper/70 text-sm" aria-live="polite">
        <span>{t("score", { score })}</span>
        <span>{state === "playing" ? t("time", { seconds }) : t("best", { best })}</span>
      </div>
      <div className="relative overflow-hidden rounded-3xl border border-paper/10 bg-ink2">
        <canvas
          ref={canvas}
          width={WIDTH}
          height={HEIGHT}
          aria-label={t("canvas")}
          role="img"
          onPointerMove={follow}
          className="block aspect-[8/5] w-full touch-none"
        />
        {state !== "playing" ? (
          <div className="absolute inset-0 grid place-items-center bg-ink/60 backdrop-blur-sm">
            <div className="flex flex-col items-center gap-3 text-center">
              {state === "over" ? (
                <p className="font-display font-semibold text-2xl">{t("over", { score })}</p>
              ) : null}
              <Button onClick={start}>{state === "over" ? t("again") : t("play")}</Button>
            </div>
          </div>
        ) : null}
      </div>
      <p className="text-paper/50 text-xs">{t("controls")}</p>
    </div>
  );
}
