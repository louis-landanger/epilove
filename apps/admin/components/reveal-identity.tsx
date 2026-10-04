"use client";

import { Button, Dialog, TextAreaField, useToast } from "@atomes/ui";
import { Eye } from "lucide-react";
import { useState } from "react";
import { api } from "@/lib/api-client";

/** Identity behind a pseudonym, only with a written justification (logged). */
export function RevealIdentity({ userId }: { userId: string }) {
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [justification, setJustification] = useState("");
  const [identity, setIdentity] = useState<{ firstName: string | null; email: string } | null>(null);

  async function reveal() {
    try {
      setIdentity(await api().admin.revealIdentity({ userId, justification }));
      setOpen(false);
    } catch {
      toast.error("Révélation impossible.");
    }
  }

  if (identity) {
    return (
      <p className="rounded-2xl border border-volt/40 bg-volt/10 p-4 text-sm">
        {identity.firstName ?? "(sans prénom)"} · <span className="font-mono">{identity.email}</span>
      </p>
    );
  }
  return (
    <>
      <Button
        variant="outline"
        size="sm"
        className="self-start"
        onClick={() => setOpen(true)}
        leadingIcon={<Eye className="size-4" aria-hidden="true" />}
      >
        Révéler l'identité
      </Button>
      <Dialog
        open={open}
        onOpenChange={setOpen}
        title="Révéler l'identité"
        description="Uniquement si c'est nécessaire (réquisition, escalade, récusation). La justification est inscrite au journal d'audit."
        footer={
          <Button block disabled={justification.trim().length < 10} onClick={() => void reveal()}>
            Révéler
          </Button>
        }
      >
        <TextAreaField
          label="Justification"
          rows={3}
          maxLength={500}
          value={justification}
          onChange={(event) => setJustification(event.target.value)}
        />
      </Dialog>
    </>
  );
}
