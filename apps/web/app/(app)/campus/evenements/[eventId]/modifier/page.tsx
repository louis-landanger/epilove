import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import { EventForm } from "@/components/rencontre/events/event-form";
import { GateScreen } from "@/components/rencontre/ui/states";
import { serverApi } from "@/lib/rencontre/api.server";
import { gated } from "@/lib/rencontre/gate";
import { contentLocale } from "@/lib/rencontre/locale";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("events.form");
  return { title: t("editTitle") };
}

export default async function EditEventPage({ params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params;
  if (!UUID.test(eventId)) {
    return <GateScreen gate="notfound" />;
  }
  const api = await serverApi();
  const locale = contentLocale(await getLocale());
  const result = await gated(async () => {
    const [detail, spots] = await Promise.all([
      api.events.get({ eventId, locale }),
      api.campusLife.spots({ locale }),
    ]);
    return { event: detail.event, spots: spots.spots };
  });
  if (!result.ok) {
    return <GateScreen gate={result.gate} />;
  }
  // Only the organizer edits a published event; anybody else lands on "not found".
  if (!result.data.event.organizing || result.data.event.status !== "published") {
    return <GateScreen gate="notfound" />;
  }
  return <EventForm spots={result.data.spots} event={result.data.event} />;
}
