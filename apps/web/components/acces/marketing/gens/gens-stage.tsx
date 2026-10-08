"use client";

import Image from "next/image";
import { useTranslations } from "next-intl";
import { type CSSProperties, type ReactNode, useEffect, useRef, useState } from "react";
import { bondOf, bondPath, coverPoint, SCENES } from "./scenes";

/** How long each photograph stays, in milliseconds (its crossfade included). */
const SCENE_TIME = 5200;

/** An atom where the bond starts or ends: the logo mark, tiny. */
function BondAtom({ x, y, className }: { x: number; y: number; className: string }) {
  return (
    <g transform={`translate(${x.toFixed(1)} ${y.toFixed(1)})`}>
      <g className={className}>
        <ellipse rx="13" ry="5.3" transform="rotate(-30)" className="gens-atom-orbit" />
        <circle r="3.6" className="gens-atom-nucleus" />
        <circle cx="9.6" cy="-5.4" r="1.7" className="gens-atom-electron" />
      </g>
    </g>
  );
}

/**
 * The people hero's stage (`/apercu/gens`): the photographs, which follow one
 * another every few seconds, with a crossfade and a slow zoom; the title's
 * last words change with them; a bond of light draws itself between two
 * people of each photograph, an atom at each end. The visitor can pause the
 * slideshow; it pauses by itself out of sight, and never moves for those who
 * asked for reduced motion. The photographs are illustrations, out of reach
 * of assistive technologies; the title reads "Trouve tes atomes crochus.".
 */
export function GensStage({ eyebrow, meta }: { eyebrow: ReactNode; meta: ReactNode }) {
  const t = useTranslations("home");
  const tg = useTranslations("home.gens");
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const [still, setStill] = useState(false);
  const [inView, setInView] = useState(true);
  const [box, setBox] = useState<{ width: number; height: number } | null>(null);
  const photosRef = useRef<HTMLDivElement>(null);
  const scene = SCENES[index] ?? SCENES[0];
  const running = !paused && !still && inView;

  // Reduced motion: the first photograph, still.
  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setStill(query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);

  // The bond is drawn in the photographs' pixels: their box, kept up to date.
  useEffect(() => {
    const photos = photosRef.current;
    if (!photos) {
      return;
    }
    const observer = new ResizeObserver(([entry]) => {
      if (entry) {
        setBox({ width: entry.contentRect.width, height: entry.contentRect.height });
      }
    });
    observer.observe(photos);
    return () => observer.disconnect();
  }, []);

  // Out of sight (scrolled away, background tab), the slideshow waits.
  useEffect(() => {
    const photos = photosRef.current;
    if (!photos) {
      return;
    }
    let visible = true;
    const update = () => setInView(visible && document.visibilityState === "visible");
    const observer = new IntersectionObserver(([entry]) => {
      visible = entry?.isIntersecting ?? true;
      update();
    });
    observer.observe(photos);
    document.addEventListener("visibilitychange", update);
    return () => {
      observer.disconnect();
      document.removeEventListener("visibilitychange", update);
    };
  }, []);

  // The next photograph, once this one has had its time: a pause keeps the time already spent.
  const spent = useRef(0);
  useEffect(() => {
    if (!running) {
      return;
    }
    const started = performance.now();
    let done = false;
    const timer = window.setTimeout(
      () => {
        done = true;
        spent.current = 0;
        setIndex((index + 1) % SCENES.length);
      },
      Math.max(0, SCENE_TIME - spent.current),
    );
    return () => {
      window.clearTimeout(timer);
      if (!done) {
        spent.current += performance.now() - started;
      }
    };
  }, [running, index]);

  const bond = box ? bondOf(scene, box) : null;
  const ends =
    box && bond ? ([coverPoint(bond[0], scene, box), coverPoint(bond[1], scene, box)] as const) : null;

  return (
    <>
      <div
        ref={photosRef}
        aria-hidden="true"
        className="gens-photos"
        style={{ "--scene-time": `${SCENE_TIME}ms` } as CSSProperties}
      >
        {SCENES.map((photo, position) => (
          <div
            key={photo.key}
            className="gens-photo"
            data-scene={photo.key}
            data-active={position === index || undefined}
          >
            <Image
              src={photo.src}
              alt=""
              fill
              sizes="100vw"
              quality={72}
              priority={position === 0}
              style={{
                objectFit: "cover",
                objectPosition: `${photo.focus[0] * 100}% ${photo.focus[1] * 100}%`,
              }}
            />
          </div>
        ))}
        <div className="gens-grade" />
        {box && ends ? (
          <svg
            key={scene.key}
            aria-hidden="true"
            className="gens-bond"
            viewBox={`0 0 ${Math.round(box.width)} ${Math.round(box.height)}`}
            data-still={still || undefined}
          >
            <defs>
              <linearGradient id="gens-bond-light" x1="0" x2="1" y1="0" y2="0">
                <stop offset="0" stopColor="var(--color-plasma)" />
                <stop offset="1" stopColor="var(--color-volt)" />
              </linearGradient>
            </defs>
            <path d={bondPath(ends[0], ends[1])} pathLength={1} className="gens-bond-line" />
            <BondAtom x={ends[0].x} y={ends[0].y} className="gens-atom" />
            <BondAtom x={ends[1].x} y={ends[1].y} className="gens-atom gens-atom-late" />
          </svg>
        ) : null}
      </div>

      <div data-hero-content className="gens-copy">
        {eyebrow}
        <h1 id="hero-title" className="gens-title">
          <span className="sr-only">
            {t("titleLead")} {t("titleAccent")}
          </span>
          <span aria-hidden="true">
            <span className="gens-find">{tg("find")}</span>
            <span className="gens-lines">
              {SCENES.map((photo, position) => (
                <em key={photo.key} data-active={position === index || undefined}>
                  {tg(`lines.${photo.key}`)}
                </em>
              ))}
            </span>
          </span>
        </h1>
        <p className="gens-lead">{tg("lead")}</p>
      </div>

      <div data-hero-content className="gens-foot">
        <div className="gens-actions">
          <a href="#rejoindre" data-magnetic className="cta-primary">
            {t("cta")}
          </a>
          <a href="#concept" className="cta-ghost">
            {t("secondary")}
          </a>
        </div>
        <div className="gens-side">
          {meta}
          <p className="gens-illustration">{tg("illustration")}</p>
          <div
            className="gens-controls"
            data-paused={!running || undefined}
            style={{ "--scene-time": `${SCENE_TIME}ms` } as CSSProperties}
          >
            {still ? null : (
              <>
                <ol aria-hidden="true" className="gens-bars">
                  {SCENES.map((photo, position) => (
                    <li
                      key={photo.key}
                      data-done={position < index || undefined}
                      data-active={position === index || undefined}
                    />
                  ))}
                </ol>
                <button
                  type="button"
                  className="gens-pause"
                  aria-label={paused ? tg("play") : tg("pause")}
                  onClick={() => setPaused((current) => !current)}
                >
                  <svg aria-hidden="true" viewBox="0 0 16 16" className="size-3.5" fill="currentColor">
                    {paused ? <path d="M4 2.5v11l9-5.5z" /> : <path d="M4 2.5h3v11H4zM9 2.5h3v11H9z" />}
                  </svg>
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
