import { schema } from "@epilove/db";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestApi, insertActiveMember, insertMember } from "../test-support";

const url = process.env.DATABASE_URL;

/** Needs a disposable PostgreSQL (`pnpm services:up` locally, a service container in CI). */
describe.skipIf(!url)("own profile", () => {
  const api = createTestApi(url ?? "");
  beforeAll(api.prepare);
  afterAll(api.close);

  it("is only available once the onboarding is done", async () => {
    const client = api.clientFor(await insertMember(api.db));
    await expect(client.profile.me()).rejects.toMatchObject({ code: "NO_PROFILE" });
    await expect(client.profile.update({ pronouns: "il" })).rejects.toMatchObject({ code: "NO_PROFILE" });
  });

  it("returns the profile with its age and completeness", async () => {
    const client = api.clientFor(await insertActiveMember(api.db));
    const me = await client.profile.me();
    expect(me).toMatchObject({
      firstName: "Alex",
      age: 23,
      gender: "man",
      schoolSlug: "epita",
      modes: ["friends"],
      completeness: { score: 0 },
    });
    expect(me.completeness.tips[0]).toBe("add_photo");
  });

  it("edits basic information and keeps the account name in sync", async () => {
    const userId = await insertActiveMember(api.db);
    const client = api.clientFor(userId);
    const updated = await client.profile.update({
      firstName: "  Alexandre ",
      pronouns: "il/lui",
      program: " MSc   IA ",
      graduationYear: 2029,
      languages: ["fr", "en", "fr"],
      intentions: ["friendship"],
    });
    expect(updated).toMatchObject({
      firstName: "Alexandre",
      pronouns: "il/lui",
      program: "MSc IA",
      graduationYear: 2029,
      languages: ["fr", "en"],
      intentions: ["friendship"],
    });
    expect(updated.completeness.score).toBe(10);
    const [account] = await api.db
      .select({ name: schema.appUser.name })
      .from(schema.appUser)
      .where(eq(schema.appUser.id, userId));
    expect(account?.name).toBe("Alexandre");

    await expect(client.profile.update({ firstName: "x@y" })).rejects.toMatchObject({
      code: "INVALID_VALUE",
      data: { field: "firstName" },
    });
    await expect(client.profile.update({ graduationYear: 1999 })).rejects.toMatchObject({
      code: "INVALID_VALUE",
      data: { field: "graduationYear" },
    });
    expect((await client.profile.update({ pronouns: null })).pronouns).toBeNull();
  });

  it("replaces prompts and interests from the catalogues only", async () => {
    const client = api.clientFor(await insertActiveMember(api.db));
    const catalog = await client.profile.catalog();
    const prompts = catalog.prompts.slice(3, 6);
    const answers = prompts.map((prompt, index) => ({ promptId: prompt.id, text: `Réponse ${index}` }));
    const withPrompts = await client.profile.setPrompts({ answers });
    expect(withPrompts.promptAnswers).toEqual(answers);
    expect(withPrompts.completeness.score).toBe(25);

    await expect(
      client.profile.setPrompts({
        answers: [0, 0, 1].map((index) => ({ promptId: prompts[index]?.id ?? "", text: "Doublon" })),
      }),
    ).rejects.toMatchObject({ code: "INVALID_VALUE", data: { field: "promptId" } });

    const ids = catalog.interests.slice(10, 15).map((item) => item.id);
    expect((await client.profile.setInterests({ interestIds: ids })).interestIds.sort()).toEqual(
      [...ids].sort(),
    );
    await expect(
      client.profile.setInterests({
        interestIds: [ids[0] ?? "", "01920000-0000-7000-8000-000000000999", ids[1] ?? ""],
      }),
    ).rejects.toMatchObject({ code: "INVALID_VALUE", data: { field: "interestIds" } });
  });

  it("stores photo text alternatives and counts them", async () => {
    const userId = await insertActiveMember(api.db);
    const client = api.clientFor(userId);
    const { photoId, upload } = await client.media.requestUpload({ contentType: "image/jpeg", size: 10 });
    await api.storage.write(upload.fields.key ?? "", new Uint8Array(10), "image/jpeg");
    await client.media.confirmUpload({ photoId });

    const photo = await client.media.setAltText({ photoId, altText: "  Moi au   parc de la Tête d'Or " });
    expect(photo.altText).toBe("Moi au parc de la Tête d'Or");
    const me = await client.profile.me();
    expect(me.completeness.tips).not.toContain("add_alt_text");
    expect((await client.media.setAltText({ photoId, altText: "" })).altText).toBeNull();

    const other = api.clientFor(await insertActiveMember(api.db));
    await expect(other.media.setAltText({ photoId, altText: "volé" })).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
  });

  it("searches songs through the server and stores the one looked up again", async () => {
    const client = api.clientFor(await insertActiveMember(api.db));
    const { songs } = await client.profile.searchSongs({ query: "angele" });
    expect(songs[0]?.title).toBe("Une seule vie");
    const before = (await client.profile.me()).completeness.score;
    const withSong = await client.profile.setAnthem({ trackId: "42" });
    expect(withSong.anthem).toMatchObject({ trackId: "42", artist: "Angèle" });
    expect(withSong.completeness.score).toBe(before + 5);
    await expect(client.profile.setAnthem({ trackId: "999" })).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect((await client.profile.setAnthem({ trackId: null })).anthem).toBeNull();
  });
});
