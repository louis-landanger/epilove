import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import { Conversation } from "@/components/rencontre/chat/conversation";
import { GateScreen } from "@/components/rencontre/ui/states";
import { serverApi } from "@/lib/rencontre/api.server";
import { gated } from "@/lib/rencontre/gate";
import { contentLocale } from "@/lib/rencontre/locale";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export async function generateMetadata(): Promise<Metadata> {
  // No first name in titles: they end up in history and tab lists.
  const t = await getTranslations("chat");
  return { title: t("title") };
}

export default async function ConversationPage({ params }: { params: Promise<{ matchId: string }> }) {
  const { matchId } = await params;
  if (!UUID.test(matchId)) {
    return <GateScreen gate="notfound" />;
  }
  const api = await serverApi();
  const locale = contentLocale(await getLocale());
  const result = await gated(() => api.messaging.thread({ matchId, locale }));
  if (!result.ok) {
    return <GateScreen gate={result.gate} />;
  }
  return <Conversation key={matchId} thread={result.data} />;
}
