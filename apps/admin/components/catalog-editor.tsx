"use client";

import { Button, SwitchField, TextField, useToast } from "@atomes/ui";
import { type FormEvent, useState } from "react";
import { api, errorCode } from "@/lib/api-client";

type Catalog = Awaited<ReturnType<ReturnType<typeof api>["admin"]["catalog"]>>;
type Prompt = Catalog["prompts"][number];
type Interest = Catalog["interests"][number];

/** ADM-06: prompts and interests. Slugs are stable identifiers; texts can change. */
export function CatalogEditor({ initial }: { initial: Catalog }) {
  const toast = useToast();
  const [prompts, setPrompts] = useState(initial.prompts);
  const [interests, setInterests] = useState(initial.interests);

  async function savePrompt(prompt: Omit<Prompt, "id"> & { id?: string }) {
    try {
      const saved = await api().admin.savePrompt(prompt);
      setPrompts((list) =>
        prompt.id ? list.map((item) => (item.id === saved.id ? saved : item)) : [...list, saved],
      );
      toast.success("Prompt enregistré.");
      return true;
    } catch (error) {
      toast.error(errorCode(error) === "CONFLICT" ? "Ce slug existe déjà." : "Enregistrement impossible.");
      return false;
    }
  }

  async function saveInterest(item: Omit<Interest, "id"> & { id?: string }) {
    try {
      const saved = await api().admin.saveInterest(item);
      setInterests((list) =>
        item.id ? list.map((entry) => (entry.id === saved.id ? saved : entry)) : [...list, saved],
      );
      toast.success("Centre d'intérêt enregistré.");
      return true;
    } catch (error) {
      toast.error(errorCode(error) === "CONFLICT" ? "Ce slug existe déjà." : "Enregistrement impossible.");
      return false;
    }
  }

  return (
    <div className="flex flex-col gap-10">
      <section aria-labelledby="prompts" className="flex flex-col gap-4">
        <h2 id="prompts" className="font-display font-semibold text-2xl">
          Prompts ({prompts.length})
        </h2>
        <NewEntryForm
          fields={["slug", "category", "textFr", "textEn"]}
          labels={{ slug: "Slug", category: "Catégorie", textFr: "Texte (fr)", textEn: "Texte (en)" }}
          onSubmit={(values) => savePrompt({ ...values, active: true } as Omit<Prompt, "id">)}
        />
        <ul className="flex flex-col divide-y divide-paper/10">
          {prompts.map((prompt) => (
            <li key={prompt.id} className="flex items-center justify-between gap-4 py-3">
              <div className="flex flex-col">
                <span>{prompt.textFr}</span>
                <span className="font-mono text-paper/50 text-xs">
                  {prompt.category} · {prompt.slug}
                </span>
              </div>
              <SwitchField
                label={<span className="sr-only">Actif : {prompt.slug}</span>}
                checked={prompt.active}
                onCheckedChange={(active) => void savePrompt({ ...prompt, active })}
              />
            </li>
          ))}
        </ul>
      </section>
      <section aria-labelledby="interests" className="flex flex-col gap-4">
        <h2 id="interests" className="font-display font-semibold text-2xl">
          Centres d'intérêt ({interests.length})
        </h2>
        <NewEntryForm
          fields={["slug", "category", "labelFr", "labelEn"]}
          labels={{ slug: "Slug", category: "Catégorie", labelFr: "Libellé (fr)", labelEn: "Libellé (en)" }}
          onSubmit={(values) => saveInterest(values as Omit<Interest, "id">)}
        />
        <ul className="flex flex-wrap gap-2">
          {interests.map((item) => (
            <li
              key={item.id}
              className="rounded-full border border-paper/15 px-3 py-1 text-sm"
              title={item.slug}
            >
              {item.labelFr}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

function NewEntryForm<K extends string>({
  fields,
  labels,
  onSubmit,
}: {
  fields: readonly K[];
  labels: Record<K, string>;
  onSubmit: (values: Record<K, string>) => Promise<boolean>;
}) {
  const empty = Object.fromEntries(fields.map((field) => [field, ""])) as Record<K, string>;
  const [values, setValues] = useState(empty);
  const [pending, setPending] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    if (await onSubmit(values)) {
      setValues(empty);
    }
    setPending(false);
  }

  return (
    <form
      onSubmit={(event) => void submit(event)}
      className="grid gap-3 rounded-3xl border border-paper/10 p-4 sm:grid-cols-2"
    >
      {fields.map((field) => (
        <TextField
          key={field}
          label={labels[field]}
          value={values[field]}
          onChange={(event) => setValues((current) => ({ ...current, [field]: event.target.value }))}
          required
        />
      ))}
      <Button type="submit" loading={pending} className="sm:col-span-2 sm:justify-self-start">
        Ajouter
      </Button>
    </form>
  );
}
