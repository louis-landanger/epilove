"use client";

import { Button, RadioGroupField, TextAreaField, useToast } from "@epilove/ui";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { api } from "@/lib/api-client";

export function AppealForm({ appealId }: { appealId: string }) {
  const router = useRouter();
  const toast = useToast();
  const [outcome, setOutcome] = useState<"upheld" | "overturned" | null>(null);
  const [statement, setStatement] = useState("");
  const [pending, setPending] = useState(false);
  return (
    <section
      aria-labelledby="appeal-decision"
      className="flex flex-col gap-4 rounded-[2rem] border border-paper/10 p-5"
    >
      <h2 id="appeal-decision" className="font-display font-semibold text-2xl">
        Réexamen
      </h2>
      <RadioGroupField<"upheld" | "overturned">
        label="Issue"
        options={[
          { value: "upheld", label: "Maintenir la décision" },
          { value: "overturned", label: "Annuler la décision et lever ses effets" },
        ]}
        value={outcome}
        onChange={setOutcome}
      />
      <TextAreaField
        label="Explication envoyée à la personne"
        rows={4}
        maxLength={2000}
        value={statement}
        onChange={(event) => setStatement(event.target.value)}
      />
      <Button
        disabled={!outcome || statement.trim().length < 20}
        loading={pending}
        onClick={async () => {
          if (!outcome) return;
          setPending(true);
          try {
            await api().admin.decideAppeal({ id: appealId, outcome, statement });
            toast.success("Recours traité.");
            router.push("/recours");
            router.refresh();
          } catch {
            toast.error("Le recours n'a pas pu être traité.");
            setPending(false);
          }
        }}
      >
        Enregistrer
      </Button>
    </section>
  );
}
