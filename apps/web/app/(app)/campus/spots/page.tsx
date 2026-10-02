import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { SpotsScreen } from "@/components/rencontre/campus/spots-screen";
import { GateScreen } from "@/components/rencontre/ui/states";
import { serverApi } from "@/lib/rencontre/api.server";
import { gated } from "@/lib/rencontre/gate";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("spots");
  return { title: t("title") };
}

export default async function SpotsPage() {
  const api = await serverApi();
  const result = await gated(() => api.campusLife.spots({ locale: "fr" }));
  if (!result.ok) {
    return <GateScreen gate={result.gate} />;
  }
  return <SpotsScreen spots={result.data.spots} />;
}
