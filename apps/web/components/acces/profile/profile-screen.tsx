"use client";

import type { Catalog, OwnPhoto, OwnProfile } from "@epilove/contracts";
import {
  FIRST_NAME_MAX_LENGTH,
  GENDERS,
  type Gender,
  INTENTIONS,
  type Intention,
  LANGUAGES,
  type Language,
  MAX_INTERESTS,
  MAX_LANGUAGES,
  MIN_INTERESTS,
  PROGRAM_MAX_LENGTH,
  PRONOUNS_MAX_LENGTH,
} from "@epilove/core";
import { Button, ChoiceGroup, Tabs, TextField, useToast } from "@epilove/ui";
import { LifeBuoy, Lock, Settings } from "lucide-react";
import type { Route } from "next";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { type FormEvent, type ReactNode, useCallback, useMemo, useRef, useState } from "react";
import { api, errorCode, errorData } from "../api-client";
import { PhotoManager } from "../media/photo-manager";
import { AnthemPicker } from "./anthem";
import { CompletenessGauge } from "./completeness-gauge";
import { InterestsPicker } from "./interests-picker";
import { ProfilePreview, type ProfilePreviewData } from "./profile-preview";
import { invalidSlots, PromptAnswersEditor, type PromptSlot, promptSlots } from "./prompt-answers-editor";
import { ShareCard } from "./share-card";

export interface ProfileScreenProps {
  readonly initialProfile: OwnProfile;
  readonly initialPhotos: readonly OwnPhoto[];
  readonly catalog: Catalog;
}

function languageName(locale: string, code: string) {
  try {
    const name = new Intl.DisplayNames([locale], { type: "language" }).of(code) ?? code;
    return name.charAt(0).toLocaleUpperCase(locale) + name.slice(1);
  } catch {
    return code;
  }
}

/** My profile (PRO-01 to PRO-05): preview as others see it, and direct editing. */
export function ProfileScreen({ initialProfile, initialPhotos, catalog }: ProfileScreenProps) {
  const t = useTranslations("profile");
  const locale = useLocale() as "fr" | "en";
  const [profile, setProfile] = useState(initialProfile);
  const [photos, setPhotos] = useState<readonly OwnPhoto[]>(initialPhotos);
  const photoSignature = useRef(signatureOf(initialPhotos));

  const onPhotosChange = useCallback((next: readonly OwnPhoto[]) => {
    setPhotos(next);
    const signature = signatureOf(next);
    if (signature !== photoSignature.current) {
      photoSignature.current = signature;
      void api()
        .profile.me()
        .then(setProfile)
        .catch(() => undefined);
    }
  }, []);

  const preview = useMemo<ProfilePreviewData>(() => {
    const prompts = new Map(catalog.prompts.map((prompt) => [prompt.id, prompt.text[locale]]));
    const interests = new Map(catalog.interests.map((item) => [item.id, item.label[locale]]));
    return {
      firstName: profile.firstName,
      age: profile.age,
      schoolSlug: profile.schoolSlug,
      graduationYear: profile.graduationYear,
      program: profile.program,
      pronouns: profile.pronouns,
      modes: profile.modes,
      languages: profile.languages.map((code) => languageName(locale, code)),
      prompts: profile.promptAnswers.map((answer) => ({
        question: prompts.get(answer.promptId) ?? "",
        answer: answer.text,
      })),
      interests: profile.interestIds.flatMap((id) => interests.get(id) ?? []),
      anthem: profile.anthem,
      photos,
    };
  }, [profile, photos, catalog, locale]);

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-4 py-8 sm:py-12">
      <header className="flex items-center justify-between gap-4">
        <h1 className="font-display font-semibold text-4xl tracking-tight">{t("title")}</h1>
        <nav className="flex gap-1">
          <IconLink href={"/reglages" as Route} label={t("links.settings")}>
            <Settings className="size-5" aria-hidden="true" />
          </IconLink>
          <IconLink href={"/aide" as Route} label={t("links.help")}>
            <LifeBuoy className="size-5" aria-hidden="true" />
          </IconLink>
        </nav>
      </header>
      <CompletenessGauge completeness={profile.completeness} />
      <ShareCard profile={profile} catalog={catalog} />
      <Tabs
        label={t("tabs.label")}
        defaultValue="preview"
        items={[
          {
            value: "preview",
            label: t("tabs.preview"),
            content: (
              <div className="flex flex-col gap-4">
                <p className="text-paper/60 text-sm">{t("previewNote")}</p>
                <ProfilePreview data={preview} />
              </div>
            ),
          },
          {
            value: "edit",
            label: t("tabs.edit"),
            content: (
              <div className="flex flex-col gap-10">
                <Section title={t("sections.photos")}>
                  <PhotoManager
                    altTextEditable
                    initialPhotos={initialPhotos}
                    onPhotosChange={onPhotosChange}
                  />
                </Section>
                <Section title={t("sections.basics")}>
                  <BasicsForm profile={profile} onSaved={setProfile} />
                </Section>
                <Section title={t("sections.prompts")}>
                  <PromptsForm profile={profile} catalog={catalog} onSaved={setProfile} />
                </Section>
                <Section title={t("sections.interests")}>
                  <InterestsForm profile={profile} catalog={catalog} onSaved={setProfile} />
                </Section>
                <Section title={t("sections.anthem")}>
                  <AnthemPicker current={profile.anthem} onSaved={setProfile} />
                </Section>
              </div>
            ),
          },
        ]}
      />
    </main>
  );
}

