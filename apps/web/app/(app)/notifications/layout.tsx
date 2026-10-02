import type { ReactNode } from "react";
import { RencontreProviders } from "@/components/rencontre/providers";
import "@/components/rencontre/rencontre.css";

export default function NotificationsLayout({ children }: { children: ReactNode }) {
  return <RencontreProviders>{children}</RencontreProviders>;
}
