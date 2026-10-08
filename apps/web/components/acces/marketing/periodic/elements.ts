/**
 * The periodic table of the hero (docs/02-design.md, section 5): the 118
 * elements in their usual places, some of which stand for a piece of campus
 * life written with their real symbol (Ca, café; Pb, problème). Pure data
 * and rules; the names are in the messages (`home.elements`).
 */

/** Symbols of the elements, by atomic number (index + 1), one period per line. */
export const SYMBOLS: readonly string[] = [
  "H He",
  "Li Be B C N O F Ne",
  "Na Mg Al Si P S Cl Ar",
  "K Ca Sc Ti V Cr Mn Fe Co Ni Cu Zn Ga Ge As Se Br Kr",
  "Rb Sr Y Zr Nb Mo Tc Ru Rh Pd Ag Cd In Sn Sb Te I Xe",
  "Cs Ba La Ce Pr Nd Pm Sm Eu Gd Tb Dy Ho Er Tm Yb Lu Hf Ta W Re Os Ir Pt Au Hg Tl Pb Bi Po At Rn",
  "Fr Ra Ac Th Pa U Np Pu Am Cm Bk Cf Es Fm Md No Lr Rf Db Sg Bh Hs Mt Ds Rg Cn Nh Fl Mc Lv Ts Og",
]
  .join(" ")
  .split(" ");

/** What a piece of campus life is about: its colour in the table and in the legend. */
export type Family = "outing" | "sport" | "study" | "heart";

export const FAMILIES: readonly Family[] = ["outing", "sport", "study", "heart"];

/** The elements that stand for something on campus (atomic number: family). */
export const CAMPUS_FAMILIES: Readonly<Record<number, Family>> = {
  1: "study",
  4: "outing",
  6: "outing",
  7: "study",
  8: "study",
  9: "sport",
  11: "sport",
  12: "outing",
  13: "study",
  14: "outing",
  15: "outing",
  16: "sport",
  17: "outing",
  18: "outing",
  19: "outing",
  20: "outing",
  23: "sport",
  26: "outing",
  27: "outing",
  29: "outing",
  31: "outing",
  33: "outing",
  35: "outing",
  39: "sport",
  42: "heart",
  44: "sport",
  46: "outing",
  50: "outing",
  52: "sport",
  56: "sport",
  57: "study",
  59: "study",
  63: "study",
  71: "outing",
  75: "study",
  78: "study",
  82: "study",
  83: "study",
  84: "heart",
  86: "sport",
  87: "outing",
  88: "outing",
  90: "outing",
  91: "sport",
  95: "heart",
  110: "heart",
  112: "outing",
  114: "heart",
  116: "heart",
};

/** Rows of the table: seven periods, a gap, then the lanthanides and actinides. */
export const TABLE_ROWS = 10;
export const TABLE_COLUMNS = 18;

/**
 * Row and column (from 1) of element `z` in the 18-column table. The
 * lanthanides (57–71) and actinides (89–103) sit apart on rows 9 and 10,
 * from column 3, under an empty row.
 */
export function place(z: number): readonly [row: number, column: number] {
  if (z === 1) {
    return [1, 1];
  }
  if (z === 2) {
    return [1, 18];
  }
  if (z <= 10) {
    return [2, z <= 4 ? z - 2 : z + 8];
  }
  if (z <= 18) {
    return [3, z <= 12 ? z - 10 : z];
  }
  if (z <= 36) {
    return [4, z - 18];
  }
  if (z <= 54) {
    return [5, z - 36];
  }
  if (z <= 56) {
    return [6, z - 54];
  }
  if (z <= 71) {
    return [9, z - 54];
  }
  if (z <= 86) {
    return [6, z - 68];
  }
  if (z <= 88) {
    return [7, z - 86];
  }
  if (z <= 103) {
    return [10, z - 86];
  }
  return [7, z - 100];
}

/** How well two elements react, in percent (72 to 98): the same pair always gives the same score. */
export function reactionScore(a: number, b: number): number {
  const [low, high] = a < b ? [a, b] : [b, a];
  return 72 + ((low * 37 + high * 53) % 27);
}

/** The verdict a score earns: 0 explosive (95 and up), 1 stable (88), 2 slow but sure (80), 3 shy. */
export function verdictFor(score: number): 0 | 1 | 2 | 3 {
  if (score >= 95) {
    return 0;
  }
  if (score >= 88) {
    return 1;
  }
  if (score >= 80) {
    return 2;
  }
  return 3;
}
