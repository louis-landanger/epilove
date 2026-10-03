"use client";

import type { PrivacySettings } from "@epilove/contracts";
import { GENDERS, type Gender, type Locale, MINIMUM_AGE, type Mode, parseSchoolEmail } from "@epilove/core";
import {
  Button,
  CheckboxField,
  ChoiceGroup,
  Dialog,
  RangeField,
  SwitchField,
  TextField,
  useToast,
} from "@epilove/ui";
import { ChevronRight, ShieldAlert, X } from "lucide-react";
import type { Route } from "next";
import Link from "next/link";
import { useFormatter, useLocale, useTranslations } from "next-intl";
import { type FormEvent, type ReactNode, useState } from "react";
import { publicHref } from "@/i18n/paths";
import { api, errorCode } from "@/lib/api-client";
import { LocaleSwitcher } from "../locale/locale-switcher";
import { LockSettings } from "../lock/lock-settings";
import { DataExport } from "./data-export";
import { DeleteAccount } from "./delete-account";
import { Section } from "./section";
import { SecuritySection } from "./security-section";

type Account = { email: string; schoolSlug: string; status: string; pausedUntil: string | null };
type HiddenContact = { id: string; hint: string; createdAt: string };
type Blocked = { userId: string; firstName: string | null; blockedAt: string };

export interface SettingsScreenProps {
  /** The member, for settings kept on this device (app lock). */
  readonly userId: string;
  readonly account: Account;
  readonly settings: PrivacySettings;
  readonly hiddenContacts: readonly HiddenContact[];
  readonly blocked: readonly Blocked[];
}

const AGE_SLIDER_MAX = 45;

/** Settings (SAF-03 to SAF-07, SAF-14, ONB-05 withdrawal). */
export function SettingsScreen({
  userId,
  account,
  settings: initial,
  hiddenContacts,
  blocked,
}: SettingsScreenProps) {
  const t = useTranslations("settings");
  const locale = useLocale() as Locale;
  const toast = useToast();
  const [settings, setSettings] = useState(initial);
  const [status, setStatus] = useState(account.status);
  const [pausedUntil, setPausedUntil] = useState(account.pausedUntil);

  async function update(patch: Parameters<(typeof api)["preferences"]["update"]>[0]) {
    const previous = settings;
    setSettings({ ...settings, ...patch });
    try {
      setSettings(await api.preferences.update(patch));
    } catch {
      setSettings(previous);
      toast.error(t("error"));
    }
  }

  async function togglePause(paused: boolean, until: string | null = null) {
    try {
      const next = paused ? await api.account.pause({ until }) : await api.account.resume();
      setStatus(next.status);
      setPausedUntil(next.pausedUntil);
      toast.success(paused ? t("visibility.paused") : t("visibility.resumed"));
      return true;
    } catch {
      toast.error(until ? t("visibility.partialsInvalid") : t("error"));
      return false;
    }
  }

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-10 px-4 py-8 sm:py-12">
      <h1 className="font-display font-semibold text-4xl tracking-tight">{t("title")}</h1>

      <Section id="visibility" title={t("visibility.title")}>
        <SwitchField
          label={t("visibility.pause")}
          description={t("visibility.pauseHelp")}
          checked={status === "paused"}
          disabled={status !== "active" && status !== "paused"}
          onCheckedChange={(checked) => void togglePause(checked)}
        />
        <ScheduledPause
          pausedUntil={status === "paused" ? pausedUntil : null}
          disabled={status !== "active" && status !== "paused"}
          onSchedule={(until) => togglePause(true, until)}
        />
        <SwitchField
          label={t("visibility.incognito")}
          description={t("visibility.incognitoHelp")}
          checked={settings.incognito}
          onCheckedChange={(incognito) => void update({ incognito })}
        />
        <SwitchField
          label={t("visibility.hideSchool")}
          description={t("visibility.hideSchoolHelp")}
          checked={settings.hideFromOwnSchool}
          onCheckedChange={(hideFromOwnSchool) => void update({ hideFromOwnSchool })}
        />
        <SwitchField
          label={t("visibility.hideYear")}
          description={t("visibility.hideYearHelp")}
          checked={settings.hideFromOwnYear}
          onCheckedChange={(hideFromOwnYear) => void update({ hideFromOwnYear })}
        />
      </Section>

      <Section id="discovery" title={t("discovery.title")}>
        <ModesEditor settings={settings} onSaved={setSettings} />
        <AgeRangeEditor settings={settings} onSave={(ageMin, ageMax) => update({ ageMin, ageMax })} />
      </Section>

      <Section id="hidden" title={t("hidden.title")}>
        <HiddenContacts initial={hiddenContacts} />
      </Section>

      <Section id="blocked" title={t("blocked.title")}>
        <BlockedPeople initial={blocked} />
      </Section>

      <Section id="notifications" title={t("notifications.title")}>
        <SwitchField
          label={t("notifications.discreet")}
          description={t("notifications.discreetHelp")}
          checked={settings.discreetNotifications}
          onCheckedChange={(discreetNotifications) => void update({ discreetNotifications })}
        />
        <RowLink href={"/reglages/notifications" as Route}>{t("notifications.more")}</RowLink>
      </Section>

      <Section id="language" title={t("language.title")}>
        <p className="text-paper/70 text-sm">{t("language.hint")}</p>
        <LocaleSwitcher />
      </Section>

      <SecuritySection email={account.email} />

      <Section id="lock" title={t("lock.title")}>
        <LockSettings userId={userId} />
      </Section>

      <Section id="data" title={t("data.title")}>
        <DataExport />
        <DeleteAccount />
      </Section>

      <Section id="links" title={t("links.title")}>
        <RowLink href={"/aide" as Route}>{t("links.help")}</RowLink>
        <RowLink href={"/aide/installer" as Route}>{t("links.install")}</RowLink>
        <RowLink href={publicHref(locale, "/legal/cgu")}>{t("links.terms")}</RowLink>
        <RowLink href={publicHref(locale, "/legal/confidentialite")}>{t("links.privacy")}</RowLink>
      </Section>
    </main>
  );
}

