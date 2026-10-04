import { describe, expect, it } from "vitest";
import { type JourneyMeasures, journey } from "./journey";

const width = 1440;
const height = 900;

/**
 * A page laid out like the landing (hero + manifesto, three stacked cards,
 * the tube rack, the Pact, the safety section), seen with the viewport
 * scrolled to `scroll` pixels.
 */
function page(scroll: number): JourneyMeasures {
  const box = (top: number, boxHeight: number, left = 80, boxWidth = 1280) => ({
    left,
    top: top - scroll,
    width: boxWidth,
    height: boxHeight,
  });
  // Sticky cards: once their top reaches their sticking point they stay there.
  const stuckTops = [88, 108, 128];
  const cardTops = [2860, 3270, 3960];
  const cards = cardTops.map((top, index) => {
    const stuckTop = stuckTops[index] ?? 88;
    const listBottom = 4480 - scroll;
    const natural = top - scroll;
    const stuck = Math.min(Math.max(natural, stuckTop), listBottom - 520);
    return { box: { left: 80, top: stuck, width: 1280, height: 520 }, stuckTop };
  });
  return {
    width,
    height,
    scope: box(0, 2430, 0, width),
    cards,
    cardList: box(2860, 1620),
    cardRadius: 32,
    rack: box(5085, 520, 80, 680),
    tubes: [0, 1, 2, 3, 4].map((index) => ({
      box: box(5110, 400, 110 + index * 126, 72),
      level: 0.2 * index,
    })),
    pact: box(6800, 480, 840, 480),
    covers: [box(7600, 1100, 0, width)],
  };
}

describe("journey", () => {
  it("drifts freely at the top, then condenses into the logo mark over the manifesto", () => {
    const top = journey(page(0));
    expect(top.condense).toBe(0);
    expect(top.formations).toEqual({ card: null, tubes: null, pact: null });
    const manifesto = journey(page(900));
    expect(manifesto.condense).toBeGreaterThan(0.9);
  });

  it("lets go of the mark and gathers around the cards, one motif per card", () => {
    const leaving = journey(page(2200));
    expect(leaving.condense).toBeLessThan(0.3);

    const first = journey(page(2850));
    expect(first.condense).toBe(0);
    expect(first.formations.card?.weight).toBeGreaterThan(0.95);
    expect(first.formations.card?.step).toBeCloseTo(0, 1);
    expect(first.formations.card?.box.top).toBeCloseTo(88, 0);

    const second = journey(page(3200));
    expect(second.formations.card?.step).toBeGreaterThan(0.95);
    expect(second.formations.card?.step).toBeLessThan(1.05);

    const third = journey(page(3900));
    expect(third.formations.card?.step).toBeGreaterThan(1.95);
    expect(third.formations.card?.box.top).toBeCloseTo(page(3900).cards[2]?.box.top ?? 0, 0);
  });

  it("morphs from one card to the next while it slides in", () => {
    const halfway = journey(page(2900));
    const step = halfway.formations.card?.step ?? 0;
    expect(step).toBeGreaterThan(0.05);
    expect(step).toBeLessThan(0.95);
  });

  it("pours into the tubes once the cards have gone, then orbits the Pact", () => {
    const tubes = journey(page(4900));
    expect(tubes.formations.card).toBeNull();
    expect(tubes.formations.tubes?.weight).toBeGreaterThan(0.95);
    expect(tubes.formations.tubes?.tubes).toHaveLength(5);

    const pact = journey(page(6600));
    expect(pact.formations.tubes).toBeNull();
    expect(pact.formations.pact?.weight).toBeGreaterThan(0.95);
  });

  it("never sets a particle free once the hero is scrolled past", () => {
    for (let scroll = 800; scroll <= 11000; scroll += 37) {
      const { condense, formations } = journey(page(scroll));
      const held =
        condense +
        (formations.card?.weight ?? 0) +
        (formations.tubes?.weight ?? 0) +
        (formations.pact?.weight ?? 0);
      expect(held, `scrolled ${scroll}px`).toBeCloseTo(1, 5);
    }
  });

  it("keeps the nearest shape between sections, and rests once it is off screen", () => {
    // Just after the tubes, they still hold the particles while the rack scrolls away.
    const leaving = journey(page(5520));
    expect(leaving.formations.tubes?.weight).toBe(1);
    expect(leaving.hidden).toBe(false);
    // Between the tubes and the Pact (the waiting list form), both off screen: the field rests.
    const between = journey(page(5800));
    expect(between.hidden).toBe(true);
    // Further down, the Pact holds them, off screen: nothing to draw.
    const faq = journey(page(9300));
    expect(faq.formations.pact?.weight).toBe(1);
    expect(faq.hidden).toBe(true);
    // An opaque section filling the viewport hides the field too.
    expect(journey(page(7650)).hidden).toBe(true);
    expect(journey(page(6600)).hidden).toBe(false);
  });

  it("copes with a page missing some sections", () => {
    const state = journey({
      width,
      height,
      scope: null,
      cards: [],
      cardList: null,
      cardRadius: 32,
      rack: null,
      tubes: [],
      pact: null,
      covers: [],
    });
    expect(state.condense).toBe(0);
    expect(state.formations).toEqual({ card: null, tubes: null, pact: null });
  });
});
