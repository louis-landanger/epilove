import type { Metadata } from "next";
import { getMessages } from "next-intl/server";
import { asLegalPage, type LegalPageKey } from "./legal-content";

export async function legalMetadata(page: LegalPageKey): Promise<Metadata> {
  const content = asLegalPage((await getMessages()).legal[page]);
  return { title: content.title, description: content.description };
}
