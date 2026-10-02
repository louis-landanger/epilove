"use client";

import { VERIFICATION_REJECTIONS, type VerificationGesture, type VerificationRejection } from "@epilove/core";
import { Button, EmptyState, useToast, ViewerWatermark } from "@epilove/ui";
import { Check, ScanFace, X } from "lucide-react";
import type { Route } from "next";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api-client";

type QueuedVerification = Awaited<
  ReturnType<ReturnType<typeof api>["admin"]["verificationQueue"]>
>["verifications"][number];

export const GESTURE_LABELS: Record<VerificationGesture, string> = {
  peace: "V avec deux doigts",
  thumbs_up: "Pouce levé",
  hand_on_head: "Main sur le haut de la tête",
  three_fingers: "Trois doigts",
  point_up: "Doigt pointé vers le haut",
  ok_sign: "Signe OK",
  open_palm: "Paume ouverte face à l'objectif",
  hand_on_chin: "Main sous le menton",
};

export const VERIFICATION_REASON_LABELS: Record<VerificationRejection, string> = {
  gesture_mismatch: "Geste différent",
  face_mismatch: "Pas la même personne que sur les photos",
  unclear: "Flou, sombre ou visage caché",
  not_live: "Photo pas prise sur le moment",
};

/**
 * ONB-08: compare the selfie with the profile photos, by eye only (no face
 * recognition). A approve, R reject then 1 to 4. The selfie is deleted
 * whatever the decision.
 */
export function VerificationQueue({ initial, total }: { initial: QueuedVerification[]; total: number }) {
  const toast = useToast();
  const [items, setItems] = useState(initial);
  const [remaining, setRemaining] = useState(total);
  const [rejecting, setRejecting] = useState(false);
  const [pending, setPending] = useState(false);
  const current = items[0];

  const decide = useCallback(
    async (decision: { decision: "approve" } | { decision: "reject"; reason: VerificationRejection }) => {
      if (!current || pending) {
        return;
      }
      setPending(true);
      try {
        await api().admin.reviewVerification({ id: current.id, ...decision });
        setItems((list) => list.slice(1));
        setRemaining((count) => Math.max(0, count - 1));
        setRejecting(false);
        toast.show(decision.decision === "approve" ? "Photo vérifiée" : "Vérification refusée");
      } catch {
        toast.error("La décision n'a pas été enregistrée.");
      } finally {
        setPending(false);
      }
    },
    [current, pending, toast],
  );

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) {
        return;
      }
      if (rejecting) {
        const reason = VERIFICATION_REJECTIONS[Number(event.key) - 1];
        if (reason) {
          event.preventDefault();
          void decide({ decision: "reject", reason });
        } else if (event.key === "Escape") {
          setRejecting(false);
        }
        return;
      }
      if (event.key === "a") {
        void decide({ decision: "approve" });
      } else if (event.key === "r") {
        setRejecting(true);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [decide, rejecting]);

  if (!current) {
    return (
      <EmptyState
        icon={<ScanFace className="size-6" aria-hidden="true" />}
        title="Aucune vérification en attente"
        description="La file est vide."
      />
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <p className="text-lg">
          Geste demandé : <strong className="text-volt">{GESTURE_LABELS[current.gesture]}</strong>
        </p>
        <p className="text-paper/60 text-sm">
          <Link
            href={`/membres/${current.member.userId}` as Route}
            className="font-mono underline underline-offset-4"
          >
            {current.member.pseudonym}
          </Link>{" "}
          · {remaining} en attente
        </p>
      </div>
      <div className="grid gap-4 sm:grid-cols-[minmax(0,18rem)_1fr]">
        <figure className="flex flex-col gap-2">
          <div className="relative aspect-[4/5] overflow-hidden rounded-3xl bg-paper/5 ring-2 ring-volt/60">
            {/* biome-ignore lint/performance/noImgElement: signed, short-lived imgproxy URL */}
            <img
              src={current.selfieUrl}
              alt={`Selfie de vérification de ${current.member.pseudonym}`}
              className="size-full object-cover"
            />
            <ViewerWatermark />
          </div>
          <figcaption className="text-paper/60 text-sm">Selfie (supprimé après décision)</figcaption>
        </figure>
        <ul aria-label="Photos du profil" className="grid grid-cols-2 gap-3 md:grid-cols-3">
          {current.photos.map((photo, position) => (
            <li key={photo.id} className="relative aspect-[4/5] overflow-hidden rounded-2xl bg-paper/5">
              {/* biome-ignore lint/performance/noImgElement: signed, short-lived imgproxy URL */}
              <img
                src={photo.url}
                alt={`Emplacement ${position + 1} du profil`}
                className="size-full object-cover"
              />
              <ViewerWatermark />
            </li>
          ))}
        </ul>
      </div>
      <p className="text-paper/60 text-sm">
        Comparaison à l'œil uniquement. Raccourcis : <kbd className="font-mono">A</kbd> valider,{" "}
        <kbd className="font-mono">R</kbd> refuser puis <kbd className="font-mono">1</kbd>–
        <kbd className="font-mono">4</kbd>.
      </p>
      <div className="flex gap-3">
        <Button
          onClick={() => void decide({ decision: "approve" })}
          loading={pending && !rejecting}
          leadingIcon={<Check className="size-4" aria-hidden="true" />}
        >
          Valider
        </Button>
        <Button
          variant="outline"
          onClick={() => setRejecting((value) => !value)}
          aria-expanded={rejecting}
          leadingIcon={<X className="size-4" aria-hidden="true" />}
        >
          Refuser
        </Button>
      </div>
      {rejecting ? (
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-2 font-semibold">Motif du refus (envoyé à la personne)</legend>
          {VERIFICATION_REJECTIONS.map((reason, position) => (
            <button
              key={reason}
              type="button"
              disabled={pending}
              onClick={() => void decide({ decision: "reject", reason })}
              className="flex items-center gap-3 rounded-2xl border border-paper/15 px-4 py-3 text-left hover:bg-paper/5 focus-visible:outline-2 focus-visible:outline-volt"
            >
              <kbd className="font-mono text-paper/60">{position + 1}</kbd>
              {VERIFICATION_REASON_LABELS[reason]}
            </button>
          ))}
        </fieldset>
      ) : null}
    </div>
  );
}
