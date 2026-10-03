import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { PactScreen } from "@/components/rencontre/pact/pact-screen";
import { GateScreen } from "@/components/rencontre/ui/states";
import { serverApi } from "@/lib/rencontre/api.server";
import { gated } from "@/lib/rencontre/gate";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("pact");
  return { title: t("title") };
}

export default async function PactPage() {
  const api = await serverApi();
  const result = await gated(() => api.pact.current());
  if (!result.ok) {
    return <GateScreen gate={result.gate} />;
  }
  return <PactScreen initial={result.data} />;
}
