import { WatermarkProvider } from "@atomes/ui";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { StaffNav } from "@/components/staff-nav";
import { getStaffViewer, serverApi } from "@/lib/server/api";

/** Staff only: members who sign in here see a refusal, never the queues. */
export default async function StaffLayout({ children }: { children: ReactNode }) {
  const viewer = await getStaffViewer();
  if (!viewer) {
    redirect("/connexion");
  }
  if (viewer.role !== "moderator" && viewer.role !== "admin") {
    return (
      <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-4 px-4">
        <h1 className="font-display font-semibold text-3xl">Accès réservé</h1>
        <p className="text-paper/70">Ce compte n'a pas accès à la modération.</p>
      </main>
    );
  }
  const me = await (await serverApi()).admin.me();
  return (
    // Member photos shown to staff carry the staff member's own code (SAF-12).
    <WatermarkProvider code={me.watermark}>
      <div className="min-h-dvh lg:pl-60">
        <StaffNav role={me.role} pseudonym={me.pseudonym} />
        <main id="contenu" className="mx-auto flex w-full max-w-5xl flex-col gap-8 px-4 py-8 lg:px-10">
          {children}
        </main>
      </div>
    </WatermarkProvider>
  );
}
