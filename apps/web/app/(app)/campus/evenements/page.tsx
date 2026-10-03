import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { EventsScreen } from "@/components/rencontre/events/events-screen";
import { GateScreen } from "@/components/rencontre/ui/states";
import { serverApi } from "@/lib/rencontre/api.server";
import { gated } from "@/lib/rencontre/gate";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("events");
  return { title: t("title") };
}

export default async function EventsPage({ searchParams }: { searchParams: Promise<{ filtre?: string }> }) {
  const filter = (await searchParams).filtre === "mes" ? "mine" : "upcoming";
  const api = await serverApi();
  const result = await gated(() => api.events.list({ filter }));
  if (!result.ok) {
    return <GateScreen gate={result.gate} />;
  }
  return <EventsScreen events={result.data.events} filter={filter} canOrganize={result.data.canOrganize} />;
}
