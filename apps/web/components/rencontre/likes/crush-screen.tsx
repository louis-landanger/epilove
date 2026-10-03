"use client";

import type { CrushView, MemberCard } from "@epilove/contracts";
import { ORPCError } from "@orpc/client";
import Link from "next/link";
import { useFormatter, useLocale, useTranslations } from "next-intl";
import { useId, useState } from "react";
import { api } from "@/lib/api-client";
import { contentLocale } from "@/lib/rencontre/locale";
import { Liaison } from "../matches/liaison";

const CAMPUS_TIME_ZONE = "Europe/Paris";

/**
 * Secret crush (DEC-08): the member types the school email of someone they
 * know. The screen never says whether the address belongs to a member; a
 * mutual crush opens the match screen, anything else stays silent.
 */
export function CrushScreen({
  initial,
  me,
}: {
  initial: { crushes: CrushView[]; maxActive: number };
  me: MemberCard | null;
}) {
  const t = useTranslations("likes.crush");
  const locale = contentLocale(useLocale());
  const format = useFormatter();
  const inputId = useId();
  const [list, setList] = useState(initial);
  const [email, setEmail] = useState("");
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<{ kind: "error" | "info"; text: string } | null>(null);
  const [liaison, setLiaison] = useState<{ card: MemberCard; matchId: string } | null>(null);
  const active = list.crushes.filter((c) => c.status === "active").length;

  const add = async (event: React.FormEvent) => {
    event.preventDefault();
    setPending(true);
    setMessage(null);
    try {
      const result = await api.discovery.addCrush({ email, locale });
      setList({ crushes: result.crushes, maxActive: result.maxActive });
      setEmail("");
      if (result.matched) {
        setLiaison(result.matched);
      } else {
        setMessage({ kind: "info", text: t("added") });
      }
    } catch (cause) {
      const code = cause instanceof ORPCError ? cause.message : "generic";
      setMessage({ kind: "error", text: t(`errors.${code}` as "errors.generic") });
    } finally {
      setPending(false);
    }
  };

  const remove = async (crushId: string) => {
    try {
      setList(await api.discovery.removeCrush({ crushId }));
    } catch {
      setMessage({ kind: "error", text: t("errors.generic") });
    }
  };

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-xl flex-col gap-6 px-4 pt-6 pb-10">
      <header className="flex flex-col gap-2">
        <Link href="/likes" className="self-start text-paper/70 text-sm underline-offset-4 hover:underline">
          {t("back")}
        </Link>
        <h1 className="font-display font-semibold text-3xl tracking-tight">{t("title")}</h1>
        <p className="text-paper/75">{t("lead")}</p>
      </header>

      <form onSubmit={add} className="flex flex-col gap-3 rounded-3xl border border-paper/10 p-5">
        <label htmlFor={inputId} className="font-semibold">
          {t("label")}
        </label>
        <div className="flex flex-col gap-3 sm:flex-row">
          <input
            id={inputId}
            type="email"
            inputMode="email"
            autoComplete="off"
            spellCheck={false}
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder={t("placeholder")}
            className="min-w-0 flex-1 rounded-full border border-paper/20 bg-transparent px-4 py-3 outline-none focus-visible:border-volt"
          />
          <button
            type="submit"
            disabled={pending || active >= list.maxActive}
            className="rounded-full bg-paper px-5 py-3 font-semibold text-ink transition hover:bg-volt disabled:cursor-not-allowed disabled:opacity-50"
          >
            {t("add")}
          </button>
        </div>
        <p className="font-mono text-paper/70 text-xs">{t("slots", { active, max: list.maxActive })}</p>
        {message && (
          <p
            role={message.kind === "error" ? "alert" : "status"}
            className={`rounded-2xl px-4 py-3 text-sm ${message.kind === "error" ? "bg-plasma/15" : "bg-paper/5"}`}
          >
            {message.text}
          </p>
        )}
      </form>

      <section aria-labelledby="crush-list" className="flex flex-col gap-3">
        <h2 id="crush-list" className="font-mono text-paper/70 text-xs uppercase tracking-widest">
          {t("listTitle")}
        </h2>
        {list.crushes.length === 0 ? (
          <p className="text-paper/70 text-sm">{t("empty")}</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {list.crushes.map((crush) => (
              <li key={crush.id} className="flex items-center gap-3 rounded-2xl bg-paper/5 px-4 py-3">
                <span className="font-mono">{crush.hint}</span>
                <span className="mr-auto text-paper/70 text-xs">
                  {crush.status === "matched"
                    ? t("status.matched")
                    : crush.status === "expired"
                      ? t("status.expired")
                      : t("status.active", {
                          date: format.dateTime(new Date(crush.expiresAt), {
                            dateStyle: "medium",
                            timeZone: CAMPUS_TIME_ZONE,
                          }),
                        })}
                </span>
                {crush.status !== "matched" && (
                  <button
                    type="button"
                    onClick={() => void remove(crush.id)}
                    aria-label={t("removeLabel", { hint: crush.hint })}
                    className="text-paper/70 text-sm underline-offset-4 hover:underline"
                  >
                    {t("remove")}
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="flex flex-col gap-2 text-paper/70 text-sm">
        <h2 className="font-semibold text-paper">{t("privacyTitle")}</h2>
        <p>{t("privacy")}</p>
      </section>

      {liaison && (
        <Liaison
          matchId={liaison.matchId}
          me={{
            firstName: me?.firstName ?? "",
            schoolSlug: me?.school.slug ?? "",
            photoUrl: me?.photos[0]?.url ?? null,
          }}
          other={{
            firstName: liaison.card.firstName,
            schoolSlug: liaison.card.school.slug,
            photoUrl: liaison.card.photos[0]?.url ?? null,
          }}
          onClose={() => setLiaison(null)}
        />
      )}
    </main>
  );
}
