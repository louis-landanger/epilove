"use client";

import { useMessages, useTranslations } from "next-intl";
import { type CSSProperties, type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  CAMPUS_FAMILIES,
  FAMILIES,
  type Family,
  place,
  reactionScore,
  SYMBOLS,
  verdictFor,
} from "./elements";

const VERDICTS = ["explosive", "stable", "slow", "shy"] as const;
/** While nobody plays with the table, two elements react every few seconds, under the lamp. */
const DEMO_EVERY = 4600;
/** After someone played with the table, it waits this long before reacting on its own again. */
const DEMO_AFTER_PLAY = 9000;
/** The lamp wanders on its own once the pointer has left it alone this long. */
const LAMP_IDLE = 2500;
/** The first reaction shown, before anything happens: café and révisions. */
const FIRST_REACTION = { first: 20, second: 75 } as const;

interface Tile {
  readonly z: number;
  readonly symbol: string;
  readonly row: number;
  readonly column: number;
  readonly name: string;
  /** What the element stands for on campus; absent for plain elements and the title's two. */
  readonly family?: Family;
  /** One of the two elements written in the title. */
  readonly title?: "first" | "second";
}

interface Reaction {
  readonly first: number;
  readonly second: number;
  /** When it started (`performance.now()`), for the ion field's chain; unset for the first one. */
  readonly at?: number;
}

/** Centre of a tile in the table, from its layout box (transforms aside). */
function centreOf(tile: HTMLElement) {
  return { x: tile.offsetLeft + tile.offsetWidth / 2, y: tile.offsetTop + tile.offsetHeight / 2 };
}

/**
 * The hero's periodic table (docs/02-design.md, section 5): the 118 elements,
 * the title in the gap at its top (`children`), campus life written with real
 * symbols, and a reaction panel. A lamp follows the pointer, or wanders on its
 * own; click two elements to make them react, or let the table do it under
 * the lamp. The table itself is decoration, hidden from assistive
 * technologies: the panel says what reacts, and its button is the keyboard's
 * way to start a reaction. Once the ion field is live, its atoms rest on the
 * nodes of the grid (`data-field-lattice`) and draw each reaction's bond
 * (`data-reaction`).
 */
