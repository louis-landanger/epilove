import type { Metadata } from "next";
import { PhotoQueue } from "@/components/photo-queue";
import { serverApi } from "@/lib/server/api";

export const metadata: Metadata = { title: "Photos" };

export default async function PhotosPage() {
  const queue = await (await serverApi()).admin.photoQueue({ limit: 50 });
  return (
    <>
      <h1 className="font-display font-semibold text-4xl tracking-tight">Photos à vérifier</h1>
      <PhotoQueue initial={queue.photos} total={queue.total} />
    </>
  );
}
