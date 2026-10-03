import type { MemberCard, ProfileView } from "@epilove/contracts";
import { ViewerWatermark } from "@epilove/ui";
import { getTranslations } from "next-intl/server";
import { Fragment, ViewTransition } from "react";
import { VoicePlayer } from "@/components/acces/profile/voice/voice-player";
import { MemberBadges } from "./badges";
import { CompatibilityPanel } from "./compatibility";
import {
  ProfileActions,
  ProfileHeaderActions,
  ProfileInteractions,
  ProfileLikeButton,
} from "./profile-actions";
import { SchoolBadge, schoolFoil } from "./school";

const INTENTION_KEYS = ["relationship", "see_what_happens", "friendship"] as const;
type Intention = (typeof INTENTION_KEYS)[number];
const isIntention = (value: string): value is Intention =>
  (INTENTION_KEYS as readonly string[]).includes(value);

const LANGUAGE_NAMES: Record<string, string> = {
  fr: "Français",
  en: "English",
  es: "Español",
  ar: "العربية",
  de: "Deutsch",
  it: "Italiano",
  pt: "Português",
  zh: "中文",
};

/**
 * Full profile of another member: photos full-frame, prompts as lab sheets,
 * explained compatibility, interests (shared ones highlighted), and the
 * actions allowed by the access policies.
 */
