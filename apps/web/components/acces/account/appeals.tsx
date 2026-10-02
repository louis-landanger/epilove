"use client";

import { Badge, Button, TextAreaField, useToast } from "@epilove/ui";
import { useFormatter, useTranslations } from "next-intl";
import { useState } from "react";
import { api } from "../api-client";

type Decision = Awaited<ReturnType<ReturnType<typeof api>["account"]["decisions"]>>["decisions"][number];

/** The member's decisions and their appeal (ADM-04, DSA art. 17 and 20). */
export function Appeals({ initial }: { initial: readonly Decision[] }) {
  const t = useTranslations("settings.appeals");
  const format = useFormatter();
  const [decisions, setDecisions] = useState(initial);

  if (decisions.length === 0) {
    return <p className="text-paper/60">{t("empty")}</p>;
  }
  return (
    <ul className="flex flex-col gap-4">
      {decisions.map((decision) => (
        <li
          key={decision.id}
          className="flex flex-col gap-3 rounded-[2rem] border border-paper/10 bg-paper/[0.03] p-5"
        >
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-semibold">{t(`actions.${decision.action}`)}</span>
            <Badge>{format.dateTime(new Date(decision.createdAt), { dateStyle: "medium" })}</Badge>
            {decision.expiresAt ? (
              <Badge>
                {t("until", { date: format.dateTime(new Date(decision.expiresAt), { dateStyle: "medium" }) })}
              </Badge>
            ) : null}
          </div>
          <p className="text-paper/60 text-sm">{t("rule", { rule: decision.rule })}</p>
          <p className="whitespace-pre-line text-paper/85">{decision.statement}</p>
          {decision.appeal ? (
            <p className="text-sm text-volt">{t(`status.${decision.appeal}`)}</p>
          ) : decision.canAppeal ? (
            <AppealForm
              decisionId={decision.id}
              onSent={() =>
                setDecisions((list) =>
                  list.map((item) =>
                    item.id === decision.id ? { ...item, appeal: "pending", canAppeal: false } : item,
                  ),
                )
              }
            />
          ) : null}
        </li>
      ))}
    </ul>
  );
}

function AppealForm({ decisionId, onSent }: { decisionId: string; onSent: () => void }) {
  const t = useTranslations("settings.appeals");
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [pending, setPending] = useState(false);

  if (!open) {
    return (
      <Button variant="outline" size="sm" className="self-start" onClick={() => setOpen(true)}>
        {t("contest")}
      </Button>
    );
  }
  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={async (event) => {
        event.preventDefault();
        setPending(true);
        try {
          await api().account.appeal({ decisionId, text });
          toast.success(t("sent"));
          onSent();
        } catch {
          toast.error(t("error"));
        } finally {
          setPending(false);
        }
      }}
    >
      <TextAreaField
        label={t("formLabel")}
        description={t("formHelp")}
        rows={4}
        maxLength={2000}
        value={text}
        onChange={(event) => setText(event.target.value)}
      />
      <Button type="submit" className="self-start" loading={pending} disabled={text.trim().length < 20}>
        {t("send")}
      </Button>
    </form>
  );
}
