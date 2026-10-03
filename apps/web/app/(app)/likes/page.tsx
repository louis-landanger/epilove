import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { LikesScreen } from "@/components/rencontre/likes/likes-screen";
import { GateScreen } from "@/components/rencontre/ui/states";
import { serverApi } from "@/lib/rencontre/api.server";
import { gated } from "@/lib/rencontre/gate";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("likes");
  return { title: t("title") };
}

export default async function LikesPage() {
  const api = await serverApi();
  const result = await gated(() =>
    Promise.all([api.discovery.likesReceived({ locale: "fr" }), api.discovery.me({ locale: "fr" })]),
  );
  if (!result.ok) {
    return <GateScreen gate={result.gate} />;
  }
  const [{ likes, quota }, me] = result.data;
  return <LikesScreen initialLikes={likes} initialQuota={quota} me={me} />;
}
