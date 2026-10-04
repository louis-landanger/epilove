"use client";

import type { Catalog, OwnProfile } from "@atomes/contracts";
import { Button, Dialog, RadioGroupField, SwitchField } from "@atomes/ui";
import { Download, Share2, Sparkles } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useMemo, useState } from "react";

/** PRO-08: the member picks what the card shows, then downloads or shares the image. */
export function ShareCard({ profile, catalog }: { profile: OwnProfile; catalog: Catalog }) {
  const t = useTranslations("profile.share");
  const locale = useLocale() as "fr" | "en";
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(true);
  const [school, setSchool] = useState(true);
  const [interests, setInterests] = useState(false);
  const [song, setSong] = useState(false);
  const [prompt, setPrompt] = useState<string>(profile.promptAnswers[0]?.promptId ?? "none");

  const src = useMemo(() => {
    const query = new URLSearchParams({
      prenom: name ? "1" : "0",
      ecole: school ? "1" : "0",
      interets: interests ? "1" : "0",
      son: song ? "1" : "0",
      prompt,
    });
    return `/profil/carte?${query}`;
  }, [name, school, interests, song, prompt]);

  async function share() {
    const blob = await (await fetch(src)).blob();
    const file = new File([blob], "ma-carte-atomes.png", { type: "image/png" });
    if (navigator.canShare?.({ files: [file] })) {
      await navigator.share({ files: [file] }).catch(() => undefined);
    }
  }

  const questions = new Map(catalog.prompts.map((item) => [item.id, item.text[locale]]));
  const canShareFiles = typeof navigator !== "undefined" && "canShare" in navigator;

  return (
    <>
      <Button
        variant="secondary"
        size="sm"
        onClick={() => setOpen(true)}
        leadingIcon={<Sparkles className="size-4" aria-hidden="true" />}
      >
        {t("open")}
      </Button>
      <Dialog
        open={open}
        onOpenChange={setOpen}
        title={t("title")}
        description={t("lead")}
        className="sm:w-[min(52rem,calc(100vw-2rem))]"
        footer={
          <div className="flex flex-col gap-3 sm:flex-row sm:justify-end">
            {canShareFiles ? (
              <Button
                variant="secondary"
                onClick={() => void share()}
                leadingIcon={<Share2 className="size-4" aria-hidden="true" />}
              >
                {t("share")}
              </Button>
            ) : null}
            <a
              href={src}
              download="ma-carte-atomes.png"
              className="inline-flex h-12 items-center justify-center gap-2 rounded-2xl bg-plasma px-5 font-semibold text-ink hover:brightness-110"
            >
              <Download className="size-4" aria-hidden="true" />
              {t("download")}
            </a>
          </div>
        }
      >
        <div className="grid gap-6 sm:grid-cols-[minmax(0,16rem)_1fr]">
          {/* biome-ignore lint/performance/noImgElement: generated on demand for the signed-in member */}
          <img
            src={src}
            alt={t("preview")}
            width={1080}
            height={1350}
            className="h-auto w-full rounded-3xl bg-paper/5"
          />
          <div className="flex flex-col gap-4">
            <SwitchField label={t("name")} checked={name} onCheckedChange={setName} />
            <SwitchField label={t("school")} checked={school} onCheckedChange={setSchool} />
            <SwitchField label={t("interests")} checked={interests} onCheckedChange={setInterests} />
            {profile.anthem ? (
              <SwitchField label={t("song")} checked={song} onCheckedChange={setSong} />
            ) : null}
            {profile.promptAnswers.length > 0 ? (
              <RadioGroupField
                label={t("prompt")}
                options={[
                  { value: "none", label: t("noPrompt") },
                  ...profile.promptAnswers.map((answer) => ({
                    value: answer.promptId,
                    label: questions.get(answer.promptId) ?? answer.text,
                  })),
                ]}
                value={prompt}
                onChange={setPrompt}
              />
            ) : null}
          </div>
        </div>
      </Dialog>
    </>
  );
}