export async function MemberProfile({ profile, me }: { profile: ProfileView; me: MemberCard | null }) {
  const t = await getTranslations("matches.profile");
  const intentions = await getTranslations("discovery.filtersDrawer.intention");
  const { card } = profile;
  const [firstPhoto, ...otherPhotos] = card.photos;

  // Interleave photos and prompts, Hinge-style, so that the profile reads like a story.
  const blocks: ({ kind: "photo"; index: number } | { kind: "prompt"; index: number })[] = [];
  for (let i = 0; i < Math.max(otherPhotos.length, card.prompts.length); i++) {
    if (card.prompts[i]) {
      blocks.push({ kind: "prompt", index: i });
    }
    if (otherPhotos[i]) {
      blocks.push({ kind: "photo", index: i });
    }
  }

  return (
    <ProfileInteractions profile={profile} me={me}>
      <main data-immersive className="mx-auto flex min-h-dvh w-full max-w-xl flex-col pb-32">
        <div className="relative aspect-[4/5] w-full overflow-hidden sm:mt-6 sm:rounded-[28px]">
          {firstPhoto && (
            <ViewTransition name={`member-photo-${card.userId}`} share="member-photo" default="none">
              {/* biome-ignore lint/performance/noImgElement: signed imgproxy URL. */}
              <img
                src={firstPhoto.url}
                alt={firstPhoto.alt ?? ""}
                width={firstPhoto.width ?? 640}
                height={firstPhoto.height ?? 800}
                className="size-full object-cover"
              />
            </ViewTransition>
          )}
          {/* SAF-12: the viewer's code over every photo of someone else. */}
          {firstPhoto && profile.via !== "self" && <ViewerWatermark />}
          <span aria-hidden="true" className="foil" data-foil={schoolFoil(card.school.slug)} />
          <div className="absolute inset-x-0 top-0 flex items-center justify-between p-4">
            <ProfileHeaderActions
              userId={card.userId}
              name={card.firstName}
              matchId={profile.matchId}
              backLabel={t("back")}
            />
          </div>
          {firstPhoto && profile.canLike && (
            <div className="absolute right-4 bottom-4">
              <ProfileLikeButton
                profile={profile}
                content={{ type: "photo", id: firstPhoto.id, url: firstPhoto.url }}
              />
            </div>
          )}
        </div>

        <div className="flex flex-col gap-6 px-4 pt-6">
          <header className="flex flex-col gap-3">
            {profile.likedYou && profile.via !== "match" && (
              <p className="w-fit rounded-full bg-plasma/15 px-3 py-1 text-plasma text-sm">
                {t("likedYou", { name: card.firstName })}
              </p>
            )}
            <h1 className="font-display font-semibold text-4xl tracking-tight">
              {card.firstName}
              <span className="font-normal text-paper/70">, {card.age}</span>
            </h1>
            <div className="flex flex-wrap items-center gap-2 text-paper/70 text-sm">
              <SchoolBadge slug={card.school.slug} name={card.school.name} />
              {card.pronouns && <span>{card.pronouns}</span>}
              <span className="font-mono">{t("year", { year: card.graduationYear })}</span>
              {card.program && <span>· {card.program}</span>}
            </div>
            <MemberBadges badges={card.badges} />
          </header>

          <CompatibilityPanel compatibility={card.compatibility} />

          {blocks.map((block) => {
            if (block.kind === "prompt") {
              const prompt = card.prompts[block.index];
              if (!prompt) {
                return null;
              }
              return (
                <figure
                  key={prompt.id}
                  className="relative rounded-3xl border border-paper/10 bg-paper/[0.04] p-5 pr-16"
                >
                  <figcaption className="font-mono text-paper/60 text-xs uppercase tracking-wider">
                    {prompt.question}
                  </figcaption>
                  <blockquote className="mt-2 font-serif text-2xl italic leading-snug">
                    {prompt.answer}
                  </blockquote>
                  {/* PRO-06: the recorded answer; the text above is its transcript. */}
                  {prompt.voice && (
                    <VoicePlayer
                      src={prompt.voice.url}
                      peaks={prompt.voice.peaks}
                      durationMs={prompt.voice.durationMs}
                      className="mt-4"
                    />
                  )}
                  {profile.canLike && (
                    <div className="absolute top-1/2 right-3 -translate-y-1/2">
                      <ProfileLikeButton
                        profile={profile}
                        small
                        content={{
                          type: "prompt",
                          id: prompt.id,
                          question: prompt.question,
                          answer: prompt.answer,
                        }}
                      />
                    </div>
                  )}
                </figure>
              );
            }
            const photo = otherPhotos[block.index];
            if (!photo) {
              return null;
            }
            return (
              <Fragment key={photo.id}>
                <div className="relative aspect-[4/5] overflow-hidden rounded-3xl">
                  {/* biome-ignore lint/performance/noImgElement: signed imgproxy URL. */}
                  <img
                    src={photo.url}
                    alt={photo.alt ?? ""}
                    loading="lazy"
                    width={photo.width ?? 640}
                    height={photo.height ?? 800}
                    className="size-full object-cover"
                  />
                  {profile.via !== "self" && <ViewerWatermark />}
                  {profile.canLike && (
                    <div className="absolute right-3 bottom-3">
                      <ProfileLikeButton
                        profile={profile}
                        content={{ type: "photo", id: photo.id, url: photo.url }}
                      />
                    </div>
                  )}
                </div>
              </Fragment>
            );
          })}

          <section
            aria-labelledby="about"
            className="flex flex-col gap-4 rounded-3xl border border-paper/10 p-5"
          >
            <h2 id="about" className="font-semibold">
              {t("about")}
            </h2>
            {card.intentions.length > 0 && (
              <p className="text-sm">
                <span className="text-paper/60">{t("intentions")} : </span>
                {card.intentions
                  .filter(isIntention)
                  .map((i) => intentions(i))
                  .join(" · ")}
              </p>
            )}
            {card.languages.length > 0 && (
              <p className="text-sm">
                <span className="text-paper/60">{t("languages")} : </span>
                {card.languages.map((code) => LANGUAGE_NAMES[code] ?? code).join(" · ")}
              </p>
            )}
            {card.interests.length > 0 && (
              <div className="flex flex-col gap-2">
                <h3 className="text-paper/60 text-sm">{t("interests")}</h3>
                <ul className="flex flex-wrap gap-2">
                  {card.interests.map((interest) => (
                    <li
                      key={interest.id}
                      className={`rounded-full border px-3 py-1.5 text-sm ${
                        interest.shared ? "border-volt bg-volt/10 text-volt" : "border-paper/15"
                      }`}
                    >
                      {interest.label}
                      {interest.shared && <span className="sr-only"> ({t("sharedInterest")})</span>}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </section>
        </div>

        <ProfileActions profile={profile} />
      </main>
    </ProfileInteractions>
  );
}
