/**
 * House stickers (CHAT-05): drawn in the app's own style, some in the
 * colours of the schools (never a school's logo or brand). Only these ids
 * can be sent; the drawings live in the web app.
 */
export const STICKERS = [
  "atom-heart",
  "bond",
  "spark",
  "coffee",
  "laugh",
  "blush",
  "wow",
  "cheers",
  "school-epita",
  "school-esme",
  "school-supbiotech",
  "school-isg",
  "school-ipsa",
] as const;
export type StickerId = (typeof STICKERS)[number];

export const isSticker = (value: string): value is StickerId =>
  (STICKERS as readonly string[]).includes(value);
