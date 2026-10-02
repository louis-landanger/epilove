/**
 * Shape of the legal pages in the `legal` namespace: sections made of
 * paragraphs, lists and tables. Kept as data so French and English stay in
 * lockstep (same keys, checked by i18n/messages.test.ts).
 */
export type LegalBlock =
  | string
  | { readonly list: readonly string[] }
  | {
      readonly table: {
        readonly caption: string;
        readonly head: readonly string[];
        readonly rows: readonly (readonly string[])[];
      };
    };

export interface LegalSection {
  readonly id: string;
  readonly title: string;
  readonly blocks: readonly LegalBlock[];
}

export interface LegalPage {
  readonly title: string;
  readonly description: string;
  readonly sections: readonly LegalSection[];
}

export const LEGAL_PAGES = {
  legalNotice: "/legal/mentions-legales",
  terms: "/legal/cgu",
  privacy: "/legal/confidentialite",
  transparency: "/legal/transparence",
} as const;

export type LegalPageKey = keyof typeof LEGAL_PAGES;

const isStringArray = (value: unknown): value is string[] =>
  Array.isArray(value) && value.every((item) => typeof item === "string");

function isBlock(value: unknown): value is LegalBlock {
  if (typeof value === "string") {
    return true;
  }
  if (typeof value !== "object" || value === null) {
    return false;
  }
  if ("list" in value) {
    return isStringArray(value.list);
  }
  if ("table" in value && typeof value.table === "object" && value.table !== null) {
    const table = value.table as Record<string, unknown>;
    return (
      typeof table.caption === "string" &&
      isStringArray(table.head) &&
      Array.isArray(table.rows) &&
      table.rows.every((row) => isStringArray(row) && row.length === (table.head as string[]).length)
    );
  }
  return false;
}

/** Validates raw messages, so a malformed translation fails loudly instead of rendering half a page. */
export function asLegalPage(value: unknown): LegalPage {
  const page = value as Partial<LegalPage> | null;
  const valid =
    typeof page?.title === "string" &&
    typeof page.description === "string" &&
    Array.isArray(page.sections) &&
    page.sections.every(
      (section) =>
        typeof section?.id === "string" &&
        /^[a-z0-9-]+$/.test(section.id) &&
        typeof section.title === "string" &&
        Array.isArray(section.blocks) &&
        section.blocks.every(isBlock),
    );
  if (!valid) {
    throw new Error("Malformed legal page in the `legal` messages.");
  }
  return page as LegalPage;
}

/** Splits `[placeholders]` out of a draft text, so they can be highlighted. */
export function splitPlaceholders(text: string): Array<{ text: string; placeholder: boolean }> {
  return text
    .split(/(\[[^\]]+\])/)
    .filter((part) => part !== "")
    .map((part) => ({ text: part, placeholder: /^\[[^\]]+\]$/.test(part) }));
}
