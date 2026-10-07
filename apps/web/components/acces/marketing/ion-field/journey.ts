import { markPlacementFor, type PixelBox, type ViewportFormations } from "@atomes/three";
import type { TitleGlyphs } from "./title-glyphs";

/**
 * The ion field's journey down the landing page (docs/02-design.md, section
 * 5): from the measured position of each section, which shapes the particles
 * draw (the hero's title, the logo mark beside the manifesto, the stacked
 * cards, the school race tubes, the Pact rings) and how they share them. Pure,
 * so it can be tested without a browser; the canvas measures the page and
 * applies the result every frame.
 */

export interface JourneyMeasures {
  /** Viewport size, in CSS pixels. */
  readonly width: number;
  readonly height: number;
  /** Hero and manifesto (`[data-field-scope]`): the field condenses into the logo mark there. */
  readonly scope: PixelBox | null;
  /** The giant line of the hero's title (`[data-field-title]`) and the points of its glyphs. */
  readonly title: { readonly box: PixelBox; readonly glyphs: TitleGlyphs } | null;
  /** The stacked cards of "how it works", in order, with the top at which each one sticks. */
  readonly cards: ReadonlyArray<{ readonly box: PixelBox; readonly stuckTop: number }>;
  /** The list holding the cards: the formation lets go once it scrolls away. */
  readonly cardList: PixelBox | null;
  /** Corner radius of the cards, in CSS pixels. */
  readonly cardRadius: number;
  /** The test tube rack of the school race. */
  readonly rack: PixelBox | null;
  /** One entry per school, in `SCHOOL_KEYS` order: glass of the tube and liquid level in [0, 1]. */
  readonly tubes: ReadonlyArray<{ readonly box: PixelBox; readonly level: number } | null>;
  /** The Pact stage (its rings). */
  readonly pact: PixelBox | null;
  /** Opaque sections: while one fills the viewport, the field is hidden and can rest. */
  readonly covers: ReadonlyArray<PixelBox>;
}

export interface JourneyState {
  /** 1 while the hero and the manifesto are on screen, 0 once they have scrolled away. */
  readonly opening: number;
  /** Nothing of the field shows: an opaque section fills the viewport, or the shape it holds is off screen. */
  readonly hidden: boolean;
  /** The weights add up to 1: no particle ever drifts freely. */
  readonly formations: ViewportFormations;
}

const ramp = (value: number) => {
  const t = Math.min(1, Math.max(0, value));
  return t * t * (3 - 2 * t);
};

const bottomOf = (box: PixelBox) => box.top + box.height;

function lerpBox(from: PixelBox, to: PixelBox, t: number): PixelBox {
  return {
    left: from.left + (to.left - from.left) * t,
    top: from.top + (to.top - from.top) * t,
    width: from.width + (to.width - from.width) * t,
    height: from.height + (to.height - from.height) * t,
  };
}

/** A shape of the journey: how present its section is, and where it stands. */
interface Stage {
  readonly presence: number;
  readonly box: PixelBox;
}

/**
 * The stacked cards: present from the moment the first card comes up until
 * the list scrolls away; the shape follows whichever card is on top,
 * morphing into the next one (and the next motif) as it slides in.
 */
function cardStage(measures: JourneyMeasures): (Stage & { readonly step: number }) | null {
  const { cards, cardList, height } = measures;
  const first = cards[0];
  if (!first || !cardList) {
    return null;
  }
  const presence =
    ramp((height - first.box.top) / (0.55 * height)) *
    ramp((bottomOf(cardList) - 0.25 * height) / (0.5 * height));
  let box = first.box;
  let step = 0;
  // Cards follow each other closely: the motif changes over the last stretch of
  // the next card's climb, so every card keeps its own motif for a while.
  const handover = 0.35 * height;
  for (const card of cards.slice(1)) {
    const arrival = ramp((card.stuckTop + handover - card.box.top) / handover);
    box = lerpBox(box, card.box, arrival);
    step += arrival;
  }
  return { presence, box, step };
}

/** Distance from a box to the middle of the viewport (0 when it spans it). */
function distanceToMiddle(box: PixelBox, height: number): number {
  const middle = height / 2;
  if (box.top <= middle && bottomOf(box) >= middle) {
    return 0;
  }
  return Math.min(Math.abs(box.top - middle), Math.abs(bottomOf(box) - middle));
}

