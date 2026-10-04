"use client";

import {
  CHARTER_RULES,
  type CharterRule,
  MIN_STATEMENT_LENGTH,
  SANCTIONS,
  type Sanction,
} from "@atomes/core";
import { Button, ChoiceGroup, RadioGroupField, TextAreaField, useToast } from "@atomes/ui";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { api, errorCode } from "@/lib/api-client";
import { RULE, SANCTION, STATEMENT_TEMPLATES } from "@/lib/labels";

/** ADM-03: graduated action, cited rule and a written statement sent to the member (DSA art. 17). */
export function DecisionForm({ reportId }: { reportId: string }) {
  const router = useRouter();
  const toast = useToast();
  const [action, setAction] = useState<Sanction | null>(null);
  const [rule, setRule] = useState<CharterRule | null>(null);
  const [duration, setDuration] = useState<"7" | "30">("7");
  const [statement, setStatement] = useState("");
  const [pending, setPending] = useState(false);
  const needsStatement = action !== null && action !== "no_action";
  const timed = action === "restriction" || action === "suspension";
  const ready =
    action === "no_action" || (needsStatement && rule && statement.trim().length >= MIN_STATEMENT_LENGTH);

  async function submit() {
    if (!action || !ready) {
      return;
    }
    setPending(true);
    try {
      const decision =
        action === "no_action"
          ? { action }
          : timed
            ? { action, rule: rule as CharterRule, statement, durationDays: Number(duration) as 7 | 30 }
            : {
                action: action as "warning" | "content_removal" | "ban",
                rule: rule as CharterRule,
                statement,
              };
      await api().admin.decide({ reportId, decision });
      toast.success("Décision enregistrée et notifiée.");
      router.push("/signalements");
      router.refresh();
    } catch (error) {
      toast.error(
        errorCode(error) === "ALREADY_DECIDED"
          ? "Ce signalement a déjà été traité."
          : "La décision n'a pas été enregistrée.",
      );
      setPending(false);
    }
  }

  return (
    <section
      aria-labelledby="decision"
      className="flex flex-col gap-5 rounded-[2rem] border border-paper/10 p-5"
    >
      <h2 id="decision" className="font-display font-semibold text-2xl">
        Décision
      </h2>
      <RadioGroupField<Sanction>
        label="Mesure"
        options={SANCTIONS.map((value) => ({ value, label: SANCTION[value] }))}
        value={action}
        onChange={setAction}
      />
      {timed ? (
        <ChoiceGroup<"7" | "30">
          label="Durée"
          choices={[
            { value: "7", label: "7 jours" },
            { value: "30", label: "30 jours" },
          ]}
          value={[duration]}
          onChange={(next) => {
            if (next[0]) setDuration(next[0]);
          }}
        />
      ) : null}
      {needsStatement ? (
        <>
          <RadioGroupField<CharterRule>
            label="Règle enfreinte"
            options={CHARTER_RULES.map((value) => ({ value, label: RULE[value] }))}
            value={rule}
            onChange={(value) => {
              setRule(value);
              if (!statement.trim()) setStatement(STATEMENT_TEMPLATES[value] ?? "");
            }}
          />
          <TextAreaField
            label="Motivation envoyée à la personne"
            description={`Les faits, précisément. ${MIN_STATEMENT_LENGTH} caractères minimum.`}
            maxLength={2000}
            rows={5}
            value={statement}
            onChange={(event) => setStatement(event.target.value)}
          />
        </>
      ) : null}
      <Button
        onClick={() => void submit()}
        loading={pending}
        disabled={!ready}
        variant={action === "ban" ? "danger" : "primary"}
      >
        Enregistrer la décision
      </Button>
    </section>
  );
}
