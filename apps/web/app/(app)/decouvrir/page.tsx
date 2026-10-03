import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import { DiscoverScreen } from "@/components/rencontre/discovery/discover-screen";
import { GateScreen } from "@/components/rencontre/ui/states";
import { serverApi } from "@/lib/rencontre/api.server";
import { gated } from "@/lib/rencontre/gate";
import { contentLocale } from "@/lib/rencontre/locale";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("discovery");
  return { title: t("title") };
}

export default async function DiscoverPage() {
  const api = await serverApi();
  const locale = contentLocale(await getLocale());
  const result = await gated(() =>
    Promise.all([
      api.discovery.deck({ locale, limit: 8, exclude: [] }),
      api.discovery.me({ locale }),
      api.discovery.filters(),
    ]),
  );
  if (!result.ok) {
    return <GateScreen gate={result.gate} />;
  }
  const [deck, me, filters] = result.data;
  return <DiscoverScreen initial={deck} me={me} filter={filters.filter} />;
}
