import { markPlacementFor, type PixelBox, type ViewportFormations } from "@atomes/three";

/**
 * The ion field's journey down the landing page (docs/02-design.md, section
 * 5): from the measured position of each section, which shapes the particles
 * draw (Lyon's two rivers in the hero, the logo mark beside the manifesto,
 * the stacked cards, the school race tubes, the schools' glyphs beside the
 * waiting list, the Pact rings) and how they share them. Pure, so it can be tested without a browser; the canvas
 * measures the page and applies the result every frame.
 */

export interface JourneyMeasures {
  /** Viewport size, in CSS pixels. */
  readonly width: number;
  readonly height: number;
  /** Hero and manifesto (`[data-field-scope]`): the field condenses into the logo mark there. */
  readonly scope: PixelBox | null;
  /**
   * The map of Lyon's two rivers in the hero (`[data-field-rivers]`): the
   * particles flow down them, then gather into the logo mark beside the
   * manifesto.
   */
  readonly rivers: PixelBox | null;
  /**
   * The hero that holds the map of the rivers, where the plan of Lyon is
   * painted: scrolling, the field flies the plan's dots from it into the
   * logo mark.
   */
  readonly riversHero: PixelBox | null;
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
  /**
   * The school glyph stage beside the waiting list form (`[data-field-glyph]`)
   * and the school whose glyph it shows: an index into `SCHOOL_KEYS`, -1 for none.
   */
  readonly glyph: { readonly box: PixelBox; readonly school: number } | null;
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

/**
 * When the hero hands its rivers' particles and its plan to the logo mark, in
 * viewports scrolled: from `from`, over `span`. The hero is a screen tall,
 * its copy at its foot: the hand-over ends as the copy leaves the screen.
 */
const RIVERS_SETTLE = { from: 0.03, span: 0.85 } as const;

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
 * When the next stacked card takes the outline over, in screens above the
 * top at which it sticks: from `from`, as it slides over the previous one,
 * to `to`, a quarter of a screen before it settles, so that the particles,
 * which take a moment to follow, outline it by then.
 */
const CARD_HANDOVER = { from: 0.6, to: 0.25 } as const;

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
  // Cards follow each other closely: the outline and its motif go to the next card while it slides
  // over the previous one, and are all around it before it settles, the particles taking a moment to
  // follow; every card keeps its own motif for a while.
  const from = CARD_HANDOVER.from * height;
  const span = (CARD_HANDOVER.from - CARD_HANDOVER.to) * height;
  for (const card of cards.slice(1)) {
    const arrival = ramp((card.stuckTop + from - card.box.top) / span);
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

/** Light of the logo mark as the rivers start to gather into it (beside the manifesto: 1). */
const MARK_GLOW_FROM = 0.6;

/**
 * In the hero the particles flow down Lyon's two rivers. Scrolling, they
 * gather into the logo mark beside the manifesto, where its nucleus lights
 * up, with the dots of the plan of Lyon; further down come the stacked
 * cards, the tubes, the schools' glyphs beside the waiting list and the Pact
 * rings. Every particle always belongs to a shape: neighbouring shapes share
 * the particles while one section gives way to the next (their weights add up
 * to 1); between sections the nearest shape keeps them, and scrolls away with
 * its section.
 */
export function journey(measures: JourneyMeasures): JourneyState {
  const { height, scope, rivers, rack, glyph, pact } = measures;

  // How far into the hero the page has scrolled, in viewports.
  const scrolled = scope ? Math.max(0, -scope.top) / height : 1;
  // The rivers and the plan of Lyon flow into the logo mark as the hero leaves the screen, its copy
  // (at its foot) with it; without them, the mark stands beside the manifesto from the start…
  const settle = rivers ? ramp((scrolled - RIVERS_SETTLE.from) / RIVERS_SETTLE.span) : 1;
  // The plan of Lyon flows with them, from its foot, at the pace of the scroll itself rather than
  // easing in as their hand-over does: it sets off at the first notch of the wheel, and lands with
  // them at the end.
  const flow = Math.min(1, Math.max(0, (scrolled - RIVERS_SETTLE.from) / RIVERS_SETTLE.span));
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
    // The rivers and the mark leave with the hero and the manifesto (the nearest-shape rule).
    scope ? { presence: opening, box: scope } : null,
    card,
    rack
      ? {
          presence:
            ramp((0.92 * height - rack.top) / (0.42 * height)) *
            ramp((bottomOf(rack) - 0.08 * height) / (0.4 * height)),
          box: rack,
        }
      : null,
    glyph
      ? {
          presence:
            ramp((0.9 * height - glyph.box.top) / (0.4 * height)) *
            ramp((bottomOf(glyph.box) - 0.1 * height) / (0.4 * height)),
          box: glyph.box,
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
  const [pairShare, cardShare, tubesShare, glyphShare, pactShare] = [0, 1, 2, 3, 4].map(share) as [
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
    [cardShare, tubesShare, glyphShare, pactShare].every(
      (weight, index) => weight <= 0.001 || offScreen(stages[index + 1] ?? null),
    );

  return {
    opening,
    hidden: shapesOffScreen || measures.covers.some((cover) => cover.top <= 0 && bottomOf(cover) >= height),
    formations: {
      // The mark is the two atoms merged (formations.ts): bonded and merged from the start, pinned
      // in the viewport. The rivers hold the particles first and hand them to it on scroll: dimmer,
      // its nucleus dark, it lights up as they gather into it.
      pair:
        scope && pairShare * (rivers ? settle : 1) > 0.001
          ? {
              weight: pairShare * (rivers ? settle : 1),
              box: markBox,
              bond: 1,
              merge: 1,
              mark,
              glow: MARK_GLOW_FROM + (1 - MARK_GLOW_FROM) * settle,
              core: ramp(settle / 0.5),
            }
          : null,
      card:
        card && cardShare > 0.001
          ? { weight: cardShare, box: card.box, radius: measures.cardRadius, step: card.step }
          : null,
      tubes: rack && tubesShare > 0.001 ? { weight: tubesShare, tubes: measures.tubes } : null,
      glyph:
        glyph && glyphShare > 0.001 ? { weight: glyphShare, box: glyph.box, school: glyph.school } : null,
      pact: pact && pactShare > 0.001 ? { weight: pactShare, box: pact } : null,
      rivers:
        rivers && scope && pairShare * (1 - settle) > 0.001
          ? { weight: pairShare * (1 - settle), box: rivers }
          : null,
      // The plan of Lyon flies into the mark from the first scroll (`flow`), lands with the
      // rivers' particles, and stays in it as long as it shows.
      flight:
        rivers && scope && measures.riversHero
          ? { progress: flow, presence: pairShare, box: rivers, hero: measures.riversHero, mark }
          : null,
    },
  };
}