/**
 * In the hero the particles write the title; scrolling, its letters break up
 * into the logo mark beside the manifesto; further down come the cards, the
 * tubes and the Pact rings. Every particle always belongs to a shape:
 * neighbouring shapes share the particles while one section gives way to the
 * next (their weights add up to 1); between sections the nearest shape keeps
 * them, and scrolls away with its section.
 */
export function journey(measures: JourneyMeasures): JourneyState {
  const { height, scope, title, rack, pact } = measures;

  // How far into the hero the page has scrolled, in viewports.
  const scrolled = scope ? Math.max(0, -scope.top) / height : 1;
  // The letters hold while the hero copy fades, then leave for the logo mark…
  const settle = title ? ramp((scrolled - 0.12) / 0.38) : 1;
  // …which hands the particles over to the cards as the manifesto leaves.
  const opening = scope ? ramp((bottomOf(scope) - 0.3 * height) / (0.7 * height)) : 0;

  // Where the logo mark stands: beside the manifesto on wide screens, above it on narrow ones.
  const placement = markPlacementFor(measures.width / height);
  const mark = {
    x: measures.width / 2 + (placement.x * height) / 2,
    y: height / 2 - (placement.y * height) / 2,
    radius: (placement.scale * height) / 2,
  };
  const markBox: PixelBox = {
    left: mark.x - mark.radius,
    top: mark.y - mark.radius,
    width: 2 * mark.radius,
    height: 2 * mark.radius,
  };

  const card = cardStage(measures);
  const stages: ReadonlyArray<Stage | null> = [
    // The title scrolls with the hero; the mark is pinned in the viewport, but leaves with the
    // hero and the manifesto (the nearest-shape rule).
    scope && title ? { presence: opening * (1 - settle), box: title.box } : null,
    scope ? { presence: opening * settle, box: scope } : null,
    card,
    rack
      ? {
          presence:
            ramp((0.92 * height - rack.top) / (0.42 * height)) *
            ramp((bottomOf(rack) - 0.08 * height) / (0.4 * height)),
          box: rack,
        }
      : null,
    pact
      ? {
          presence:
            ramp((0.95 * height - pact.top) / (0.45 * height)) *
            ramp((bottomOf(pact) - 0.05 * height) / (0.4 * height)),
          box: pact,
        }
      : null,
  ];

  const weights = stages.map((stage) => stage?.presence ?? 0);
  let total = weights.reduce((sum, weight) => sum + weight, 0);
  if (total < 0.001) {
    // Between sections: the nearest shape keeps the particles.
    let nearest = -1;
    let best = Number.POSITIVE_INFINITY;
    for (const [index, stage] of stages.entries()) {
      const distance = stage ? distanceToMiddle(stage.box, height) : Number.POSITIVE_INFINITY;
      if (distance < best) {
        best = distance;
        nearest = index;
      }
    }
    if (nearest >= 0) {
      weights[nearest] = 1;
      total = 1;
    }
  }
  const share = (index: number) => (total > 0 ? (weights[index] ?? 0) / total : 0);
  const [titleShare, pairShare, cardShare, tubesShare, pactShare] = [0, 1, 2, 3, 4].map(share) as [
    number,
    number,
    number,
    number,
    number,
  ];

  // The mark is pinned in the viewport; the other shapes leave with their section.
  const offScreen = (stage: Stage | null) => !stage || bottomOf(stage.box) < 0 || stage.box.top > height;
  const shapesOffScreen =
    pairShare <= 0.001 &&
    [titleShare, cardShare, tubesShare, pactShare].every((weight, index) => {
      const stage = stages[index === 0 ? 0 : index + 1] ?? null;
      return weight <= 0.001 || offScreen(stage);
    });

  return {
    opening,
    hidden: shapesOffScreen || measures.covers.some((cover) => cover.top <= 0 && bottomOf(cover) >= height),
    formations: {
      title: title && titleShare > 0.001 ? { weight: titleShare, box: title.box, ...title.glyphs } : null,
      // The mark is the two atoms merged (formations.ts): bonded and merged from the start.
      pair: scope && pairShare > 0.001 ? { weight: pairShare, box: markBox, bond: 1, merge: 1, mark } : null,
      card:
        card && cardShare > 0.001
          ? { weight: cardShare, box: card.box, radius: measures.cardRadius, step: card.step }
          : null,
      tubes: rack && tubesShare > 0.001 ? { weight: tubesShare, tubes: measures.tubes } : null,
      pact: pact && pactShare > 0.001 ? { weight: pactShare, box: pact } : null,
    },
  };
}
