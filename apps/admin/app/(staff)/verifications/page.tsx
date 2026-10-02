import type { Metadata } from "next";
import { VerificationQueue } from "@/components/verification-queue";
import { serverApi } from "@/lib/server/api";

export const metadata: Metadata = { title: "Vérifications photo" };

export default async function VerificationsPage() {
  const queue = await (await serverApi()).admin.verificationQueue();
  return (
    <>
      <h1 className="font-display font-semibold text-4xl tracking-tight">Vérifications photo</h1>
      <VerificationQueue initial={queue.verifications} total={queue.total} />
    </>
  );
}
