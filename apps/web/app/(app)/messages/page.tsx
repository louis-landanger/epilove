import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("chat");
  return { title: t("title") };
}

/** Right pane on desktop when no conversation is open (the list itself lives in the layout). */
export default async function MessagesPage() {
  const t = await getTranslations("chat");
  return (
    <div className="flex flex-1 items-center justify-center p-8 text-paper/50">
      <p>{t("selectConversation")}</p>
    </div>
  );
}