export function PeriodicTable({ children }: { children: ReactNode }) {
  const t = useTranslations("home");
  const names: Readonly<Record<string, string>> = useMessages().home.elements;
  const firstTitle = Number(t("titleFirst.number"));
  const secondTitle = Number(t("titleSecond.number"));
  const firstName = t("titleFirst.name");
  const secondName = t("titleSecond.name");

  const tiles = useMemo<Tile[]>(
    () =>
      SYMBOLS.map((symbol, index) => {
        const z = index + 1;
        const [row, column] = place(z);
        if (z === firstTitle || z === secondTitle) {
          const title = z === firstTitle ? "first" : "second";
          return { z, symbol, row, column, name: title === "first" ? firstName : secondName, title };
        }
        const name = names[String(z)];
        const family = CAMPUS_FAMILIES[z];
        return name && family
          ? { z, symbol, row, column, name, family }
          : { z, symbol, row, column, name: "" };
      }),
    [names, firstTitle, secondTitle, firstName, secondName],
  );
  const campus = useMemo(() => tiles.filter((tile) => tile.family).map((tile) => tile.z), [tiles]);

  const [reaction, setReaction] = useState<Reaction>(FIRST_REACTION);
  const [pending, setPending] = useState<number | null>(null);
  const [announcement, setAnnouncement] = useState("");
  const [bond, setBond] = useState<{ x1: number; y1: number; x2: number; y2: number } | null>(null);
  const tableRef = useRef<HTMLDivElement>(null);
  const lampRef = useRef<HTMLDivElement>(null);
  const playedAt = useRef(Number.NEGATIVE_INFINITY);
  // The element picked first, waiting for a second one (state for the tiles, ref for the click handler).
  const pendingRef = useRef<number | null>(null);

  const nameOf = useCallback((z: number) => tiles[z - 1]?.name ?? "", [tiles]);
  const score = reactionScore(reaction.first, reaction.second);
  const verdict = t(`reaction.verdicts.${VERDICTS[verdictFor(score)]}`);

  const react = useCallback(
    (first: number, second: number, played: boolean) => {
      setReaction({ first, second, at: performance.now() });
      pendingRef.current = null;
      setPending(null);
      if (played) {
        playedAt.current = performance.now();
        const result = reactionScore(first, second);
        setAnnouncement(
          t("reaction.announce", {
            first: nameOf(first),
            second: nameOf(second),
            score: result,
            verdict: t(`reaction.verdicts.${VERDICTS[verdictFor(result)]}`),
          }),
        );
      }
    },
    [t, nameOf],
  );

  const randomReaction = useCallback(() => {
    const first = campus[Math.floor(Math.random() * campus.length)] ?? FIRST_REACTION.first;
    const others = campus.filter((z) => z !== first);
    const second = others[Math.floor(Math.random() * others.length)] ?? FIRST_REACTION.second;
    react(first, second, true);
  }, [campus, react]);

  // The bond drawn between the two elements while the ion field is not there to draw it.
  useEffect(() => {
    const table = tableRef.current;
    if (!table) {
      return;
    }
    const measure = () => {
      const a = table.querySelector<HTMLElement>(`[data-z="${reaction.first}"]`);
      const b = table.querySelector<HTMLElement>(`[data-z="${reaction.second}"]`);
      if (!a || !b) {
        setBond(null);
        return;
      }
      const from = centreOf(a);
      const to = centreOf(b);
      setBond({ x1: from.x, y1: from.y, x2: to.x, y2: to.y });
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(table);
    return () => observer.disconnect();
  }, [reaction]);

  // Clicks pick elements (the panel's button does the same from the keyboard); the lamp follows
  // the pointer, wanders on its own, and reactions happen under it while nobody plays.
  useEffect(() => {
    const table = tableRef.current;
    const lamp = lampRef.current;
    if (!table || !lamp) {
      return;
    }
    const onClick = (event: MouseEvent) => {
      const tile = (event.target as Element | null)?.closest<HTMLElement>("[data-family]");
      if (!tile) {
        return;
      }
      const z = Number(tile.dataset.z);
      playedAt.current = performance.now();
      const first = pendingRef.current;
      if (first === null || first === z) {
        pendingRef.current = z;
        setPending(z);
      } else {
        react(first, z, true);
      }
    };

    const lampAt = { x: 0, y: 0 };
    const moveLamp = (x: number, y: number) => {
      lampAt.x = x;
      lampAt.y = y;
      lamp.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0)`;
    };
    let pointerAt = Number.NEGATIVE_INFINITY;
    const onPointerMove = (event: PointerEvent) => {
      if (event.pointerType !== "mouse" && event.pointerType !== "pen") {
        return;
      }
      const box = table.getBoundingClientRect();
      moveLamp(event.clientX - box.left, event.clientY - box.top);
      pointerAt = performance.now();
    };

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
    let visible = true;
    const observer = new IntersectionObserver(([entry]) => {
      visible = entry?.isIntersecting ?? false;
    });
    observer.observe(table);
    let demoAt = performance.now();
    let frame = 0;
    const tick = (now: number) => {
      frame = requestAnimationFrame(tick);
      if (!visible || reduced.matches) {
        return;
      }
      if (now - pointerAt > LAMP_IDLE) {
        moveLamp(
          table.clientWidth * (0.5 + 0.36 * Math.sin(now / 3100)),
          table.clientHeight * (0.5 + 0.3 * Math.sin(now / 2300 + 1)),
        );
      }
      if (now - demoAt > DEMO_EVERY && now - playedAt.current > DEMO_AFTER_PLAY) {
        demoAt = now;
        // Two of the campus elements nearest the lamp, so the reaction shows in its light.
        const near = campus
          .map((z) => {
            const tile = table.querySelector<HTMLElement>(`[data-z="${z}"]`);
            const centre = tile ? centreOf(tile) : { x: Number.POSITIVE_INFINITY, y: 0 };
            return { z, distance: Math.hypot(centre.x - lampAt.x, centre.y - lampAt.y) };
          })
          .sort((a, b) => a.distance - b.distance)
          .slice(0, 6);
        const first = near.splice(Math.floor(Math.random() * near.length), 1)[0];
        const second = near[Math.floor(Math.random() * near.length)];
        if (first && second) {
          react(first.z, second.z, false);
        }
      }
    };
    frame = requestAnimationFrame(tick);
    table.addEventListener("click", onClick);
    table.addEventListener("pointermove", onPointerMove);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      table.removeEventListener("click", onClick);
      table.removeEventListener("pointermove", onPointerMove);
    };
  }, [campus, react]);

  const stateOf = (z: number) =>
    z === reaction.first || z === reaction.second ? "reacting" : z === pending ? "picked" : undefined;

  return (
    <div className="periodic">
      <div
        ref={tableRef}
        className="ptable"
        data-field-lattice
        data-reaction={`${reaction.first}-${reaction.second}`}
        data-reaction-at={reaction.at === undefined ? undefined : Math.round(reaction.at)}
      >
        {tiles.map((tile) => (
          <span
            key={tile.z}
            aria-hidden="true"
            className="el"
            data-z={tile.z}
            data-symbol={tile.symbol}
            data-family={tile.family}
            data-title={tile.title}
            data-state={stateOf(tile.z)}
            data-cursor={tile.family ? "" : undefined}
            style={
              { gridArea: `${tile.row} / ${tile.column}`, "--wave": tile.row + tile.column } as CSSProperties
            }
          >
            <span className="el-name" data-name={tile.name} />
          </span>
        ))}
        <div aria-hidden="true" className="ptable-shade">
          <div ref={lampRef} className="ptable-lamp" />
        </div>
        <svg aria-hidden="true" className="ptable-bond">
          {bond ? <line x1={bond.x1} y1={bond.y1} x2={bond.x2} y2={bond.y2} /> : null}
        </svg>
        <div className="ptable-hole">{children}</div>
      </div>

      <div data-hero-content className="readout">
        <p className="readout-label">{t("reaction.label")}</p>
        <p className="readout-equation">
          {nameOf(reaction.first)} + {nameOf(reaction.second)}
        </p>
        <p className="readout-score">
          {score}
          <small>{t("reaction.unit")}</small>
        </p>
        <p className="readout-verdict">{verdict}</p>
        <button type="button" className="readout-again" onClick={randomReaction}>
          {t("reaction.again")}
        </button>
        <p className="readout-help">{t("reaction.help")}</p>
        <ul className="readout-legend">
          {FAMILIES.map((family) => (
            <li key={family} data-family={family}>
              {t(`reaction.families.${family}`)}
            </li>
          ))}
        </ul>
        <p aria-live="polite" className="sr-only">
          {announcement}
        </p>
      </div>
    </div>
  );
}
