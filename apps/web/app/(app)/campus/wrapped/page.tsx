import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { WrappedScreen } from "@/components/rencontre/campus/wrapped-screen";
import { GateScreen } from "@/components/rencontre/ui/states";
import { serverApi } from "@/lib/rencontre/api.server";
import { gated } from "@/lib/rencontre/gate";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("campus.wrapped");
  return { title: t("title") };
}

export default async function WrappedPage() {
  const api = await serverApi();
  const result = await gated(() => api.community.wrapped());
  if (!result.ok) {
    return <GateScreen gate={result.gate} />;
  }
  return <WrappedScreen wrapped={result.data} />;
}
