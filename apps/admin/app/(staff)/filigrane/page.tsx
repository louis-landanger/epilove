import type { Metadata } from "next";
import { WatermarkLookup } from "@/components/watermark-lookup";

export const metadata: Metadata = { title: "Filigrane" };

export default function WatermarkPage() {
  return (
    <>
      <div className="flex max-w-2xl flex-col gap-2">
        <h1 className="font-display font-semibold text-4xl tracking-tight">Retrouver une capture</h1>
        <p className="text-paper/70">
          Chaque photo affichée porte en filigrane le code de la personne qui la regarde. Saisis le code lu
          sur une capture partagée pour savoir de quel compte elle vient.
        </p>
      </div>
      <WatermarkLookup />
    </>
  );
}
