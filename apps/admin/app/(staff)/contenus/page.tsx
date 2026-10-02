import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { CatalogEditor } from "@/components/catalog-editor";
import { getStaffViewer, serverApi } from "@/lib/server/api";

export const metadata: Metadata = { title: "Contenus" };

export default async function ContentPage() {
  const viewer = await getStaffViewer();
  if (viewer?.role !== "admin") {
    redirect("/");
  }
  const catalog = await (await serverApi()).admin.catalog();
  return (
    <>
      <h1 className="font-display font-semibold text-4xl tracking-tight">Contenus</h1>
      <CatalogEditor initial={catalog} />
    </>
  );
}
