"use client";

import { PHOTO_REJECTION_REASONS } from "@epilove/contracts";
import { Button, cn, EmptyState, useToast } from "@epilove/ui";
import { Check, ImageOff, X } from "lucide-react";
import type { Route } from "next";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api-client";

type QueuedPhoto = Awaited<ReturnType<ReturnType<typeof api>["admin"]["photoQueue"]>>["photos"][number];
type Reason = (typeof PHOTO_REJECTION_REASONS)[number];

export const REASON_LABELS: Record<Reason, string> = {
  no_face: "Visage non visible",
  not_a_person: "Ne représente pas la personne",
  explicit: "Contenu sexuel",
  violence: "Violence ou armes",
  minor: "Personne mineure",
  contact_details: "Coordonnées ou pseudo",
  stolen: "Photo volée ou de célébrité",
  low_quality: "Floue ou trop sombre",
};

/** ADM-01: one photo at a time, decided with a key (A approve, R reject, 1 to 8 for the reason). */
export function PhotoQueue({ initial, total }: { initial: QueuedPhoto[]; total: number }) {
  const toast = useToast();
  const [photos, setPhotos] = useState(initial);
  const [remaining, setRemaining] = useState(total);
  const [index, setIndex] = useState(0);
  const [rejecting, setRejecting] = useState(false);
  const [pending, setPending] = useState(false);
  const current = photos[index];

  const decide = useCallback(
    async (decision: { decision: "approve" } | { decision: "reject"; reason: Reason }) => {
      if (!current || pending) {
        return;
      }
      setPending(true);
      try {
        await api().admin.moderatePhoto({ photoId: current.id, ...decision });
        setPhotos((list) => list.filter((photo) => photo.id !== current.id));
        setRemaining((count) => Math.max(0, count - 1));
        setIndex((value) => Math.min(value, Math.max(0, photos.length - 2)));
        setRejecting(false);
        toast.show(decision.decision === "approve" ? "Photo validée" : "Photo refusée");
      } catch {
        toast.error("La décision n'a pas été enregistrée.");
      } finally {
        setPending(false);
      }
    },
    [current, pending, photos.length, toast],
  );

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) {
        return;
      }
      if (rejecting) {
        const reason = PHOTO_REJECTION_REASONS[Number(event.key) - 1];
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
      } else if (event.key === "j" || event.key === "ArrowRight") {
        setIndex((value) => Math.min(value + 1, photos.length - 1));
      } else if (event.key === "k" || event.key === "ArrowLeft") {
        setIndex((value) => Math.max(value - 1, 0));
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [decide, rejecting, photos.length]);

  if (!current) {
    return (
      <EmptyState
        icon={<ImageOff className="size-6" aria-hidden="true" />}
        title="Aucune photo en attente"
        description="La file est vide. Bien joué."
      />
    );
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,22rem)_1fr]">
      <figure className="flex flex-col gap-3">
        <div className="relative aspect-[4/5] overflow-hidden rounded-3xl bg-paper/5">
          {/* biome-ignore lint/performance/noImgElement: signed, short-lived imgproxy URL */}
          <img
            src={current.url}
            alt={`Emplacement ${current.position + 1} de ${current.member.pseudonym}`}
            className="size-full object-cover"
          />
        </div>
        <figcaption className="flex items-center justify-between text-paper/60 text-sm">
          <Link
            href={`/membres/${current.member.userId}` as Route}
            className="font-mono underline underline-offset-4"
          >
            {current.member.pseudonym}
          </Link>
          <span>
            {index + 1} / {photos.length} · {remaining} en attente
          </span>
        </figcaption>
      </figure>
      <div className="flex flex-col gap-4">
        <p className="text-paper/60 text-sm">
          Raccourcis : <kbd className="font-mono">A</kbd> valider, <kbd className="font-mono">R</kbd> refuser
          puis <kbd className="font-mono">1</kbd>–<kbd className="font-mono">8</kbd>,{" "}
          <kbd className="font-mono">J</kbd>/<kbd className="font-mono">K</kbd> naviguer.
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
            {PHOTO_REJECTION_REASONS.map((reason, position) => (
              <button
                key={reason}
                type="button"
                disabled={pending}
                onClick={() => void decide({ decision: "reject", reason })}
                className={cn(
                  "flex items-center gap-3 rounded-2xl border border-paper/10 px-4 py-2.5 text-left text-sm transition-colors hover:border-danger/60 hover:bg-danger/10",
                )}
              >
                <kbd className="font-mono text-paper/50">{position + 1}</kbd>
                {REASON_LABELS[reason]}
              </button>
            ))}
          </fieldset>
        ) : null}
        <ul className="mt-2 flex flex-wrap gap-2" aria-label="Photos de la file">
          {photos.map((photo, position) => (
            <li key={photo.id}>
              <button
                type="button"
                onClick={() => setIndex(position)}
                aria-label={`Photo ${position + 1} de la file`}
                aria-current={position === index}
                className={cn(
                  "block h-20 w-16 overflow-hidden rounded-xl border-2",
                  position === index ? "border-plasma" : "border-transparent opacity-60 hover:opacity-100",
                )}
              >
                {/* biome-ignore lint/performance/noImgElement: thumbnails of signed URLs */}
                <img src={photo.url} alt="" className="size-full object-cover" />
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
