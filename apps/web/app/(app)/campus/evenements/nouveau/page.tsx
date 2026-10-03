import type { Metadata } from "next";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { EventForm } from "@/components/rencontre/events/event-form";
import { GateScreen } from "@/components/rencontre/ui/states";
import { serverApi } from "@/lib/rencontre/api.server";
import { gated } from "@/lib/rencontre/gate";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("events.form");
  return { title: t("createTitle") };
}

export default async function NewEventPage() {
  const api = await serverApi();
  const result = await gated(async () => {
    const [list, spots] = await Promise.all([
      api.events.list({ filter: "mine" }),
      api.campusLife.spots({ locale: "fr" }),
    ]);
    return { canOrganize: list.canOrganize, spots: spots.spots };
  });
  if (!result.ok) {
    return <GateScreen gate={result.gate} />;
  }
  if (!result.data.canOrganize) {
    const t = await getTranslations("events");
    return (
      <main className="mx-auto flex min-h-[60dvh] max-w-md flex-col items-center justify-center gap-4 px-4 text-center">
        <h1 className="font-display font-semibold text-2xl">{t("form.createTitle")}</h1>
        <p className="text-paper/75">{t("form.notAllowed")}</p>
        <Link href="/campus/evenements" className="rounded-full bg-paper px-5 py-2.5 font-semibold text-ink">
          {t("title")}
        </Link>
      </main>
    );
  }
  return <EventForm spots={result.data.spots} />;
}