function ScheduledPause({
  pausedUntil,
  disabled,
  onSchedule,
}: {
  pausedUntil: string | null;
  disabled: boolean;
  onSchedule: (until: string) => Promise<boolean>;
}) {
  const t = useTranslations("settings.visibility");
  const format = useFormatter();
  const [date, setDate] = useState("");
  const [pending, setPending] = useState(false);
  const today = new Date();
  const min = new Date(today.getTime() + 86_400_000 * 1.5).toISOString().slice(0, 10);
  const max = new Date(today.getTime() + 86_400_000 * 61).toISOString().slice(0, 10);

  if (pausedUntil) {
    return (
      <p className="rounded-2xl bg-volt/10 p-3 text-sm text-volt">
        {t("pausedUntil", { date: format.dateTime(new Date(pausedUntil), { dateStyle: "long" }) })}
      </p>
    );
  }
  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={async (event) => {
        event.preventDefault();
        setPending(true);
        // End of the chosen day, campus time.
        if (await onSchedule(new Date(`${date}T23:59:00+02:00`).toISOString())) {
          setDate("");
        }
        setPending(false);
      }}
    >
      <div className="flex flex-col gap-1">
        <span className="font-medium">{t("partials")}</span>
        <span className="text-paper/60 text-sm">{t("partialsHelp")}</span>
      </div>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <TextField
          className="flex-1"
          label={t("partialsUntil")}
          type="date"
          min={min}
          max={max}
          value={date}
          onChange={(event) => setDate(event.target.value)}
          inputClassName="[color-scheme:dark]"
          disabled={disabled}
        />
        <Button type="submit" variant="secondary" loading={pending} disabled={!date || disabled}>
          {t("partialsStart")}
        </Button>
      </div>
    </form>
  );
}

function RowLink({ href, children }: { href: Route; children: ReactNode }) {
  return (
    <Link
      href={href}
      className="-m-2 flex items-center justify-between rounded-2xl p-2 text-paper transition-colors hover:bg-paper/5 focus-visible:outline-2 focus-visible:outline-volt"
    >
      {children}
      <ChevronRight className="size-4 text-paper/50" aria-hidden="true" />
    </Link>
  );
}

function modesLabel(modes: readonly Mode[]): "love" | "friends" | "both" {
  if (modes.includes("love") && modes.includes("friends")) return "both";
  return modes.includes("love") ? "love" : "friends";
}

