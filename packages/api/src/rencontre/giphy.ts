import { z } from "zod";

/**
 * GIPHY (CHAT-05), behind a flag: active only when GIPHY_API_KEY is set.
 * Only search terms and GIF ids go to GIPHY, never a member id; GIFs are
 * fetched again by id before being sent, so a client cannot inject an
 * arbitrary URL in a conversation.
 */
const GIPHY_API = "https://api.giphy.com/v1/gifs";

const image = z.object({ url: z.string().url(), width: z.coerce.number(), height: z.coerce.number() });
const gif = z.object({
  id: z.string(),
  title: z.string().default(""),
  images: z.object({ fixed_width: image }),
});

export interface Gif {
  readonly id: string;
  readonly url: string;
  readonly width: number;
  readonly height: number;
  readonly title: string;
}

let fetcher: typeof fetch = (...args) => fetch(...args);

/** Tests replace the network. */
export function setGiphyFetch(next: typeof fetch | undefined) {
  fetcher = next ?? ((...args) => fetch(...args));
}

export const giphyEnabled = (env: Record<string, string | undefined> = process.env) =>
  Boolean(env.GIPHY_API_KEY);

const toGif = (raw: z.infer<typeof gif>): Gif | null => {
  const url = new URL(raw.images.fixed_width.url);
  // Only GIPHY's media hosts are ever displayed.
  if (url.protocol !== "https:" || !/(^|\.)giphy\.com$/.test(url.hostname)) {
    return null;
  }
  return {
    id: raw.id,
    url: url.toString(),
    width: Math.round(raw.images.fixed_width.width),
    height: Math.round(raw.images.fixed_width.height),
    title: raw.title.slice(0, 120),
  };
};

async function call(path: string, params: Record<string, string>) {
  const key = process.env.GIPHY_API_KEY;
  if (!key) {
    return null;
  }
  const query = new URLSearchParams({ api_key: key, ...params });
  const response = await fetcher(`${GIPHY_API}${path}?${query}`, { headers: { accept: "application/json" } });
  if (!response.ok) {
    throw new Error(`GIPHY ${path} failed: HTTP ${response.status}`);
  }
  return (await response.json()) as unknown;
}

export async function searchGifs(query: string): Promise<Gif[]> {
  const body = await call("/search", { q: query, limit: "24", rating: "pg-13", lang: "fr" });
  const parsed = z.object({ data: z.array(z.unknown()) }).safeParse(body);
  if (!parsed.success) {
    return [];
  }
  return parsed.data.data.flatMap((item) => {
    const result = gif.safeParse(item);
    const value = result.success ? toGif(result.data) : null;
    return value ? [value] : [];
  });
}

export async function gifById(id: string): Promise<Gif | null> {
  const body = await call(`/${encodeURIComponent(id)}`, {});
  const parsed = z.object({ data: gif }).safeParse(body);
  return parsed.success ? toGif(parsed.data.data) : null;
}
