import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import { LikesScreen } from "@/components/rencontre/likes/likes-screen";
import { GateScreen } from "@/components/rencontre/ui/states";
import { serverApi } from "@/lib/rencontre/api.server";
import { gated } from "@/lib/rencontre/gate";
import { contentLocale } from "@/lib/rencontre/locale";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("likes");
  return { title: t("title") };
}

export default async function LikesPage() {
  const api = await serverApi();
  const locale = contentLocale(await getLocale());
  const result = await gated(() =>
    Promise.all([api.discovery.likesReceived({ locale }), api.discovery.me({ locale })]),
  );
  if (!result.ok) {
    return <GateScreen gate={result.gate} />;
  }
  const [{ likes, quota }, me] = result.data;
  return <LikesScreen initialLikes={likes} initialQuota={quota} me={me} />;
}
