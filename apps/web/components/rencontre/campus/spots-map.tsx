"use client";

import "maplibre-gl/dist/maplibre-gl.css";
import type { SpotView } from "@epilove/contracts";
import type { Map as MapLibreMap, StyleSpecification } from "maplibre-gl";
import { useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";

/**
 * Map of the Spots (IRL-02). The base map comes from NEXT_PUBLIC_MAP_STYLE_URL
 * (a self-hosted or open style, decided at deployment); without it, the Spots
 * sit on a plain night background. The list next to the map carries the same
 * information, so the map is never the only way in.
 */
const CAMPUS_CENTER: [number, number] = [4.823, 45.768];
/** Served by app/(app)/campus/spots/maplibre/[file]/route.ts. */
const WORKER_URL = "/campus/spots/maplibre/maplibre-gl-worker.mjs";

const FALLBACK_STYLE: StyleSpecification = {
  version: 8,
  sources: {},
  layers: [{ id: "background", type: "background", paint: { "background-color": "#16131f" } }],
};

export function SpotsMap({
  spots,
  selected,
  onSelect,
}: {
  spots: readonly SpotView[];
  selected: string | null;
  onSelect: (id: string) => void;
}) {
  const t = useTranslations("spots");
  const container = useRef<HTMLDivElement>(null);
  const map = useRef<MapLibreMap | null>(null);
  const select = useRef(onSelect);
  select.current = onSelect;
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const element = container.current;
      if (!element) {
        return;
      }
      try {
        const { Map: MapLibre, Marker, setWorkerUrl } = await import("maplibre-gl");
        if (cancelled) {
          return;
        }
        setWorkerUrl(WORKER_URL);
        const lngs = spots.map((s) => s.longitude);
        const lats = spots.map((s) => s.latitude);
        const instance = new MapLibre({
          container: element,
          style: process.env.NEXT_PUBLIC_MAP_STYLE_URL || FALLBACK_STYLE,
          center: CAMPUS_CENTER,
          zoom: 12.4,
          ...(spots.length > 1
            ? {
                bounds: [
                  [Math.min(...lngs), Math.min(...lats)],
                  [Math.max(...lngs), Math.max(...lats)],
                ] as [[number, number], [number, number]],
                fitBoundsOptions: { padding: 36 },
              }
            : {}),
          attributionControl: { compact: true },
        });
        map.current = instance;
        spots.forEach((spot, index) => {
          // Pointer shortcut only: the list below is the accessible way to pick a Spot
          // (nearby pins overlap, which would make poor keyboard and touch targets).
          const pin = document.createElement("div");
          pin.textContent = String(index + 1);
          pin.setAttribute("aria-hidden", "true");
          pin.dataset.spot = spot.id;
          pin.className = "spot-pin";
          pin.addEventListener("click", () => select.current(spot.id));
          new Marker({ element: pin }).setLngLat([spot.longitude, spot.latitude]).addTo(instance);
        });
      } catch {
        // No WebGL (old device, some headless browsers): the list is enough.
        if (!cancelled) {
          setFailed(true);
        }
      }
    })();
    return () => {
      cancelled = true;
      map.current?.remove();
      map.current = null;
    };
  }, [spots]);

  useEffect(() => {
    const spot = spots.find((s) => s.id === selected);
    if (spot && map.current) {
      map.current.flyTo({ center: [spot.longitude, spot.latitude], zoom: 14.5 });
    }
    for (const pin of container.current?.querySelectorAll<HTMLElement>(".spot-pin") ?? []) {
      pin.dataset.selected = String(pin.dataset.spot === selected);
    }
  }, [selected, spots]);

  if (failed) {
    return null;
  }
  return (
    <section
      aria-label={t("mapLabel")}
      ref={container}
      className="h-72 w-full overflow-hidden rounded-3xl border border-paper/10 sm:h-96"
    />
  );
}
