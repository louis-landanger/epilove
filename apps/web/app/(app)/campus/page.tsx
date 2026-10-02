import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { CampusHub } from "@/components/rencontre/campus/campus-hub";
import { GateScreen } from "@/components/rencontre/ui/states";
import { serverApi } from "@/lib/rencontre/api.server";
import { gated } from "@/lib/rencontre/gate";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("campus");
  return { title: t("title") };
}

export default async function CampusPage() {
  const api = await serverApi();
  const result = await gated(() => api.pact.current());
  if (!result.ok) {
    return <GateScreen gate={result.gate} />;
  }
  return <CampusHub pact={result.data} />;
}
