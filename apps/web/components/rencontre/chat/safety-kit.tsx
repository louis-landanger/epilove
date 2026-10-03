"use client";

import type { DateKit } from "@epilove/contracts";
import { type CheckInAnswer, EMERGENCY_NUMBERS, uuidv7 } from "@epilove/core";
import { Sheet } from "@epilove/ui";
import { ORPCError } from "@orpc/client";
import Link from "next/link";
import { useFormatter, useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { ReportDialog } from "@/components/acces/safety/safety-dialogs";
import { api } from "@/lib/rencontre/api.client";

const CAMPUS_TIME_ZONE = "Europe/Paris";
const SHARE_ERRORS = ["not_accepted", "over", "too_many", "rate_limited"] as const;

/** Emergency numbers (SAF-15) and the school resources of the help page. */
export function EmergencyNumbers() {
  const t = useTranslations("chat.safetyKit");
  return (
    <section aria-labelledby="emergency-title" className="flex flex-col gap-2">
      <h3 id="emergency-title" className="font-semibold">
        {t("emergencyTitle")}
      </h3>
      <ul className="grid gap-2 sm:grid-cols-2">
        {EMERGENCY_NUMBERS.map((number) => (
          <li key={number.id}>
            <a
              href={number.href}
              className="flex min-h-11 items-center rounded-2xl border border-paper/15 px-4 py-2 text-sm hover:border-volt"
            >
              {t(`numbers.${number.id}`)}
            </a>
          </li>
        ))}
      </ul>
      <a href="/aide" className="self-start text-sm underline underline-offset-4">
        {t("schoolHelp")}
      </a>
    </section>
  );
}

/** The links of a date: copy, share, stop. */
function KitLinks({ kit, onChange }: { kit: DateKit; onChange: (kit: DateKit) => void }) {
  const t = useTranslations("chat.safetyKit");
  const format = useFormatter();
  const [copied, setCopied] = useState<string | null>(null);
  // Known after hydration only: the kit page is rendered on the server first.
  const [origin, setOrigin] = useState("");
  useEffect(() => setOrigin(window.location.origin), []);
  const absolute = (path: string) => `${origin}${path}`;

  if (kit.shares.length === 0) {
    return null;
  }
  return (
    <section aria-labelledby="kit-links" className="flex flex-col gap-2">
      <h3 id="kit-links" className="font-semibold">
        {t("links")}
      </h3>
      <ul className="flex flex-col gap-2">
        {kit.shares.map((share) => (
          <li key={share.id} className="flex flex-col gap-2 rounded-2xl bg-paper/[0.05] p-3">
            <p className="flex flex-wrap items-center gap-2 text-sm">
              <span
                className={`rounded-full px-2 py-0.5 font-mono text-xs ${
                  share.state === "active" ? "bg-volt/20 text-volt" : "bg-paper/10 text-paper/70"
                }`}
              >
                {t(`states.${share.state}`)}
              </span>
              <span className="text-paper/70">
                {t("createdAt", {
                  time: format.dateTime(new Date(share.createdAt), {
                    hour: "2-digit",
                    minute: "2-digit",
                    timeZone: CAMPUS_TIME_ZONE,
                  }),
                })}
              </span>
            </p>
            {share.state === "active" && (
              <input
                readOnly
                value={absolute(share.path)}
                aria-label={t("linkLabel")}
                onFocus={(event) => event.currentTarget.select()}
                className="w-full rounded-xl border border-paper/15 bg-transparent px-3 py-2 font-mono text-xs"
              />
            )}
            {share.state === "active" && (
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={async () => {
                    await navigator.clipboard.writeText(absolute(share.path)).catch(() => undefined);
                    setCopied(share.id);
                  }}
                  className="rounded-full bg-paper px-4 py-2 font-semibold text-ink text-sm"
                >
                  {t("copy")}
                </button>
                {typeof navigator !== "undefined" && "share" in navigator && (
                  <button
                    type="button"
                    onClick={() =>
                      void navigator
                        .share({ text: t("shareText"), url: absolute(share.path) })
                        .catch(() => undefined)
                    }
                    className="rounded-full border border-paper/25 px-4 py-2 text-sm"
                  >
                    {t("share")}
                  </button>
                )}
                <button
                  type="button"
                  onClick={async () => {
                    const result = await api.dateSafety.revoke({ shareId: share.id }).catch(() => null);
                    if (result) {
                      onChange(result.kit);
                    }
                  }}
                  className="rounded-full px-3 py-2 text-paper/75 text-sm underline-offset-4 hover:underline"
                >
                  {t("revoke")}
                </button>
              </div>
            )}
            {copied === share.id && (
              <p role="status" className="text-volt text-sm">
                {t("copied")}
              </p>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}

/** From an accepted date card (CHAT-10): create and manage the links for trusted people (IRL-03). */
export function SafetyKitSheet({
  open,
  matchId,
  messageId,
  otherName,
  onClose,
}: {
  open: boolean;
  matchId: string;
  messageId: string | null;
  otherName: string;
  onClose: () => void;
}) {
  const t = useTranslations("chat.safetyKit");
  const [kit, setKit] = useState<DateKit | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setKit(null);
    setError(null);
    if (open && messageId) {
      void api.dateSafety
        .kit({ messageId })
        .then((result) => setKit(result.kit))
        .catch(() => undefined);
    }
  }, [open, messageId]);

  const create = async () => {
    if (!messageId) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const id = uuidv7(Date.now(), crypto.getRandomValues(new Uint8Array(10)));
      setKit((await api.dateSafety.share({ id, matchId, messageId })).kit);
    } catch (failure) {
      const reason =
        failure instanceof ORPCError ? SHARE_ERRORS.find((code) => code === failure.message) : undefined;
      setError(reason ? t(`errors.${reason}`) : t("errors.generic"));
    } finally {
      setBusy(false);
    }
  };

  const active = kit?.shares.some((s) => s.state === "active") ?? false;
  return (
    <Sheet open={open} onClose={onClose} labelledBy="safety-kit-title">
      <h2 id="safety-kit-title" className="font-display font-semibold text-xl">
        {t("title")}
      </h2>
      <p className="text-paper/75">{t("lead")}</p>
      <p className="text-paper/70 text-sm">{t("whatShared", { name: otherName })}</p>
      {kit && <KitLinks kit={kit} onChange={setKit} />}
      <button
        type="button"
        disabled={busy}
        onClick={() => void create()}
        className={`self-start rounded-full px-5 py-3 font-semibold disabled:opacity-50 ${
          active ? "border border-paper/25" : "bg-volt text-ink"
        }`}
      >
        {active ? t("another") : t("create")}
      </button>
      {error && (
        <p role="alert" className="rounded-2xl bg-plasma/15 px-4 py-2 text-sm">
          {error}
        </p>
      )}
      <EmergencyNumbers />
    </Sheet>
  );
}

/** The member's kit page, reached from the check-in notification: "Tout s'est bien passé ?". */
export function KitScreen({ initial }: { initial: DateKit }) {
  const t = useTranslations("chat.safetyKit");
  const format = useFormatter();
  const [kit, setKit] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [changing, setChanging] = useState(false);
  const [reporting, setReporting] = useState(false);
  const [reported, setReported] = useState(false);
  const shareId = initial.shares[0]?.id ?? "";

  const answer = async (value: CheckInAnswer) => {
    setBusy(true);
    const result = await api.dateSafety.checkIn({ shareId, answer: value }).catch(() => null);
    if (result) {
      setKit(result.kit);
      setChanging(false);
    }
    setBusy(false);
  };

  const date = format.dateTime(new Date(kit.startsAt), {
    weekday: "long",
    day: "numeric",
    month: "long",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: CAMPUS_TIME_ZONE,
  });

  return (
    <section
      aria-labelledby="kit-title"
      className="flex h-dvh w-full flex-col gap-6 overflow-y-auto px-4 pt-6 pb-10 lg:px-8"
    >
      <header className="flex flex-col gap-2">
        <Link
          href={`/messages/${kit.matchId}`}
          className="self-start text-paper/70 text-sm underline-offset-4 hover:underline"
        >
          {t("back")}
        </Link>
        <h1 id="kit-title" className="font-display font-semibold text-3xl tracking-tight">
          {t("pageTitle")}
        </h1>
        <p className="text-paper/75">{t("summary", { name: kit.otherFirstName, place: kit.place, date })}</p>
      </header>

      <section
        aria-labelledby="check-in-title"
        className="flex flex-col gap-3 rounded-3xl border border-paper/10 p-5"
      >
        <h2 id="check-in-title" className="font-display font-semibold text-xl">
          {t("checkInTitle")}
        </h2>
        {kit.checkIn && !changing ? (
          <>
            <p role="status">
              {kit.checkIn === "ok" ? t("okDone") : t("helpDone", { name: kit.otherFirstName })}
            </p>
            <button
              type="button"
              onClick={() => setChanging(true)}
              className="self-start text-paper/75 text-sm underline underline-offset-4"
            >
              {t("changeAnswer")}
            </button>
          </>
        ) : (
          <>
            <p className="text-paper/75 text-sm">{t("checkInLead")}</p>
            <div className="flex flex-wrap gap-3">
              <button
                type="button"
                disabled={busy}
                onClick={() => void answer("ok")}
                className="rounded-full bg-volt px-5 py-3 font-semibold text-ink disabled:opacity-50"
              >
                {t("ok")}
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => void answer("help")}
                className="rounded-full border border-paper/25 px-5 py-3 font-semibold disabled:opacity-50"
              >
                {t("help")}
              </button>
            </div>
          </>
        )}
        {kit.checkIn === "help" && !changing && (
          <div className="flex flex-col gap-2">
            {reported ? (
              <p role="status" className="text-sm">
                {t("reported")}
              </p>
            ) : (
              <button
                type="button"
                onClick={() => setReporting(true)}
                className="self-start rounded-full border border-plasma/60 px-4 py-2 text-plasma text-sm"
              >
                {t("report", { name: kit.otherFirstName })}
              </button>
            )}
          </div>
        )}
      </section>

      <KitLinks kit={kit} onChange={setKit} />
      <EmergencyNumbers />

      <ReportDialog
        target={{ userId: kit.otherUserId, firstName: kit.otherFirstName }}
        context="profile"
        open={reporting}
        onOpenChange={setReporting}
        onReported={() => {
          setReporting(false);
          setReported(true);
        }}
      />
    </section>
  );
}
