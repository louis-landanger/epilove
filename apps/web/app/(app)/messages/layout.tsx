import type { ReactNode } from "react";
import { MessagesShell } from "@/components/rencontre/chat/messages-shell";
import { RencontreProviders } from "@/components/rencontre/providers";
import { GateScreen } from "@/components/rencontre/ui/states";
import { serverApi } from "@/lib/rencontre/api.server";
import { gated } from "@/lib/rencontre/gate";
import "@/components/rencontre/rencontre.css";

export default async function MessagesLayout({ children }: { children: ReactNode }) {
  const api = await serverApi();
  const result = await gated(() => api.matches.list({ locale: "fr" }));
  if (!result.ok) {
    return <GateScreen gate={result.gate} />;
  }
  return (
    <RencontreProviders>
      <MessagesShell initial={result.data.matches}>{children}</MessagesShell>
    </RencontreProviders>
  );
}
