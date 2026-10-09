import { SCHOOLS } from "@atomes/core";
import { MERGED_COURSE, RHONE_COURSE, RIVER_MAP, RIVER_PLACES, SAONE_COURSE } from "@atomes/three";
import { getTranslations } from "next-intl/server";
import type { CSSProperties } from "react";
import { CityCanvas } from "./city-canvas";

/** A course of rivers.ts as SVG points: kilometres, y down (north at the top). */
function points(course: readonly number[]): string {
  const out: string[] = [];
  for (let index = 0; index + 1 < course.length; index += 2) {
    out.push(`${course[index]},${-(course[index + 1] ?? 0)}`);
  }
  return out.join(" ");
}

/** Where a label sits on the map, from a place of rivers.ts (kilometres east and north). */
function at([x, y]: readonly [number, number]): CSSProperties {
  const left = (x - RIVER_MAP.minX) / (RIVER_MAP.maxX - RIVER_MAP.minX);
  const top = (RIVER_MAP.maxY - y) / (RIVER_MAP.maxY - RIVER_MAP.minY);
  return { left: `${(left * 100).toFixed(2)}%`, top: `${(top * 100).toFixed(2)}%` };
}

/**
 * The rivers drawn in dots, for those who see no particles (no GPU, reduced
 * motion): the same courses as the field's, fitted to the same box.
 */
function RiversDrawing() {
  const width = RIVER_MAP.maxX - RIVER_MAP.minX;
  const height = RIVER_MAP.maxY - RIVER_MAP.minY;
  return (
    <svg
      className="fleuves-drawing"
      viewBox={`${RIVER_MAP.minX} ${-RIVER_MAP.maxY} ${width} ${height}`}
      preserveAspectRatio="xMidYMid meet"
      aria-hidden="true"
      focusable="false"
    >
      <polyline className="fleuves-course fleuves-saone" points={points(SAONE_COURSE)} />
      <polyline className="fleuves-course fleuves-rhone" points={points(RHONE_COURSE)} />
      <polyline className="fleuves-course fleuves-merged" points={points(MERGED_COURSE)} />
    </svg>
  );
}

/**
 * Hero under study (`/apercu/fleuves`, docs/02-design.md, section 5): the
 * plan of Lyon drawn in some hundred and fifty thousand dots fills the hero,
 * lit up from the Confluence outwards, and the particles of the ion field
 * flow down its two rivers, the Saône and the Rhône, along their real
 * courses, to meet at the Confluence, where they go on together, side by
 * side, then mixed, each pair bonded. In Lyon, even the rivers end up
 * meeting. Scrolling, the particles gather into the logo mark beside the
 * manifesto (ion-field/journey.ts).
 */
export async function FleuvesHero() {
  const t = await getTranslations("home");

  return (
    <section id="hero" aria-labelledby="hero-title" className="hero fleuves-hero">
      <CityCanvas />
      <div className="fleuves-shade" aria-hidden="true" />
      <div className="fleuves-map" data-field-rivers aria-hidden="true">
        <RiversDrawing />
        {/* The names leave with the hero's text as the page scrolls, while the rivers gather into the logo mark. */}
        <div className="fleuves-names" data-hero-content>
          <span className="fleuves-river" style={at(RIVER_PLACES.saone)}>
            {t("fleuves.saone")}
          </span>
          <span className="fleuves-river fleuves-river-rhone" style={at(RIVER_PLACES.rhone)}>
            {t("fleuves.rhone")}
          </span>
          <span className="fleuves-place" style={at(RIVER_PLACES.confluence)}>
            {t("fleuves.confluence")}
          </span>
          <span className="fleuves-place" style={at(RIVER_PLACES.vaise)}>
            {t("fleuves.vaise")}
          </span>
        </div>
      </div>
      <div className="fleuves-copy">
        <h1 id="hero-title" className="fleuves-title">
          <span className="fleuves-line">{t("titleLead")}</span>{" "}
          <span className="fleuves-line">{t("titleAccent")}</span>
        </h1>
        <p className="fleuves-lead">{t("fleuves.lead")}</p>
        <div className="fleuves-call">
          <a href="#rejoindre" className="fleuves-cta">
            {t("cta")}
          </a>
          <ul aria-label={t("schools")} className="hero-schools fleuves-schools">
            {SCHOOLS.map((school) => (
              <li key={school.slug}>{school.name}</li>
            ))}
          </ul>
        </div>
      </div>
      <p className="fleuves-credit" data-hero-content>
        {t("fleuves.credit")}
      </p>
    </section>
  );
}
