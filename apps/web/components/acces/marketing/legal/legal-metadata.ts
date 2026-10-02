import type { Locale } from "@epilove/core";
import type { Metadata } from "next";
import { getLocale, getMessages } from "next-intl/server";
import { publicAlternates } from "@/i18n/paths";
import { asLegalPage, LEGAL_PAGES, type LegalPageKey } from "./legal-content";

export async function legalMetadata(page: LegalPageKey): Promise<Metadata> {
  const content = asLegalPage((await getMessages()).legal[page]);
  return {
    title: content.title,
    description: content.description,
    alternates: publicAlternates((await getLocale()) as Locale, LEGAL_PAGES[page]),
  };
}
