import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { FlashScreen } from "@/components/rencontre/events/flash-screen";
import { GateScreen } from "@/components/rencontre/ui/states";
import { serverApi } from "@/lib/rencontre/api.server";
import { gated } from "@/lib/rencontre/gate";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("events.flash");
  return { title: t("title") };
}

export default async function FlashPage({ params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params;
  if (!UUID.test(eventId)) {
    return <GateScreen gate="notfound" />;
  }
  const api = await serverApi();
  const result = await gated(() => api.events.get({ eventId, locale: "fr" }));
  if (!result.ok) {
    return <GateScreen gate={result.gate} />;
  }
  return <FlashScreen eventId={eventId} title={result.data.event.title} />;
}
