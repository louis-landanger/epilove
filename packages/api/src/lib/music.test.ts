import { describe, expect, it } from "vitest";
import { createItunesCatalog } from "./music";

const track = {
  kind: "song",
  trackId: 42,
  trackName: "Une seule vie",
  artistName: "Angèle",
  artworkUrl100: "https://is1-ssl.mzstatic.com/image/thumb/x/100x100bb.jpg",
  previewUrl: "https://audio-ssl.itunes.apple.com/preview.m4a",
  trackViewUrl: "https://music.apple.com/fr/album/x?i=42",
};

function fakeFetch(results: unknown[]): typeof fetch {
  return (async () => new Response(JSON.stringify({ resultCount: results.length, results }))) as typeof fetch;
}

describe("iTunes catalogue", () => {
  it("maps tracks and enlarges the artwork", async () => {
    const [song] = await createItunesCatalog(fakeFetch([track])).search("angele");
    expect(song).toEqual({
      provider: "itunes",
      trackId: "42",
      title: "Une seule vie",
      artist: "Angèle",
      artworkUrl: "https://is1-ssl.mzstatic.com/image/thumb/x/300x300bb.jpg",
      previewUrl: "https://audio-ssl.itunes.apple.com/preview.m4a",
      trackViewUrl: "https://music.apple.com/fr/album/x?i=42",
    });
  });

  it("drops anything that is not a song served by Apple", async () => {
    const songs = await createItunesCatalog(
      fakeFetch([
        { ...track, kind: "music-video" },
        { ...track, previewUrl: "https://evil.example/preview.m4a" },
        { ...track, artworkUrl100: "javascript:alert(1)" },
        { wrapperType: "artist" },
      ]),
    ).search("x");
    expect(songs).toEqual([]);
  });

  it("refuses malformed track ids before calling Apple", async () => {
    let called = false;
    const catalog = createItunesCatalog((async () => {
      called = true;
      return new Response("{}");
    }) as typeof fetch);
    expect(await catalog.lookup("../../etc")).toBeNull();
    expect(called).toBe(false);
  });
});
