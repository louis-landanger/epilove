import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { MemberProfile } from "@/components/rencontre/discovery/member-profile";
import { GateScreen, NotFoundScreen } from "@/components/rencontre/ui/states";
import { serverApi } from "@/lib/rencontre/api.server";
import { gated } from "@/lib/rencontre/gate";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export async function generateMetadata(): Promise<Metadata> {
  // Never put a member's first name in the page title: it would end up in history and tab lists.
  const t = await getTranslations("discovery");
  return { title: t("title") };
}

export default async function MemberPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID.test(id)) {
    return <NotFoundScreen />;
  }
  const api = await serverApi();
  const result = await gated(() =>
    Promise.all([
      api.discovery.profile({ userId: id, locale: "fr" }),
      api.discovery.me({ locale: "fr" }).catch(() => null),
    ]),
  );
  if (!result.ok) {
    return <GateScreen gate={result.gate} />;
  }
  const [profile, me] = result.data;
  return <MemberProfile profile={profile} me={me} />;
}