function ModesEditor({
  settings,
  onSaved,
}: {
  settings: PrivacySettings;
  onSaved: (settings: PrivacySettings) => void;
}) {
  const t = useTranslations("settings.discovery");
  const tOnboarding = useTranslations("onboarding");
  const tSettings = useTranslations("settings");
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [choice, setChoice] = useState(modesLabel(settings.modes));
  const [consent, setConsent] = useState(settings.sensitiveConsent);
  const [interestedIn, setInterestedIn] = useState<Gender[]>(settings.interestedIn);
  const [pending, setPending] = useState(false);
  const love = choice !== "friends";

  async function save(withConsent: boolean) {
    setPending(true);
    try {
      const modes: Mode[] = choice === "both" ? ["love", "friends"] : [choice];
      const next = await api.preferences.setModes({
        modes,
        sensitiveConsent: love && withConsent,
        interestedIn: love && withConsent ? interestedIn : [],
      });
      onSaved(next);
      setChoice(modesLabel(next.modes));
      setConsent(next.sensitiveConsent);
      setInterestedIn(next.interestedIn);
      setOpen(false);
      toast.success(tSettings("saved"));
    } catch {
      toast.error(tSettings("error"));
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-start justify-between gap-4">
        <div className="flex flex-col gap-1">
          <span className="text-paper/60 text-sm">{t("modes")}</span>
          <span className="font-semibold">{t(`modesValue.${modesLabel(settings.modes)}`)}</span>
          <span className="flex items-center gap-1.5 text-paper/60 text-xs">
            <ShieldAlert className="size-3.5" aria-hidden="true" />
            {settings.sensitiveConsent ? t("consentState.granted") : t("consentState.none")}
          </span>
        </div>
        <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
          {t("edit")}
        </Button>
      </div>
      <Dialog
        open={open}
        onOpenChange={setOpen}
        title={t("dialogTitle")}
        closeLabel={tSettings("data.cancel")}
        footer={
          <div className="flex flex-col gap-3">
            <Button
              block
              loading={pending}
              disabled={love && (!consent || interestedIn.length === 0)}
              onClick={() => void save(true)}
            >
              {tSettings("save")}
            </Button>
            {love && settings.sensitiveConsent ? (
              <Button variant="ghost" block disabled={pending} onClick={() => void save(false)}>
                {t("withdraw")}
              </Button>
            ) : null}
          </div>
        }
      >
        <div className="flex flex-col gap-5">
          <ChoiceGroup<"love" | "friends" | "both">
            label={tOnboarding("seeking.label")}
            layout="cards"
            choices={(["love", "friends", "both"] as const).map((value) => ({
              value,
              label: tOnboarding(`seeking.options.${value}.label`),
            }))}
            value={[choice]}
            onChange={(next) => {
              if (next[0]) setChoice(next[0]);
            }}
          />
          {love ? (
            <>
              <p className="text-paper/70 text-sm">{tOnboarding("audience.consentBody")}</p>
              <CheckboxField
                label={tOnboarding("audience.consentLabel")}
                description={t("withdrawHelp")}
                checked={consent}
                onCheckedChange={setConsent}
              />
              {consent ? (
                <ChoiceGroup<Gender>
                  label={tOnboarding("audience.interestedInLabel")}
                  multiple
                  choices={GENDERS.map((value) => ({
                    value,
                    label: tOnboarding(`audience.interestedIn.${value}`),
                  }))}
                  value={interestedIn}
                  onChange={setInterestedIn}
                />
              ) : null}
            </>
          ) : null}
        </div>
      </Dialog>
    </div>
  );
}

function AgeRangeEditor({
  settings,
  onSave,
}: {
  settings: PrivacySettings;
  onSave: (ageMin: number, ageMax: number) => Promise<void>;
}) {
  const t = useTranslations("settings.discovery");
  const tOnboarding = useTranslations("onboarding.audience");
  const [range, setRange] = useState<[number, number]>([
    settings.ageMin,
    Math.min(settings.ageMax, AGE_SLIDER_MAX),
  ]);
  const ageMax = range[1] >= AGE_SLIDER_MAX ? 99 : range[1];
  const dirty = range[0] !== settings.ageMin || ageMax !== settings.ageMax;
  return (
    <div className="flex flex-col gap-3">
      <RangeField
        label={t("ageTitle")}
        min={MINIMUM_AGE}
        max={AGE_SLIDER_MAX}
        value={range}
        onChange={setRange}
        formatValue={(value) =>
          value >= AGE_SLIDER_MAX ? `${AGE_SLIDER_MAX}+` : tOnboarding("ageValue", { age: value })
        }
        thumbLabels={[tOnboarding("ageMin"), tOnboarding("ageMax")]}
      />
      {dirty ? (
        <Button
          variant="secondary"
          size="sm"
          className="self-end"
          onClick={() => void onSave(range[0], ageMax)}
        >
          {t("saveAge")}
        </Button>
      ) : null}
    </div>
  );
}

function HiddenContacts({ initial }: { initial: readonly HiddenContact[] }) {
  const t = useTranslations("settings.hidden");
  const toast = useToast();
  const [contacts, setContacts] = useState(initial);
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function add(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const parsed = parseSchoolEmail(email);
    if (!parsed.ok) {
      setError(t("invalid"));
      return;
    }
    setPending(true);
    try {
      setContacts((await api.preferences.hideContact({ email: parsed.canonicalEmail })).contacts);
      setEmail("");
      setError(null);
      toast.success(t("added"));
    } catch (caught) {
      setError(errorCode(caught) === "TOO_MANY" ? t("tooMany") : t("invalid"));
    } finally {
      setPending(false);
    }
  }

  async function remove(id: string) {
    try {
      setContacts((await api.preferences.unhideContact({ id })).contacts);
    } catch {
      toast.error(t("invalid"));
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="text-paper/70 text-sm">{t("lead")}</p>
      <form
        onSubmit={(event) => void add(event)}
        className="flex flex-col gap-3 sm:flex-row sm:items-end"
        noValidate
      >
        <TextField
          className="flex-1"
          label={t("label")}
          type="email"
          inputMode="email"
          autoComplete="off"
          autoCapitalize="none"
          spellCheck={false}
          placeholder={t("placeholder")}
          value={email}
          onChange={(event) => {
            setEmail(event.target.value);
            setError(null);
          }}
          error={error}
        />
        <Button type="submit" loading={pending} disabled={!email.trim()}>
          {t("add")}
        </Button>
      </form>
      {contacts.length === 0 ? (
        <p className="text-paper/50 text-sm">{t("empty")}</p>
      ) : (
        <ul className="flex flex-wrap gap-2">
          {contacts.map((contact) => (
            <li
              key={contact.id}
              className="inline-flex items-center gap-1 rounded-full border border-paper/15 py-1 pr-1 pl-3 font-mono text-sm"
            >
              {contact.hint}
              <button
                type="button"
                aria-label={t("remove", { hint: contact.hint })}
                onClick={() => void remove(contact.id)}
                className="inline-flex size-7 items-center justify-center rounded-full text-paper/60 hover:bg-paper/10 hover:text-paper focus-visible:outline-2 focus-visible:outline-volt"
              >
                <X className="size-3.5" aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function BlockedPeople({ initial }: { initial: readonly Blocked[] }) {
  const t = useTranslations("settings.blocked");
  const format = useFormatter();
  const toast = useToast();
  const [people, setPeople] = useState(initial);

  async function unblock(userId: string) {
    try {
      await api.safety.unblock({ userId });
      setPeople((current) => current.filter((person) => person.userId !== userId));
      toast.success(t("unblocked"));
    } catch {
      toast.error(t("empty"));
    }
  }

  if (people.length === 0) {
    return <p className="text-paper/50 text-sm">{t("empty")}</p>;
  }
  return (
    <ul className="flex flex-col divide-y divide-paper/10">
      {people.map((person) => {
        const name = person.firstName ?? t("unknown");
        return (
          <li
            key={person.userId}
            className="flex items-center justify-between gap-4 py-3 first:pt-0 last:pb-0"
          >
            <div className="flex flex-col">
              <span>{name}</span>
              <span className="text-paper/50 text-xs">
                {t("since", { date: format.dateTime(new Date(person.blockedAt), { dateStyle: "medium" }) })}
              </span>
            </div>
            <Button
              variant="outline"
              size="sm"
              aria-label={t("unblockLabel", { name })}
              onClick={() => void unblock(person.userId)}
            >
              {t("unblock")}
            </Button>
          </li>
        );
      })}
    </ul>
  );
}
