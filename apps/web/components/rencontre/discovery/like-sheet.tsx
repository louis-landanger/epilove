"use client";

import { DISCOVERY_RULES } from "@epilove/core";
import { useTranslations } from "next-intl";
import { useEffect, useId, useState } from "react";
import { Sheet } from "../ui/sheet";
import type { LikedContent } from "./member-card";

export interface LikeRequest {
  readonly name: string;
  readonly content: LikedContent | null;
  /** Opened with a swipe up / ↑: starts as a crush. */
  readonly superlike: boolean;
}

/** Targeted like with an optional comment, or a crush with a required one (DEC-02). */
export function LikeSheet({
  request,
  superlikesLeft,
  pending,
  error,
  onCancel,
  onSend,
}: {
  request: LikeRequest | null;
  superlikesLeft: number;
  pending: boolean;
  error: string | null;
  onCancel: () => void;
  onSend: (comment: string, superlike: boolean) => void;
}) {
  const t = useTranslations("discovery.likeSheet");
  const titleId = useId();
  const commentId = useId();
  const hintId = useId();
  const [comment, setComment] = useState("");
  const [superlike, setSuperlike] = useState(false);

  useEffect(() => {
    if (request) {
      setComment("");
      setSuperlike(request.superlike && superlikesLeft > 0);
    }
  }, [request, superlikesLeft]);

  const max = DISCOVERY_RULES.commentMaxLength;
  const canSend = !pending && comment.length <= max && (!superlike || comment.trim().length > 0);
  const content = request?.content;

  return (
    <Sheet open={request !== null} onClose={onCancel} labelledBy={titleId}>
      <h2 id={titleId} className="font-display font-semibold text-2xl">
        {superlike
          ? t("superTitle", { name: request?.name ?? "" })
          : t("title", { name: request?.name ?? "" })}
      </h2>
      {content?.type === "photo" && (
        <figure className="flex items-center gap-3">
          {/* biome-ignore lint/performance/noImgElement: signed imgproxy URL. */}
          <img src={content.url} alt="" className="h-24 w-20 rounded-2xl object-cover" />
          <figcaption className="text-paper/60 text-sm">{t("photo")}</figcaption>
        </figure>
      )}
      {content?.type === "prompt" && (
        <figure className="rounded-2xl border border-paper/10 bg-paper/5 p-4">
          <figcaption className="text-paper/60 text-xs">{content.question}</figcaption>
          <blockquote className="mt-1 font-serif text-lg italic">{content.answer}</blockquote>
        </figure>
      )}
      <form
        className="flex flex-col gap-4"
        onSubmit={(event) => {
          event.preventDefault();
          if (canSend) {
            onSend(comment.trim(), superlike);
          }
        }}
      >
        <label htmlFor={commentId} className="flex flex-col gap-2">
          <span className="font-semibold text-sm">{t("commentLabel")}</span>
          <textarea
            id={commentId}
            aria-describedby={hintId}
            value={comment}
            maxLength={max}
            rows={3}
            onChange={(event) => setComment(event.target.value)}
            placeholder={t("placeholder")}
            className="resize-none rounded-2xl border border-paper/20 bg-transparent p-3 text-paper placeholder:text-paper/40 focus:border-volt focus:outline-none"
          />
        </label>
        <div id={hintId} className="flex justify-between text-paper/50 text-xs">
          <span>{superlike ? t("commentRequired") : t("commentOptional")}</span>
          <span className="font-mono">{t("remaining", { count: comment.length })}</span>
        </div>
        <label className={`flex items-center gap-3 text-sm ${superlikesLeft === 0 ? "opacity-50" : ""}`}>
          <input
            type="checkbox"
            checked={superlike}
            disabled={superlikesLeft === 0}
            onChange={(event) => setSuperlike(event.target.checked)}
            className="size-5 accent-[var(--color-plasma)]"
          />
          {t("superToggle")}
        </label>
        {error && (
          <p role="alert" className="text-plasma text-sm">
            {error}
          </p>
        )}
        <div className="flex gap-3">
          <button type="button" onClick={onCancel} className="rounded-full border border-paper/20 px-5 py-3">
            {t("cancel")}
          </button>
          <button
            type="submit"
            disabled={!canSend}
            className="ml-auto rounded-full bg-plasma px-6 py-3 font-semibold text-ink disabled:opacity-40"
          >
            {superlike ? t("sendSuper") : t("send")}
          </button>
        </div>
      </form>
    </Sheet>
  );
}