function signatureOf(photos: readonly OwnPhoto[]) {
  return photos
    .map((photo) => `${photo.id}:${photo.stage}:${photo.status}:${photo.altText ? 1 : 0}`)
    .join("|");
}

function IconLink({ href, label, children }: { href: Route; label: string; children: ReactNode }) {
  return (
    <Link
      href={href}
      aria-label={label}
      title={label}
      className="inline-flex size-11 items-center justify-center rounded-full text-paper/70 transition-colors hover:bg-paper/10 hover:text-paper focus-visible:outline-2 focus-visible:outline-volt"
    >
      {children}
    </Link>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  const id = `section-${title.toLowerCase().replaceAll(/\W+/g, "-")}`;
  return (
    <section aria-labelledby={id} className="flex flex-col gap-4">
      <h2 id={id} className="font-display font-semibold text-2xl tracking-tight">
        {title}
      </h2>
      {children}
    </section>
  );
}

function useSaver(onSaved: (profile: OwnProfile) => void) {
  const t = useTranslations("profile");
  const toast = useToast();
  const [pending, setPending] = useState(false);
  const [field, setField] = useState<string | null>(null);

  const run = useCallback(
    async (call: () => Promise<OwnProfile>) => {
      setPending(true);
      setField(null);
      try {
        onSaved(await call());
        toast.success(t("saved"));
        return true;
      } catch (error) {
        if (errorCode(error) === "INVALID_VALUE") {
          setField(errorData<{ field: string }>(error)?.field ?? null);
        } else {
          toast.error(t("errors.generic"));
        }
        return false;
      } finally {
        setPending(false);
      }
    },
    [onSaved, toast, t],
  );

  return { run, pending, field };
}

function SaveBar({ dirty, pending }: { dirty: boolean; pending: boolean }) {
  const t = useTranslations("profile");
  return (
    <div className="flex items-center justify-end gap-4">
      {dirty ? <span className="text-paper/55 text-sm">{t("unsaved")}</span> : null}
      <Button type="submit" loading={pending} disabled={!dirty}>
        {t("save")}
      </Button>
    </div>
  );
}

function BasicsForm({ profile, onSaved }: { profile: OwnProfile; onSaved: (profile: OwnProfile) => void }) {
  const t = useTranslations("profile");
  const tOnboarding = useTranslations("onboarding");
  const locale = useLocale();
  const initial = useMemo(
    () => ({
      firstName: profile.firstName,
      gender: profile.gender,
      pronouns: profile.pronouns ?? "",
      program: profile.program ?? "",
      graduationYear: String(profile.graduationYear),
      languages: profile.languages,
      intentions: profile.intentions,
    }),
    [profile],
  );
  const [values, setValues] = useState(initial);
  const { run, pending, field } = useSaver(onSaved);
  const dirty = JSON.stringify(values) !== JSON.stringify(initial);
  const years = Array.from(
    { length: profile.graduationYears.max - profile.graduationYears.min + 1 },
    (_, index) => String(profile.graduationYears.min + index),
  );
  const set = <K extends keyof typeof values>(key: K, value: (typeof values)[K]) =>
    setValues((current) => ({ ...current, [key]: value }));

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await run(() =>
      api().profile.update({
        firstName: values.firstName,
        gender: values.gender,
        pronouns: values.pronouns.trim() || null,
        program: values.program.trim() || null,
        graduationYear: Number(values.graduationYear),
        languages: [...values.languages],
        intentions: [...values.intentions],
      }),
    );
  }

  return (
    <form onSubmit={(event) => void submit(event)} className="flex flex-col gap-6" noValidate>
      <TextField
        label={t("fields.firstName")}
        autoComplete="given-name"
        maxLength={FIRST_NAME_MAX_LENGTH}
        value={values.firstName}
        onChange={(event) => set("firstName", event.target.value)}
        error={field === "firstName" ? t("errors.firstName") : null}
      />
      <p className="-mt-3 flex items-start gap-2 text-paper/55 text-xs">
        <Lock className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
        {t("fields.birthDateLocked")}
      </p>
      <ChoiceGroup<Gender>
        label={t("fields.gender")}
        choices={GENDERS.map((value) => ({ value, label: tOnboarding(`gender.options.${value}`) }))}
        value={[values.gender]}
        onChange={(next) => {
          if (next[0]) set("gender", next[0]);
        }}
      />
      <TextField
        label={t("fields.pronouns")}
        maxLength={PRONOUNS_MAX_LENGTH}
        value={values.pronouns}
        onChange={(event) => set("pronouns", event.target.value)}
        error={field === "pronouns" ? t("errors.pronouns") : null}
      />
      <TextField
        label={t("fields.program")}
        maxLength={PROGRAM_MAX_LENGTH}
        value={values.program}
        onChange={(event) => set("program", event.target.value)}
        error={field === "program" ? t("errors.program") : null}
      />
      <ChoiceGroup
        label={t("fields.year")}
        choices={years.map((value) => ({ value, label: value }))}
        value={[values.graduationYear]}
        onChange={(next) => {
          if (next[0]) set("graduationYear", next[0]);
        }}
      />
      <ChoiceGroup<Language>
        label={t("fields.languages")}
        multiple
        choices={LANGUAGES.map((value) => ({
          value,
          label: languageName(locale, value),
        }))}
        value={values.languages}
        onChange={(next) => set("languages", next.slice(0, MAX_LANGUAGES))}
      />
      {profile.modes.includes("love") ? (
        <ChoiceGroup<Intention>
          label={t("fields.intentions")}
          multiple
          choices={INTENTIONS.map((value) => ({ value, label: tOnboarding(`seeking.intentions.${value}`) }))}
          value={values.intentions}
          onChange={(next) => set("intentions", next)}
        />
      ) : null}
      <SaveBar dirty={dirty} pending={pending} />
    </form>
  );
}

