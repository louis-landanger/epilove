import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { MemberCard } from "@/components/member-card";
import { RevealIdentity } from "@/components/reveal-identity";
import { serverApi } from "@/lib/server/api";

export const metadata: Metadata = { title: "Membre" };

export default async function MemberPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const card = await (await serverApi()).admin.member({ userId: id }).catch(() => null);
  if (!card) {
    notFound();
  }
  return (
    <>
      <h1 className="font-display font-semibold text-4xl tracking-tight">{card.member.pseudonym}</h1>
      <MemberCard card={card} />
      <RevealIdentity userId={card.member.userId} />
    </>
  );
}
