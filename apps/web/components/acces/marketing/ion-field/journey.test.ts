import { describe, expect, it } from "vitest";
import { type JourneyMeasures, journey } from "./journey";

const width = 1440;
const height = 900;

/**
 * A page laid out like the landing (hero with the map of the rivers +
 * manifesto, three stacked cards, the tube rack, the waiting list with its
 * school glyph stage, the Pact, the safety section), seen with the viewport
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
    // The map of the rivers, fitted beside the hero's copy, and the hero, a screen tall.
    rivers: box(40, 830, 700, 560),
    riversHero: box(0, height, 0, width),
    cards,
    cardList: box(2860, 1620),
    cardRadius: 32,
    rack: box(5085, 520, 80, 680),
    tubes: [0, 1, 2, 3, 4].map((index) => ({
      box: box(5110, 400, 110 + index * 126, 72),
      level: 0.2 * index,
    })),
    // The school glyph stage, beside the waiting list form, showing Sup'Biotech's.
    glyph: { box: box(5900, 560, 760, 560), school: 2 },
    pact: box(6800, 480, 840, 480),
    covers: [box(7600, 1100, 0, width)],
  };
}

describe("journey", () => {
  const map = { left: 700, top: 40, width: 560, height: 830 };
  const hero = { left: 0, top: 0, width, height };

  it("flows down the rivers in the hero, then gathers into the logo mark beside the manifesto", () => {
    const top = journey(page(0));
    // Every particle in the rivers at first, none in the mark.
    expect(top.formations.rivers?.weight).toBe(1);
    expect(top.formations.rivers?.box).toEqual(map);
    expect(top.formations.pair).toBeNull();
    expect(top.formations.card).toBeNull();
    expect(top.hidden).toBe(false);
    expect(top.opening).toBe(1);
    // Halfway through the hand-over, both share the particles…
    const midway = journey(page(400)).formations;
    expect((midway.rivers?.weight ?? 0) + (midway.pair?.weight ?? 0)).toBeCloseTo(1, 6);
    expect(midway.rivers?.weight).toBeGreaterThan(0.2);
    expect(midway.pair?.weight).toBeGreaterThan(0.2);
    // …and once the hero has scrolled away, the mark holds them all, beside the manifesto.
    const settled = journey(page(820)).formations;
    expect(settled.rivers).toBeNull();
    expect(settled.pair?.weight).toBe(1);
    expect(settled.pair?.mark).toEqual(journey(page(900)).formations.pair?.mark);
  });

  it("stands the mark beside the manifesto, pinned in the viewport, lighting up as the rivers gather into it", () => {
    const manifesto = journey(page(900)).formations.pair;
    // The mark is the two atoms already merged.
    expect(manifesto?.bond).toBe(1);
    expect(manifesto?.merge).toBe(1);
    // Beside the manifesto on a wide screen: right half, vertically centred, at full light.
    expect(manifesto?.weight).toBe(1);
    expect(manifesto?.mark.x).toBeGreaterThan(width * 0.6);
    expect(manifesto?.mark.y).toBeCloseTo(height / 2, 0);
    expect(manifesto?.glow).toBe(1);
    expect(manifesto?.core).toBe(1);
    expect(journey(page(1400)).formations.pair?.mark).toEqual(manifesto?.mark);
    // Dimmer while the rivers start to gather into it, its nucleus dark, then lit.
    const early = journey(page(100)).formations.pair;
    expect(early?.mark).toEqual(manifesto?.mark);
    expect(early?.glow).toBeLessThan(0.7);
    expect(early?.core).toBeLessThan(0.1);
    const midway = journey(page(400)).formations.pair;
    expect(midway?.glow).toBeGreaterThan(early?.glow ?? 1);
    expect(midway?.glow).toBeLessThan(1);
    expect(midway?.core).toBeGreaterThan(0.5);
  });

  it("holds the rivers and the plan while the hero's copy is on screen, and lets go as the hero leaves", () => {
    const at = (scroll: number) => journey(page(scroll)).formations;
    // The copy sits at the foot of the hero: scrolled by 43 % of the screen, all of it still
    // shows. The rivers and the plan are on their way, not gone.
    const copyOnScreen = at(0.43 * height);
    expect(copyOnScreen.rivers?.weight).toBeGreaterThan(0.4);
    expect(copyOnScreen.flight?.progress).toBeLessThan(0.6);
    // They have joined the mark once the hero has nearly left the screen.
    const heroGone = at(0.9 * height);
    expect(heroGone.rivers).toBeNull();
    expect(heroGone.flight?.progress).toBe(1);
  });

  it("flies the plan of Lyon into the mark from the first scroll, landing with the rivers' particles", () => {
    const at = (scroll: number) => journey(page(scroll)).formations;
    // At rest, the plan stays where the page paints it.
    expect(at(0).flight).toMatchObject({ progress: 0, box: map, hero });
    // Scrolling, it sets off at once, at the pace of the scroll, while the rivers' hand-over to the
    // mark eases in: from the first notch of the wheel, it is well on its way…
    const firstNotch = at(100);
    expect(firstNotch.flight?.progress).toBeGreaterThan(0.08);
    expect(firstNotch.flight?.progress).toBeGreaterThan(3 * (firstNotch.pair?.weight ?? 0));
    const midway = at(400);
    expect(midway.flight?.progress).toBeGreaterThan(0.4);
    expect(midway.flight?.hero.top).toBe(-400);
    // …and lands in the mark beside the manifesto, where it stays as long as the mark shows…
    const settled = at(820);
    expect(settled.flight?.progress).toBe(1);
    expect(settled.flight?.mark).toEqual(settled.pair?.mark);
    expect(settled.flight?.presence).toBe(1);
    // …and leaves with it, as the cards take the particles over.
    const cards = at(2600);
    expect(cards.flight?.presence ?? 0).toBeLessThan(0.5);
    expect(cards.flight?.presence).toBeCloseTo(cards.pair ? cards.pair.weight : 0, 6);
  });

  it("puts the mark beside the manifesto from the start when the page shows no rivers", () => {
    const { formations } = journey({ ...page(0), rivers: null, riversHero: null });
    expect(formations.rivers).toBeNull();
    expect(formations.flight).toBeNull();
    expect(formations.pair?.weight).toBe(1);
    expect(formations.pair?.mark).toEqual(journey(page(900)).formations.pair?.mark);
    expect(formations.pair?.glow).toBe(1);
    expect(formations.pair?.core).toBe(1);
  });

  it("lets go of the mark and gathers around the cards, one motif per card", () => {
    const leaving = journey(page(2200));
    expect(leaving.formations.pair?.weight ?? 0).toBeLessThan(0.3);

    const first = journey(page(2600));
    expect(first.formations.pair).toBeNull();
    expect(first.formations.card?.weight).toBeGreaterThan(0.95);
    expect(first.formations.card?.step).toBeCloseTo(0, 1);
    expect(first.formations.card?.box.top).toBeCloseTo(2860 - 2600, 0);

    const second = journey(page(3200));
    expect(second.formations.card?.step).toBeGreaterThan(0.95);
    expect(second.formations.card?.step).toBeLessThan(1.05);

    const third = journey(page(3900));
    expect(third.formations.card?.step).toBeGreaterThan(1.95);
    expect(third.formations.card?.box.top).toBeCloseTo(page(3900).cards[2]?.box.top ?? 0, 0);
  });

  it("morphs from one card to the next while it slides in", () => {
    const halfway = journey(page(2780));
    const step = halfway.formations.card?.step ?? 0;
    expect(step).toBeGreaterThan(0.05);
    expect(step).toBeLessThan(0.95);
  });

  it("hands the outline over to the next card as it slides in, all around it before it settles", () => {
    // The second card (natural top 3270) sticks 108 px from the top of the screen.
    const cardAt = (top: number) => journey(page(3270 - top)).formations.card;
    // Just come into view, under the first card: the first one keeps its motif…
    expect(cardAt(0.8 * height)?.step).toBe(0);
    // …a little higher, sliding over it, the outline is on its way…
    expect(cardAt(0.6 * height)?.step).toBeGreaterThan(0.2);
    // …and all around it while it still has a fifth of the screen to climb: the particles take a
    // moment to follow, and have it outlined by the time it settles.
    const almost = cardAt(108 + 0.2 * height);
    expect(almost?.step).toBe(1);
    expect(almost?.box.top).toBeCloseTo(108 + 0.2 * height, 6);
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
        (formations.rivers?.weight ?? 0) +
        (formations.pair?.weight ?? 0) +
        (formations.card?.weight ?? 0) +
        (formations.tubes?.weight ?? 0) +
        (formations.glyph?.weight ?? 0) +
        (formations.pact?.weight ?? 0);
      // Shares under 0.001 are dropped.
      expect(held, `scrolled ${scroll}px`).toBeCloseTo(1, 2);
    }
  });

  it("draws a school's glyph beside the waiting list, between the tubes and the Pact", () => {
    const join = journey(page(5800));
    expect(join.formations.glyph).toEqual({ weight: 1, box: page(5800).glyph?.box, school: 2 });
    expect(join.formations.tubes).toBeNull();
    expect(join.formations.pact).toBeNull();
    expect(join.hidden).toBe(false);
    // Whichever school the page shows.
    const stage = { left: 760, top: 100, width: 560, height: 560 };
    const shown = journey({ ...page(5800), glyph: { box: stage, school: 4 } });
    expect(shown.formations.glyph?.school).toBe(4);
    // The tubes hand their particles over to it, and it hands them to the Pact.
    const fromTubes = journey(page(5400)).formations;
    expect(fromTubes.tubes?.weight).toBeGreaterThan(0.1);
    expect(fromTubes.glyph?.weight).toBeGreaterThan(0.1);
    const toPact = journey(page(6300)).formations;
    expect(toPact.glyph?.weight).toBeGreaterThan(0.05);
    expect(toPact.pact?.weight).toBeGreaterThan(0.05);
  });

  it("keeps the nearest shape between sections, and rests once it is off screen", () => {
    // Without the glyph stage, the tubes still hold the particles while the rack scrolls away…
    const withoutGlyph = (scroll: number) => journey({ ...page(scroll), glyph: null });
    const leaving = withoutGlyph(5520);
    expect(leaving.formations.tubes?.weight).toBe(1);
    expect(leaving.hidden).toBe(false);
    // …and once both they and the Pact are off screen, the field rests.
    expect(withoutGlyph(5800).hidden).toBe(true);
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
      rivers: null,
      riversHero: null,
      cards: [],
      cardList: null,
      cardRadius: 32,
      rack: null,
      tubes: [],
      glyph: null,
      pact: null,
      covers: [],
    });
    expect(state.formations).toEqual({
      pair: null,
      card: null,
      tubes: null,
      glyph: null,
      pact: null,
      rivers: null,
      flight: null,
    });
  });
});
