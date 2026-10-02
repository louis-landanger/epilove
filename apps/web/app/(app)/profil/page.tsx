import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { ProfileScreen } from "@/components/acces/profile/profile-screen";
import { serverApi } from "@/lib/server/api-app";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("profile");
  return { title: t("metaTitle") };
}

export default async function ProfilePage() {
  const api = await serverApi();
  const [profile, photos, catalog] = await Promise.all([
    api.profile.me(),
    api.media.list(),
    api.profile.catalog(),
  ]);
  return <ProfileScreen initialProfile={profile} initialPhotos={photos.photos} catalog={catalog} />;
}
