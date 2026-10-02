"use client";

import { Button, TextAreaField, TextField } from "@epilove/ui";
import { Search } from "lucide-react";
import type { Route } from "next";
import Link from "next/link";
import { type FormEvent, useState } from "react";
import { api, errorCode } from "@/lib/api-client";

type Result =
  | { status: "found"; userId: string; pseudonym: string }
  | { status: "unknown" }
  | { status: "invalid" };

/** SAF-12: the code read on a leaked capture leads to whose screen it was. */
export function WatermarkLookup() {
  const [code, setCode] = useState("");
  const [justification, setJustification] = useState("");
  const [result, setResult] = useState<Result | null>(null);
  const [pending, setPending] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    try {
      const { member } = await api().admin.findWatermark({ code, justification });
      setResult(member ? { status: "found", ...member } : { status: "unknown" });
    } catch (error) {
      setResult(errorCode(error) === "INVALID_VALUE" ? { status: "invalid" } : { status: "unknown" });
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={(event) => void submit(event)} className="flex max-w-xl flex-col gap-5">
      <TextField
        label="Code lu sur la capture"
        description="8 caractères, par exemple 7KQ2-XA9M. Les lettres O et I sont lues comme 0 et 1."
        value={code}
        onChange={(event) => setCode(event.target.value)}
        autoComplete="off"
        spellCheck={false}
        error={result?.status === "invalid" ? "Ce code n'a pas le bon format." : null}
      />
      <TextAreaField
        label="Justification"
        description="Inscrite au journal d'audit, comme toute recherche."
        rows={3}
        maxLength={500}
        value={justification}
        onChange={(event) => setJustification(event.target.value)}
      />
      <Button
        type="submit"
        className="self-start"
        loading={pending}
        disabled={code.trim().length < 8 || justification.trim().length < 10}
        leadingIcon={<Search className="size-4" aria-hidden="true" />}
      >
        Rechercher
      </Button>
      {result?.status === "found" ? (
        <p role="status" className="rounded-2xl border border-volt/40 bg-volt/10 p-4">
          Capture faite depuis le compte{" "}
          <Link
            href={`/membres/${result.userId}` as Route}
            className="font-mono underline underline-offset-4"
          >
            {result.pseudonym}
          </Link>
          .
        </p>
      ) : null}
      {result?.status === "unknown" ? (
        <p role="status" className="rounded-2xl border border-paper/15 p-4 text-paper/75">
          Aucun compte ne correspond à ce code. Vérifie la lecture des caractères.
        </p>
      ) : null}
    </form>
  );
}
