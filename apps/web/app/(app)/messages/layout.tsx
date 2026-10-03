import { getLocale } from "next-intl/server";
import type { ReactNode } from "react";
import { MessagesShell } from "@/components/rencontre/chat/messages-shell";
import { GateScreen } from "@/components/rencontre/ui/states";
import { serverApi } from "@/lib/rencontre/api.server";
import { gated } from "@/lib/rencontre/gate";
import { contentLocale } from "@/lib/rencontre/locale";

export default async function MessagesLayout({ children }: { children: ReactNode }) {
  const api = await serverApi();
  const locale = contentLocale(await getLocale());
  const result = await gated(() => api.matches.list({ locale }));
  if (!result.ok) {
    return <GateScreen gate={result.gate} />;
  }
  return <MessagesShell initial={result.data.matches}>{children}</MessagesShell>;
}
