import type { PixelBox, ViewportFormations } from "@atomes/three";

/**
 * The ion field's journey down the landing page (docs/02-design.md, moment 1
 * onwards): from the measured position of each section, how condensed the
 * field is, which shapes it draws (the stacked cards, the school race tubes,
 * the Pact rings) and how bright it is. Pure, so it can be tested without a
 * browser; the canvas measures the page and applies the result every frame.
 */

export interface JourneyMeasures {
  /** Viewport size, in CSS pixels. */
  readonly width: number;
  readonly height: number;
  /** Hero and manifesto (`[data-field-scope]`): the field condenses into the logo mark there. */
  readonly scope: PixelBox | null;
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
  /** 0: free field, 1: condensed into the logo mark. */
  readonly condense: number;
  /** 1 while the hero and the manifesto are on screen, 0 once they have scrolled away. */
  readonly opening: number;
  /** Overall brightness: the field recedes behind the sections that are mostly text. */
  readonly dim: number;
  /** An opaque section hides the whole field. */
  readonly hidden: boolean;
  readonly formations: ViewportFormations;
}

/** Brightness of the free field once the opening has scrolled away. */
const RESTING_DIM = 0.45;

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

/**
 * The stacked cards: the formation gathers as the first card comes up and
 * lets go once the list scrolls away; in between it follows whichever card
 * is on top, morphing into the next one (and the next motif) as it slides in.
 */
function cardFormation(measures: JourneyMeasures): ViewportFormations["card"] {
  const { cards, cardList, height } = measures;
  const first = cards[0];
  if (!first || !cardList) {
    return null;
  }
  const weight =
    ramp((height - first.box.top) / (0.55 * height)) *
    ramp((bottomOf(cardList) - 0.25 * height) / (0.5 * height));
  if (weight <= 0.001) {
    return null;
  }
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
  return { weight, box, radius: measures.cardRadius, step };
}

export function journey(measures: JourneyMeasures): JourneyState {
  const { height, scope, rack, pact } = measures;

  // Hero and manifesto: the field condenses into the logo mark, then lets go as the manifesto leaves.
  const opening = scope ? ramp((bottomOf(scope) - 0.3 * height) / (0.7 * height)) : 0;
  const condense = scope ? ramp(-scope.top / (0.85 * height)) * opening : 0;

  const card = cardFormation(measures);

  const tubesWeight = rack
    ? ramp((0.92 * height - rack.top) / (0.42 * height)) *
      ramp((bottomOf(rack) - 0.08 * height) / (0.4 * height))
    : 0;
  const tubes = tubesWeight > 0.001 ? { weight: tubesWeight, tubes: measures.tubes } : null;

  const pactWeight = pact
    ? ramp((0.95 * height - pact.top) / (0.45 * height)) *
      ramp((bottomOf(pact) - 0.05 * height) / (0.4 * height))
    : 0;
  const pactFormation = pact && pactWeight > 0.001 ? { weight: pactWeight, box: pact } : null;

  const shaping = Math.max(opening, card?.weight ?? 0, tubesWeight, pactWeight);
  return {
    condense,
    opening,
    dim: RESTING_DIM + (1 - RESTING_DIM) * shaping,
    hidden: measures.covers.some((cover) => cover.top <= 0 && bottomOf(cover) >= height),
    formations: { card, tubes, pact: pactFormation },
  };
}
