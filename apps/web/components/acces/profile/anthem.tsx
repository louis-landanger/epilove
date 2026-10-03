"use client";

import type { OwnProfile, SongInfo } from "@epilove/contracts";
import { Button, Spinner, TextField, useToast } from "@epilove/ui";
import { Music2, Pause, Play, Search } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";
import { api, errorCode } from "@/lib/api-client";

/** Plays one preview at a time across the page. */
let playing: HTMLAudioElement | null = null;

function PreviewButton({ song }: { song: SongInfo }) {
  const t = useTranslations("profile.anthem");
  const audio = useRef<HTMLAudioElement>(null);
  const [on, setOn] = useState(false);
  return (
    <>
      <button
        type="button"
        aria-label={on ? t("pause") : t("play", { title: song.title })}
        aria-pressed={on}
        onClick={() => {
          const element = audio.current;
          if (!element) return;
          if (on) {
            element.pause();
          } else {
            if (playing && playing !== element) playing.pause();
            playing = element;
            void element.play();
          }
        }}
        className="inline-flex size-10 shrink-0 items-center justify-center rounded-full bg-paper text-ink transition-transform hover:scale-105 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-volt"
      >
        {on ? (
          <Pause className="size-4" aria-hidden="true" />
        ) : (
          <Play className="size-4 translate-x-px" aria-hidden="true" />
        )}
      </button>
      {/* biome-ignore lint/a11y/useMediaCaption: 30-second music preview without speech */}
      <audio
        ref={audio}
        src={song.previewUrl}
        preload="none"
        onPlay={() => setOn(true)}
        onPause={() => setOn(false)}
        onEnded={() => setOn(false)}
      />
    </>
  );
}

/** The song card shown on a profile, with the attribution Apple requires. */
export function AnthemCard({ song }: { song: SongInfo }) {
  const t = useTranslations("profile.anthem");
  return (
    <figure className="flex items-center gap-4 rounded-[2rem] border border-paper/10 bg-paper/[0.03] p-4">
      {/* biome-ignore lint/performance/noImgElement: remote artwork from Apple, already sized */}
      <img src={song.artworkUrl} alt="" className="size-16 shrink-0 rounded-2xl object-cover" />
      <figcaption className="flex min-w-0 flex-1 flex-col">
        <span className="font-mono text-paper/50 text-xs uppercase tracking-[0.18em]">{t("title")}</span>
        <span className="truncate font-semibold">{song.title}</span>
        <span className="truncate text-paper/70 text-sm">{song.artist}</span>
        <a
          href={song.trackViewUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-1 text-paper/50 text-xs underline underline-offset-2 hover:text-paper"
        >
          {t("attribution")} · {t("open")}
        </a>
      </figcaption>
      <PreviewButton song={song} />
    </figure>
  );
}

/** Search and pick "Mon son du moment" (PRO-07). */
export function AnthemPicker({
  current,
  onSaved,
}: {
  current: SongInfo | null;
  onSaved: (profile: OwnProfile) => void;
}) {
  const t = useTranslations("profile.anthem");
  const toast = useToast();
  const [query, setQuery] = useState("");
  const [songs, setSongs] = useState<SongInfo[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const term = query.trim();
    if (term.length < 2) {
      setSongs(null);
      return;
    }
    const timer = setTimeout(async () => {
      setSearching(true);
      try {
        setSongs((await api.profile.searchSongs({ query: term })).songs);
        setError(null);
      } catch (caught) {
        setError(errorCode(caught) === "RATE_LIMITED" ? t("unavailable") : t("unavailable"));
      } finally {
        setSearching(false);
      }
    }, 350);
    return () => clearTimeout(timer);
  }, [query, t]);

  async function choose(trackId: string | null) {
    try {
      onSaved(await api.profile.setAnthem({ trackId }));
      if (trackId) {
        toast.success(t("saved"));
        setQuery("");
      }
    } catch {
      toast.error(t("unavailable"));
    }
  }

  return (
    <div className="flex flex-col gap-4">
      {current ? (
        <div className="flex flex-col gap-2">
          <AnthemCard song={current} />
          <Button variant="ghost" size="sm" className="self-start" onClick={() => void choose(null)}>
            {t("remove")}
          </Button>
        </div>
      ) : null}
      <div className="relative">
        <Search
          className="pointer-events-none absolute top-1/2 left-4 size-4 -translate-y-1/2 text-paper/50"
          aria-hidden="true"
        />
        <TextField
          label={<span className="sr-only">{t("search")}</span>}
          placeholder={t("search")}
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          inputClassName="pl-11"
          error={error}
        />
        {searching ? <Spinner className="absolute top-1/2 right-4 -translate-y-1/2 text-paper/60" /> : null}
      </div>
      {songs && songs.length === 0 ? <p className="text-paper/60 text-sm">{t("empty")}</p> : null}
      {songs && songs.length > 0 ? (
        <ul className="flex flex-col divide-y divide-paper/10" aria-live="polite">
          {songs.map((song) => (
            <li key={song.trackId} className="flex items-center gap-3 py-2.5">
              {/* biome-ignore lint/performance/noImgElement: remote artwork from Apple */}
              <img src={song.artworkUrl} alt="" className="size-12 shrink-0 rounded-xl object-cover" />
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="truncate text-sm">{song.title}</span>
                <span className="truncate text-paper/60 text-xs">{song.artist}</span>
              </span>
              <PreviewButton song={song} />
              <Button
                variant="outline"
                size="sm"
                onClick={() => void choose(song.trackId)}
                leadingIcon={<Music2 className="size-4" aria-hidden="true" />}
              >
                {t("choose")}
              </Button>
            </li>
          ))}
        </ul>
      ) : null}
      <p className="text-paper/40 text-xs">{t("attribution")}</p>
    </div>
  );
}
