import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { CrossSchoolScreen } from "@/components/rencontre/campus/cross-school-screen";
import { GateScreen } from "@/components/rencontre/ui/states";
import { serverApi } from "@/lib/rencontre/api.server";
import { gated } from "@/lib/rencontre/gate";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("campus.crossSchool");
  return { title: t("title") };
}

export default async function CrossSchoolPage() {
  const api = await serverApi();
  const result = await gated(() => api.community.crossSchool());
  if (!result.ok) {
    return <GateScreen gate={result.gate} />;
  }
  return <CrossSchoolScreen index={result.data} />;
}
