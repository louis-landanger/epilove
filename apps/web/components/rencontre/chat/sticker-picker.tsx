"use client";

import type { StickerId } from "@atomes/core";
import { STICKERS } from "@atomes/core";
import { useTranslations } from "next-intl";
import { useEffect, useId, useState } from "react";
import { api } from "@/lib/api-client";
import { StickerArt } from "./stickers";

export interface PickedGif {
  readonly id: string;
  readonly url: string;
  readonly width: number;
  readonly height: number;
  readonly title: string;
}

/**
 * Sticker and GIF picker (CHAT-05). House stickers first; the GIF tab only
 * appears when the server has GIPHY enabled, with GIPHY's attribution.
 */
export function StickerPicker({
  onSticker,
  onGif,
}: {
  onSticker: (id: StickerId) => void;
  onGif: (gif: PickedGif) => void;
}) {
  const t = useTranslations("chat.stickers");
  const searchId = useId();
  const [tab, setTab] = useState<"stickers" | "gifs">("stickers");
  const [gifsEnabled, setGifsEnabled] = useState(false);
  const [query, setQuery] = useState("");
  const [gifs, setGifs] = useState<PickedGif[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    api.messaging
      .gifs({ query: "" })
      .then((result) => setGifsEnabled(result.enabled))
      .catch(() => setGifsEnabled(false));
  }, []);

  useEffect(() => {
    if (tab !== "gifs" || !query.trim()) {
      setGifs([]);
      return;
    }
    setLoading(true);
    const timer = window.setTimeout(() => {
      api.messaging
        .gifs({ query })
        .then((result) => setGifs(result.gifs))
        .catch(() => setGifs([]))
        .finally(() => setLoading(false));
    }, 400);
    return () => window.clearTimeout(timer);
  }, [tab, query]);

  return (
    <div className="mb-3 flex flex-col gap-3 rounded-3xl border border-paper/10 bg-paper/[0.03] p-3">
      {gifsEnabled && (
        <div role="tablist" aria-label={t("title")} className="flex gap-2">
          {(["stickers", "gifs"] as const).map((value) => (
            <button
              key={value}
              type="button"
              role="tab"
              aria-selected={tab === value}
              onClick={() => setTab(value)}
              className="rounded-full px-3 py-1 text-sm aria-selected:bg-paper aria-selected:text-ink"
            >
              {t(value)}
            </button>
          ))}
        </div>
      )}
      {tab === "stickers" ? (
        <ul
          className="grid max-h-56 grid-cols-4 gap-2 overflow-y-auto sm:grid-cols-6"
          aria-label={t("title")}
        >
          {STICKERS.map((id) => (
            <li key={id}>
              <button
                type="button"
                onClick={() => onSticker(id)}
                className="aspect-square w-full rounded-2xl p-1.5 transition hover:scale-105 hover:bg-paper/10 focus-visible:outline-2 focus-visible:outline-volt"
              >
                <StickerArt id={id} label={t(`names.${id}`)} />
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <div className="flex flex-col gap-2">
          <label htmlFor={searchId} className="sr-only">
            {t("search")}
          </label>
          <input
            id={searchId}
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t("search")}
            maxLength={50}
            className="rounded-full border border-paper/20 bg-transparent px-4 py-2 text-sm outline-none focus-visible:border-volt"
          />
          <ul className="grid max-h-56 grid-cols-3 gap-2 overflow-y-auto" aria-busy={loading}>
            {gifs.map((gif) => (
              <li key={gif.id}>
                <button
                  type="button"
                  onClick={() => onGif(gif)}
                  className="block w-full overflow-hidden rounded-xl"
                >
                  {/* biome-ignore lint/performance/noImgElement: GIPHY serves the GIFs. */}
                  <img
                    src={gif.url}
                    alt={gif.title}
                    width={gif.width}
                    height={gif.height}
                    className="h-24 w-full object-cover"
                  />
                </button>
              </li>
            ))}
          </ul>
          <p className="text-right text-paper/60 text-xs">{t("giphy")}</p>
        </div>
      )}
    </div>
  );
}
