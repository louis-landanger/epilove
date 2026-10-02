import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { DiscoverScreen } from "@/components/rencontre/discovery/discover-screen";
import { GateScreen } from "@/components/rencontre/ui/states";
import { serverApi } from "@/lib/rencontre/api.server";
import { gated } from "@/lib/rencontre/gate";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("discovery");
  return { title: t("title") };
}

export default async function DiscoverPage() {
  const api = await serverApi();
  const result = await gated(() =>
    Promise.all([
      api.discovery.deck({ locale: "fr", limit: 8, exclude: [] }),
      api.discovery.me({ locale: "fr" }),
      api.discovery.filters(),
    ]),
  );
  if (!result.ok) {
    return <GateScreen gate={result.gate} />;
  }
  const [deck, me, filters] = result.data;
  return <DiscoverScreen initial={deck} me={me} filter={filters.filter} />;
}
