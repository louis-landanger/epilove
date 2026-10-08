import { describe, expect, it } from "vitest";
import { type JourneyMeasures, journey } from "./journey";

const width = 1440;
const height = 900;
const nodes = new Float32Array([0, 0, 0.5, 0, 1, 0, 0, 1, 0.5, 1, 1, 1]);

/**
 * A page laid out like the landing (hero + manifesto, three stacked cards,
 * the tube rack, the Pact, the safety section), seen with the viewport
 * scrolled to `scroll` pixels.
 */
function page(scroll: number, reactionAge: number | null = null): JourneyMeasures {
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
    // The periodic table, scrolling with the hero; a reaction between two of its elements.
    lattice: { box: box(110, 600, 140, 1000), nodes },
    reaction:
      reactionAge === null
        ? null
        : { from: { x: 300, y: 400 - scroll }, to: { x: 700, y: 300 - scroll }, age: reactionAge },
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
  it("opens on the periodic table, its atoms resting on the nodes", () => {
    const top = journey(page(0));
    expect(top.formations.lattice?.weight).toBe(1);
    expect(top.formations.lattice?.box).toEqual(page(0).lattice?.box);
    expect(top.formations.lattice?.nodes).toBe(nodes);
    expect(top.formations.link).toBeNull();
    expect(top.formations.pair).toBeNull();
    expect(top.formations.card).toBeNull();
    expect(top.hidden).toBe(false);
    expect(top.opening).toBe(1);
  });

  it("bonds the elements that react, then gives the atoms back to the lattice", () => {
    expect(journey(page(0, 0)).formations.link?.weight).toBe(0);
    const bonded = journey(page(0, 2));
    expect(bonded.formations.link).toEqual({ weight: 1, from: { x: 300, y: 400 }, to: { x: 700, y: 300 } });
    expect(journey(page(0, 4.2)).formations.link?.weight).toBe(0);
    // Leaving the hero, no reaction outlives the lattice.
    expect(journey(page(900, 2)).formations.link).toBeNull();
  });

  it("keeps the atoms on the table while the hero starts to scroll", () => {
    const early = journey(page(80));
    expect(early.formations.lattice?.weight).toBe(1);
    expect(early.formations.lattice?.box.top).toBe(110 - 80);
  });

  it("breaks the lattice up into the logo mark beside the manifesto", () => {
    const leaving = journey(page(260));
    const lattice = leaving.formations.lattice?.weight ?? 0;
    expect(lattice).toBeGreaterThan(0.1);
    expect(lattice).toBeLessThan(0.9);
    expect((leaving.formations.pair?.weight ?? 0) + lattice).toBeCloseTo(1, 5);
    // The mark is the two atoms already merged.
    expect(leaving.formations.pair?.bond).toBe(1);
    expect(leaving.formations.pair?.merge).toBe(1);
    const manifesto = journey(page(900));
    expect(manifesto.formations.lattice).toBeNull();
    expect(manifesto.formations.pair?.weight).toBe(1);
    // Beside the manifesto on a wide screen: right half, vertically centred.
    const mark = manifesto.formations.pair?.mark;
    expect(mark?.x).toBeGreaterThan(width * 0.6);
    expect(mark?.y).toBeCloseTo(height / 2, 0);
  });

  it("lets the mark hold the hero when there is no table", () => {
    const top = journey({ ...page(0), lattice: null });
    expect(top.formations.lattice).toBeNull();
    expect(top.formations.pair?.weight).toBe(1);
  });

  it("lets go of the mark and gathers around the cards, one motif per card", () => {
    const leaving = journey(page(2200));
    expect(leaving.formations.pair?.weight ?? 0).toBeLessThan(0.3);

    const first = journey(page(2850));
    expect(first.formations.pair).toBeNull();
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

  it("never sets a particle free, from the top of the page to the bottom", () => {
    for (let scroll = 0; scroll <= 11000; scroll += 37) {
      const { formations } = journey(page(scroll));
      const held =
        (formations.lattice?.weight ?? 0) +
        (formations.pair?.weight ?? 0) +
        (formations.card?.weight ?? 0) +
        (formations.tubes?.weight ?? 0) +
        (formations.pact?.weight ?? 0);
      // Shares under 0.001 are dropped.
      expect(held, `scrolled ${scroll}px`).toBeCloseTo(1, 2);
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
      lattice: null,
      reaction: null,
      cards: [],
      cardList: null,
      cardRadius: 32,
      rack: null,
      tubes: [],
      pact: null,
      covers: [],
    });
    expect(state.formations).toEqual({
      lattice: null,
      link: null,
      pair: null,
      card: null,
      tubes: null,
      pact: null,
    });
  });
});
