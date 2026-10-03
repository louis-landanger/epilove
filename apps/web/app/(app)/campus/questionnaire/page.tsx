import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { Questionnaire } from "@/components/rencontre/questionnaire/questionnaire";
import { GateScreen } from "@/components/rencontre/ui/states";
import { serverApi } from "@/lib/rencontre/api.server";
import { gated } from "@/lib/rencontre/gate";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("questionnaire");
  return { title: t("title") };
}

export default async function QuestionnairePage() {
  const api = await serverApi();
  const result = await gated(() => api.questionnaire.get({ locale: "fr" }));
  if (!result.ok) {
    return <GateScreen gate={result.gate} />;
  }
  return <Questionnaire questions={result.data.questions} initialAnswers={result.data.answers} />;
}
