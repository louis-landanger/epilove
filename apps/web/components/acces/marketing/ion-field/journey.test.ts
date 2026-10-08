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
    // The two profile cards, bonded, scrolling with the hero.
    profiles: {
      box: box(140, 600, 760, 600),
      cards: [
        { x: 980, y: 440 - scroll, width: 260, height: 400 },
        { x: 1180, y: 440 - scroll, width: 260, height: 400 },
      ],
    },
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
  it("opens on the logo mark drawn large around the two profile cards, its nucleus dark behind them", () => {
    const top = journey(page(0));
    const pair = top.formations.pair;
    expect(pair?.weight).toBe(1);
    // The mark is the two atoms already merged.
    expect(pair?.bond).toBe(1);
    expect(pair?.merge).toBe(1);
    // Centred between the cards, its orbit wider than the pair (230 px each side) but inside the stage.
    expect(pair?.mark.x).toBe(1080);
    expect(pair?.mark.y).toBe(440);
    const halfWidth =
      (pair?.mark.radius ?? 0) * Math.hypot(Math.cos(Math.PI / 6), (9 / 22) * Math.sin(Math.PI / 6));
    expect(halfWidth).toBeGreaterThan(240);
    expect(halfWidth).toBeLessThanOrEqual(300);
    // Dimmer than the logo, and the nucleus, behind the cards, dark.
    expect(pair?.glow).toBeLessThan(1);
    expect(pair?.core).toBe(0);
    expect(top.formations.card).toBeNull();
    expect(top.hidden).toBe(false);
    expect(top.opening).toBe(1);
  });

  it("shrinks the atom into the logo mark beside the manifesto as the cards fade, lighting its nucleus", () => {
    const top = journey(page(0)).formations.pair;
    const manifesto = journey(page(900)).formations.pair;
    // Beside the manifesto on a wide screen: right half, vertically centred, at full light.
    expect(manifesto?.weight).toBe(1);
    expect(manifesto?.mark.x).toBeGreaterThan(width * 0.6);
    expect(manifesto?.mark.y).toBeCloseTo(height / 2, 0);
    expect(manifesto?.mark.radius).toBeLessThan(top?.mark.radius ?? 0);
    expect(manifesto?.glow).toBe(1);
    expect(manifesto?.core).toBe(1);
    // It holds around the cards while they start to scroll, then shrinks on its way.
    expect(journey(page(10)).formations.pair?.mark.y).toBe(440 - 10);
    const midway = journey(page(200)).formations.pair;
    expect(midway?.mark.radius).toBeLessThan(top?.mark.radius ?? 0);
    expect(midway?.mark.radius).toBeGreaterThan(manifesto?.mark.radius ?? 0);
    expect(midway?.core).toBeGreaterThan(0.5);
  });

  it("puts the mark beside the manifesto from the start when there are no cards", () => {
    const top = journey({ ...page(0), profiles: null }).formations.pair;
    expect(top?.weight).toBe(1);
    expect(top?.mark).toEqual(journey(page(900)).formations.pair?.mark);
    expect(top?.glow).toBe(1);
    expect(top?.core).toBe(1);
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
      profiles: null,
      cards: [],
      cardList: null,
      cardRadius: 32,
      rack: null,
      tubes: [],
      pact: null,
      covers: [],
    });
    expect(state.formations).toEqual({
      pair: null,
      card: null,
      tubes: null,
      pact: null,
    });
  });
});
