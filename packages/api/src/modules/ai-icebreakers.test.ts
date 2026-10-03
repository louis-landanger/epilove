import type Anthropic from "@anthropic-ai/sdk";
import { AI_ICEBREAKER_RULES } from "@epilove/core";
import { createDatabase, schema } from "@epilove/db";
import { cleanupTestMembers, createTestMember, prepareTestDatabase } from "@epilove/db/testing";
import { and, eq } from "drizzle-orm";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import {
  claudeIcebreakerModel,
  type IcebreakerOutcome,
  type IcebreakerRequest,
  icebreakerParams,
  setIcebreakerModel,
} from "../rencontre/ai-icebreakers";
import { createTestApi } from "../rencontre/testing";

const url = process.env.DATABASE_URL;

/** A model that records what it receives and answers what the test says. */
function fakeModel(answer: () => Promise<IcebreakerOutcome>) {
  const calls: IcebreakerRequest[] = [];
  setIcebreakerModel({
    suggest: (request) => {
      calls.push(request);
      return answer();
    },
  });
  return calls;
}

const message = (stop: Anthropic.StopReason, text: string): Anthropic.Message =>
  ({
    id: "msg_test",
    type: "message",
    role: "assistant",
    model: "claude-opus-5-5",
    content: [{ type: "text", text, citations: null }],
    stop_reason: stop,
    stop_sequence: null,
    stop_details:
      stop === "refusal" ? { type: "refusal", category: "general_harms", explanation: null } : null,
    usage: { input_tokens: 1, output_tokens: 1 },
  }) as unknown as Anthropic.Message;

describe("Claude adapter (CHAT-04)", () => {
  const request: IcebreakerRequest = {
    locale: "fr",
    viewer: { prompts: [{ question: "Mon spot", answer: "La BU" }], interests: ["Escalade"] },
    other: null,
  };

  it("asks claude-opus-5-5 with low effort and a JSON schema", () => {
    const params = icebreakerParams(request);
    expect(params.model).toBe("claude-opus-5-5");
    expect(params.output_config?.effort).toBe("low");
    expect(params.output_config?.format?.type).toBe("json_schema");
    expect(JSON.stringify(params.messages)).toContain("did not share their profile");
  });

  it("turns a refusal into an outcome, and a cut answer into an error", async () => {
    const refused = claudeIcebreakerModel(async () => message("refusal", ""));
    await expect(refused.suggest(request)).resolves.toEqual({ status: "refused" });
    const cut = claudeIcebreakerModel(async () => message("max_tokens", '{"suggestions":["a'));
    await expect(cut.suggest(request)).rejects.toThrow();
    const fine = claudeIcebreakerModel(async () =>
      message("end_turn", JSON.stringify({ suggestions: ["Ton spot préféré à la BU ?"] })),
    );
    await expect(fine.suggest(request)).resolves.toEqual({
      status: "ok",
      suggestions: ["Ton spot préféré à la BU ?"],
    });
  });
});

