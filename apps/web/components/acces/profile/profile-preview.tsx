"use client";

import type { OwnPhoto, SongInfo } from "@epilove/contracts";
import { SCHOOLS, type SchoolSlug } from "@epilove/core";
import { Badge, SchoolChip } from "@epilove/ui";
import { BadgeCheck, ImageOff, ScanFace } from "lucide-react";
import { useTranslations } from "next-intl";
import { Fragment, type ReactNode } from "react";
import { AnthemCard } from "./anthem";

export interface ProfilePreviewData {
  readonly firstName: string;
  readonly age: number;
  readonly schoolSlug: string;
  readonly campusVerified: boolean;
  readonly photoVerified: boolean;
  readonly graduationYear: number;
  readonly program: string | null;
  readonly pronouns: string | null;
  readonly modes: readonly string[];
  readonly languages: readonly string[];
  readonly prompts: readonly { readonly question: string; readonly answer: string }[];
  readonly interests: readonly string[];
  readonly anthem: SongInfo | null;
  readonly photos: readonly OwnPhoto[];
}

/**
 * A profile as other members see it: photos interleaved with prompts
 * (docs/02-design.md). Photos being checked are flagged for their owner.
 */
export function ProfilePreview({ data }: { data: ProfilePreviewData }) {
  const t = useTranslations("profile");
  const school = SCHOOLS.find((item) => item.slug === data.schoolSlug);
  const visible = data.photos.filter((photo) => photo.stage === "processing" || photo.stage === "ready");
  const [hero, ...rest] = visible;

  const blocks: ReactNode[] = [];
  const maxBlocks = Math.max(rest.length, data.prompts.length);
  for (let index = 0; index < maxBlocks; index += 1) {
    const prompt = data.prompts[index];
    const photo = rest[index];
    blocks.push(
      <Fragment key={`block-${index}`}>
        {prompt ? <PromptCard question={prompt.question} answer={prompt.answer} /> : null}
        {index === 1 && data.interests.length > 0 ? <Interests labels={data.interests} /> : null}
        {photo ? <PhotoBlock photo={photo} /> : null}
      </Fragment>,
    );
  }

  return (
    <article className="flex flex-col gap-4" aria-label={data.firstName}>
      <div className="relative aspect-[4/5] overflow-hidden rounded-[2rem] bg-paper/5">
        {hero ? (
          <PhotoImage photo={hero} className="absolute inset-0" />
        ) : (
          <div className="absolute inset-0 grid place-items-center p-8 text-center text-paper/60">
            <div className="flex flex-col items-center gap-3">
              <ImageOff className="size-8" aria-hidden="true" />
              {t("noPhotos")}
            </div>
          </div>
        )}
        <div className="absolute inset-x-0 bottom-0 flex flex-col gap-3 bg-gradient-to-t from-ink via-ink/70 to-transparent p-6 pt-24">
          <h2 className="font-display font-semibold text-4xl tracking-tight">
            {data.firstName} <span className="font-normal text-paper/80">{data.age}</span>
          </h2>
          <div className="flex flex-wrap items-center gap-2">
            {school ? <SchoolChip school={school.slug as SchoolSlug} name={school.name} /> : null}
            <Badge>{t("classOf", { year: data.graduationYear })}</Badge>
            {data.photoVerified ? (
              <Badge tone="volt">
                <ScanFace className="size-3.5" aria-hidden="true" />
                {t("photoVerified")}
              </Badge>
            ) : null}
            {data.campusVerified ? (
              <Badge tone="volt">
                <BadgeCheck className="size-3.5" aria-hidden="true" />
                {t("campusVerified")}
              </Badge>
            ) : null}
            {data.pronouns ? <Badge>{data.pronouns}</Badge> : null}
          </div>
          {data.program ? <p className="text-paper/75 text-sm">{data.program}</p> : null}
        </div>
        {hero ? <StatusFlag photo={hero} /> : null}
      </div>
      {data.anthem ? <AnthemCard song={data.anthem} /> : null}
      {blocks}
      {data.prompts.length < 2 && data.interests.length > 0 ? <Interests labels={data.interests} /> : null}
      <dl className="grid gap-3 rounded-[2rem] border border-paper/10 bg-paper/[0.03] p-5 text-sm sm:grid-cols-2">
        <div className="flex flex-col gap-1">
          <dt className="font-mono text-paper/50 text-xs uppercase tracking-[0.18em]">{t("lookingFor")}</dt>
          <dd>{data.modes.map((mode) => t(`modes.${mode as "love" | "friends"}`)).join(" · ")}</dd>
        </div>
        {data.languages.length > 0 ? (
          <div className="flex flex-col gap-1">
            <dt className="font-mono text-paper/50 text-xs uppercase tracking-[0.18em]">{t("languages")}</dt>
            <dd>{data.languages.join(" · ")}</dd>
          </div>
        ) : null}
      </dl>
    </article>
  );
}

function PromptCard({ question, answer }: { question: string; answer: string }) {
  return (
    <figure className="flex flex-col gap-3 rounded-[2rem] border border-paper/10 bg-paper/[0.03] p-6">
      <figcaption className="text-paper/60 text-sm">{question}</figcaption>
      <blockquote className="whitespace-pre-line text-balance font-display font-semibold text-2xl leading-snug tracking-tight">
        {answer}
      </blockquote>
    </figure>
  );
}

function Interests({ labels }: { labels: readonly string[] }) {
  const t = useTranslations("profile");
  return (
    <section className="flex flex-col gap-3 rounded-[2rem] border border-paper/10 bg-paper/[0.03] p-6">
      <h3 className="font-mono text-paper/50 text-xs uppercase tracking-[0.18em]">{t("interests")}</h3>
      <ul className="flex flex-wrap gap-2">
        {labels.map((label) => (
          <li key={label} className="rounded-full border border-paper/15 px-3 py-1.5 text-sm">
            {label}
          </li>
        ))}
      </ul>
    </section>
  );
}

function PhotoBlock({ photo }: { photo: OwnPhoto }) {
  return (
    <div className="relative aspect-[4/5] overflow-hidden rounded-[2rem] bg-paper/5">
      <PhotoImage photo={photo} className="absolute inset-0" />
      <StatusFlag photo={photo} />
    </div>
  );
}

function PhotoImage({ photo, className }: { photo: OwnPhoto; className?: string }) {
  if (!photo.url) {
    return <div className={`size-full animate-pulse bg-paper/5 ${className ?? ""}`} aria-hidden="true" />;
  }
  return (
    // biome-ignore lint/performance/noImgElement: signed, expiring imgproxy URLs (already resized)
    <img src={photo.url} alt={photo.altText ?? ""} className={`size-full object-cover ${className ?? ""}`} />
  );
}

function StatusFlag({ photo }: { photo: OwnPhoto }) {
  const t = useTranslations("profile");
  if (photo.status === "approved") {
    return null;
  }
  return (
    <span
      className={`absolute top-4 left-4 rounded-full px-3 py-1 text-xs backdrop-blur ${
        photo.status === "rejected" ? "bg-danger text-ink" : "bg-ink/75 text-paper"
      }`}
    >
      {photo.status === "rejected" ? t("rejectedPhoto") : t("pendingPhoto")}
    </span>
  );
}
