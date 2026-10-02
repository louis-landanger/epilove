import type { ReactNode } from "react";
import { RencontreProviders } from "@/components/rencontre/providers";

export default function CampusLayout({ children }: { children: ReactNode }) {
  return <RencontreProviders>{children}</RencontreProviders>;
}