function PromptsForm({
  profile,
  catalog,
  onSaved,
}: {
  profile: OwnProfile;
  catalog: Catalog;
  onSaved: (profile: OwnProfile) => void;
}) {
  const initial = useMemo(() => promptSlots(profile.promptAnswers), [profile.promptAnswers]);
  const [slots, setSlots] = useState<PromptSlot[]>(initial);
  const [invalid, setInvalid] = useState<Set<number>>(new Set());
  const { run, pending, field } = useSaver(onSaved);
  const dirty = JSON.stringify(slots) !== JSON.stringify(initial);
  const shownInvalid = field?.startsWith("answers.") ? new Set([Number(field.split(".")[1])]) : invalid;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const bad = invalidSlots(slots);
    setInvalid(bad);
    if (bad.size > 0) {
      return;
    }
    await run(() =>
      api().profile.setPrompts({
        answers: slots.map((slot) => ({ promptId: slot.promptId ?? "", text: slot.text })),
      }),
    );
  }

  return (
    <form onSubmit={(event) => void submit(event)} className="flex flex-col gap-6" noValidate>
      <PromptAnswersEditor
        catalog={catalog}
        slots={slots}
        onChange={(next) => {
          setSlots(next);
          setInvalid(new Set());
        }}
        invalid={shownInvalid}
      />
      <SaveBar dirty={dirty} pending={pending} />
    </form>
  );
}

function InterestsForm({
  profile,
  catalog,
  onSaved,
}: {
  profile: OwnProfile;
  catalog: Catalog;
  onSaved: (profile: OwnProfile) => void;
}) {
  const t = useTranslations("profile");
  const tOnboarding = useTranslations("onboarding");
  const [selected, setSelected] = useState<string[]>(profile.interestIds);
  const { run, pending } = useSaver(onSaved);
  const dirty = [...selected].sort().join() !== [...profile.interestIds].sort().join();
  const valid = selected.length >= MIN_INTERESTS && selected.length <= MAX_INTERESTS;

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        if (valid) void run(() => api().profile.setInterests({ interestIds: selected }));
      }}
      className="flex flex-col gap-6"
      noValidate
    >
      <InterestsPicker catalog={catalog} selected={selected} onChange={setSelected} />
      <p className="text-paper/60 text-sm" aria-live="polite">
        {valid ? tOnboarding("interests.counter", { count: selected.length }) : t("errors.interests")}
      </p>
      <SaveBar dirty={dirty && valid} pending={pending} />
    </form>
  );
}
