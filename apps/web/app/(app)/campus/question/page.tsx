import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { WeeklyScreen } from "@/components/rencontre/campus/weekly-screen";
import { GateScreen } from "@/components/rencontre/ui/states";
import { serverApi } from "@/lib/rencontre/api.server";
import { gated } from "@/lib/rencontre/gate";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("campus.weekly");
  return { title: t("title") };
}

export default async function WeeklyQuestionPage() {
  const api = await serverApi();
  const result = await gated(() => api.community.weekly({ locale: "fr" }));
  if (!result.ok) {
    return <GateScreen gate={result.gate} />;
  }
  return <WeeklyScreen initial={result.data} />;
}
