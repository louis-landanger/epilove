import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { KitScreen } from "@/components/rencontre/chat/safety-kit";
import { GateScreen } from "@/components/rencontre/ui/states";
import { serverApi } from "@/lib/rencontre/api.server";
import { gated } from "@/lib/rencontre/gate";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("chat.safetyKit");
  return { title: t("pageTitle") };
}

/** The member's safety kit (IRL-03), opened from the check-in notification. */
export default async function SafetyKitPage({ params }: { params: Promise<{ shareId: string }> }) {
  const { shareId } = await params;
  if (!UUID.test(shareId)) {
    return <GateScreen gate="notfound" />;
  }
  const api = await serverApi();
  const result = await gated(() => api.dateSafety.kit({ shareId }));
  if (!result.ok || !result.data.kit) {
    return <GateScreen gate={result.ok ? "notfound" : result.gate} />;
  }
  return <KitScreen initial={result.data.kit} />;
}
