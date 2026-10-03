import { ORPCError } from "@orpc/client";
import type { Metadata } from "next";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { FlashResult } from "@/components/rencontre/events/flash-screen";
import { GateScreen } from "@/components/rencontre/ui/states";
import { serverApi } from "@/lib/rencontre/api.server";
import { gated } from "@/lib/rencontre/gate";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("events.flash");
  // The code stays out of other sites' logs.
  return { title: t("title"), referrer: "no-referrer" };
}

/** Opened by scanning someone's Flash QR code with the phone's camera (IRL-04). */
export default async function FlashScanPage({
  params,
}: {
  params: Promise<{ eventId: string; code: string }>;
}) {
  const { eventId, code } = await params;
  if (!UUID.test(eventId)) {
    return <GateScreen gate="notfound" />;
  }
  const t = await getTranslations("events.flash");
  const api = await serverApi();
  let scan: Awaited<ReturnType<typeof api.events.flashScan>> | null = null;
  let error: string | null = null;
  const result = await gated(async () => {
    try {
      scan = await api.events.flashScan({ eventId, code: code.slice(0, 20) });
    } catch (failure) {
      if (failure instanceof ORPCError && failure.code === "BAD_REQUEST") {
        error = failure.message === "flash_closed" ? t("errors.flash_closed") : t("errors.expired");
        return;
      }
      throw failure;
    }
  });
  if (!result.ok) {
    return <GateScreen gate={result.gate} />;
  }
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col gap-6 px-4 pt-6 pb-10">
      <h1 className="font-display font-semibold text-3xl tracking-tight">{t("title")}</h1>
      {scan ? (
        <FlashResult result={scan} eventId={eventId} />
      ) : (
        <div role="alert" className="flex flex-col gap-3 rounded-3xl border border-paper/15 p-5">
          <p>{error}</p>
          <Link
            href={`/campus/evenements/${eventId}/flash`}
            className="self-start text-sm underline underline-offset-4"
          >
            {t("showMine")}
          </Link>
        </div>
      )}
    </main>
  );
}