describe.skipIf(!url)("AI conversation starters (CHAT-04)", () => {
  const { db, close } = createDatabase(url ?? "", { maxConnections: 4 });
  const { as } = createTestApi(db);
  beforeAll(() => prepareTestDatabase(db));
  afterEach(() => {
    setIcebreakerModel(undefined);
    vi.unstubAllEnvs();
  });
  afterAll(async () => {
    await cleanupTestMembers(db);
    await close();
  });

  const enable = () => {
    vi.stubEnv("AI_ICEBREAKERS_ENABLED", "1");
    vi.stubEnv("ANTHROPIC_API_KEY", "test-key");
  };

  async function pair(options: { otherPrompts?: string[] } = {}) {
    const ada = await createTestMember(db, {
      firstName: "Ada",
      graduationYear: 2038,
      prompts: ["Moi c'est Ada, écris-moi à ada@exemple.fr : je grimpe tous les jeudis"],
    });
    const lin = await createTestMember(db, {
      firstName: "Lin",
      graduationYear: 2038,
      prompts: options.otherPrompts ?? ["Lin ne rate jamais un concert de jazz"],
    });
    const [userLow, userHigh] = [ada, lin].sort() as [string, string];
    const [created] = await db
      .insert(schema.match)
      .values({ userLow, userHigh, mode: "friends", source: "like" })
      .returning({ id: schema.match.id });
    return { ada, lin, matchId: created?.id ?? "" };
  }

  it("is off without the flag and the API key, whatever the consent", async () => {
    const { ada, matchId } = await pair();
    const calls = fakeModel(async () => ({ status: "ok", suggestions: ["Salut !"] }));
    expect(await as(ada).messaging.aiConsent()).toEqual({ available: false, consented: false });
    expect((await as(ada).messaging.thread({ matchId, locale: "fr" })).aiIcebreakers).toBeNull();
    await expect(as(ada).messaging.setAiConsent({ consent: true })).rejects.toMatchObject({
      message: "ai_disabled",
    });
    vi.stubEnv("AI_ICEBREAKERS_ENABLED", "1");
    await expect(as(ada).messaging.aiIcebreakers({ matchId, locale: "fr" })).rejects.toMatchObject({
      message: "ai_disabled",
    });
    expect(calls).toEqual([]);
  });

  it("needs the member's consent, recorded and withdrawable", async () => {
    enable();
    const { ada, matchId } = await pair();
    const calls = fakeModel(async () => ({
      status: "ok",
      suggestions: ["Escalade en salle ou en falaise ?"],
    }));
    expect((await as(ada).messaging.thread({ matchId, locale: "fr" })).aiIcebreakers).toEqual({
      consented: false,
    });
    await expect(as(ada).messaging.aiIcebreakers({ matchId, locale: "fr" })).rejects.toMatchObject({
      message: "consent_required",
    });

    expect(await as(ada).messaging.setAiConsent({ consent: true })).toEqual({
      available: true,
      consented: true,
    });
    await as(ada).messaging.setAiConsent({ consent: true });
    const granted = await db
      .select()
      .from(schema.consent)
      .where(and(eq(schema.consent.userId, ada), eq(schema.consent.kind, "ai_features")));
    expect(granted).toHaveLength(1);
    expect(granted[0]?.version).toBe(AI_ICEBREAKER_RULES.consentVersion);

    const result = await as(ada).messaging.aiIcebreakers({ matchId, locale: "fr" });
    expect(result).toEqual({ status: "ok", suggestions: ["Escalade en salle ou en falaise ?"] });
    expect(calls).toHaveLength(1);

    await as(ada).messaging.setAiConsent({ consent: false });
    expect((await as(ada).messaging.thread({ matchId, locale: "fr" })).aiIcebreakers).toEqual({
      consented: false,
    });
    const history = await db
      .select()
      .from(schema.consent)
      .where(and(eq(schema.consent.userId, ada), eq(schema.consent.kind, "ai_features")));
    expect(history.every((c) => c.withdrawnAt !== null)).toBe(true);
  });

  it("sends pseudonymised excerpts, and the other's only if they consented", async () => {
    enable();
    const { ada, lin, matchId } = await pair();
    const calls = fakeModel(async () => ({
      status: "ok",
      suggestions: ["Un concert de jazz à conseiller ?"],
    }));
    await as(ada).messaging.setAiConsent({ consent: true });

    await as(ada).messaging.aiIcebreakers({ matchId, locale: "fr" });
    expect(calls[0]?.other).toBeNull();
    const sent = JSON.stringify(calls[0]);
    expect(sent).not.toMatch(/Ada|Lin|ada@exemple\.fr|jazz/);
    expect(sent).toContain("[prénom]");
    expect(sent).toContain("[contact]");
    expect(sent).toContain("je grimpe tous les jeudis");

    await as(lin).messaging.setAiConsent({ consent: true });
    await as(ada).messaging.aiIcebreakers({ matchId, locale: "fr" });
    const both = JSON.stringify(calls[1]);
    expect(both).toContain("ne rate jamais un concert de jazz");
    expect(both).not.toMatch(/Ada|Lin|ada@exemple\.fr/);
  });

  it("filters the suggestions and handles a refusal", async () => {
    enable();
    const { ada, matchId } = await pair();
    await as(ada).messaging.setAiConsent({ consent: true });

    fakeModel(async () => ({
      status: "ok",
      suggestions: ["Salut Lin !", "Ajoute-moi sur insta", "Ton album de jazz préféré ?"],
    }));
    expect(await as(ada).messaging.aiIcebreakers({ matchId, locale: "fr" })).toEqual({
      status: "ok",
      suggestions: ["Ton album de jazz préféré ?"],
    });
    fakeModel(async () => ({ status: "ok", suggestions: ["Salut [prénom] !"] }));
    expect(await as(ada).messaging.aiIcebreakers({ matchId, locale: "fr" })).toEqual({
      status: "empty",
      suggestions: [],
    });
    fakeModel(async () => ({ status: "refused" }));
    expect(await as(ada).messaging.aiIcebreakers({ matchId, locale: "fr" })).toEqual({
      status: "refused",
      suggestions: [],
    });
  });

  it("limits requests per day, and gives a request back when the model fails", async () => {
    enable();
    const { ada, matchId } = await pair();
    await as(ada).messaging.setAiConsent({ consent: true });

    fakeModel(async () => {
      throw new Error("network down");
    });
    for (let i = 0; i < AI_ICEBREAKER_RULES.dailyLimit + 1; i++) {
      await expect(as(ada).messaging.aiIcebreakers({ matchId, locale: "fr" })).rejects.toMatchObject({
        message: "ai_unavailable",
      });
    }

    fakeModel(async () => ({ status: "ok", suggestions: ["Ton spot préféré pour réviser ?"] }));
    const attempts = await Promise.allSettled(
      Array.from({ length: AI_ICEBREAKER_RULES.dailyLimit + 2 }, () =>
        as(ada).messaging.aiIcebreakers({ matchId, locale: "fr" }),
      ),
    );
    expect(attempts.filter((a) => a.status === "fulfilled")).toHaveLength(AI_ICEBREAKER_RULES.dailyLimit);
    expect(
      attempts.filter((a) => a.status === "rejected" && /quota_exceeded/.test(String(a.reason?.message))),
    ).toHaveLength(2);
  });

  it("refuses a conversation the member may not write in", async () => {
    enable();
    const { matchId } = await pair();
    const stranger = await createTestMember(db, { graduationYear: 2038 });
    const calls = fakeModel(async () => ({ status: "ok", suggestions: ["Salut !"] }));
    await as(stranger).messaging.setAiConsent({ consent: true });
    await expect(as(stranger).messaging.aiIcebreakers({ matchId, locale: "fr" })).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
    expect(calls).toEqual([]);
  });
});
