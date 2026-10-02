import { z } from "zod";

/** "Mon son du moment" (PRO-07): a 30-second preview with mandatory attribution. */
export interface Song {
  readonly provider: "itunes";
  readonly trackId: string;
  readonly title: string;
  readonly artist: string;
  readonly artworkUrl: string;
  readonly previewUrl: string;
  /** Link back to the store page: required attribution. */
  readonly trackViewUrl: string;
}

export interface MusicCatalog {
  search(query: string): Promise<Song[]>;
  lookup(trackId: string): Promise<Song | null>;
}

const APPLE_HOST = /^https:\/\/([a-z0-9-]+\.)*(apple\.com|mzstatic\.com)\//;
const appleUrl = z.string().regex(APPLE_HOST);

const itunesTrack = z.object({
  kind: z.literal("song"),
  trackId: z.number(),
  trackName: z.string(),
  artistName: z.string(),
  artworkUrl100: appleUrl,
  previewUrl: appleUrl,
  trackViewUrl: appleUrl,
});

const itunesResponse = z.object({ results: z.array(z.unknown()) });

function toSong(raw: unknown): Song | null {
  const parsed = itunesTrack.safeParse(raw);
  if (!parsed.success) {
    return null;
  }
  const track = parsed.data;
  return {
    provider: "itunes",
    trackId: String(track.trackId),
    title: track.trackName.slice(0, 200),
    artist: track.artistName.slice(0, 200),
    artworkUrl: track.artworkUrl100.replace("/100x100bb.", "/300x300bb."),
    previewUrl: track.previewUrl,
    trackViewUrl: track.trackViewUrl,
  };
}

/**
 * iTunes Search API, called from the server so members' IP addresses never
 * reach Apple. Results are not cached (Apple's terms for previews).
 */
export function createItunesCatalog(fetcher: typeof fetch = fetch, country = "FR"): MusicCatalog {
  async function get(url: string) {
    const response = await fetcher(url, {
      signal: AbortSignal.timeout(5000),
      headers: { accept: "application/json" },
    });
    if (!response.ok) {
      throw new Error(`iTunes answered ${response.status}`);
    }
    return itunesResponse.parse(await response.json()).results.flatMap((item) => toSong(item) ?? []);
  }
  return {
    async search(query) {
      const term = encodeURIComponent(query.trim().slice(0, 100));
      return get(
        `https://itunes.apple.com/search?term=${term}&media=music&entity=song&limit=12&country=${country}`,
      );
    },
    async lookup(trackId) {
      if (!/^\d{1,15}$/.test(trackId)) {
        return null;
      }
      const [song] = await get(`https://itunes.apple.com/lookup?id=${trackId}&country=${country}`);
      return song ?? null;
    },
  };
}
