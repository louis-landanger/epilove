import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { Terminal } from "@/components/acces/fun/terminal";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("common.terminal");
  return { title: t("metaTitle"), robots: { index: false } };
}

/** COM-05: hidden terminal, announced only in the browser console. */
export default function TerminalPage() {
  return (
    <main id="contenu" className="mx-auto w-full max-w-3xl px-4 py-10">
      <h1 className="sr-only">Terminal</h1>
      <Terminal />
    </main>
  );
}
