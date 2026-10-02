import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { CrushScreen } from "@/components/rencontre/likes/crush-screen";
import { GateScreen } from "@/components/rencontre/ui/states";
import { serverApi } from "@/lib/rencontre/api.server";
import { gated } from "@/lib/rencontre/gate";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("likes.crush");
  return { title: t("title") };
}

export default async function CrushPage() {
  const api = await serverApi();
  const result = await gated(() =>
    Promise.all([api.discovery.crushes(), api.discovery.me({ locale: "fr" })]),
  );
  if (!result.ok) {
    return <GateScreen gate={result.gate} />;
  }
  const [list, me] = result.data;
  return <CrushScreen initial={list} me={me} />;
}
