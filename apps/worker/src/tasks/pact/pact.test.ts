import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { createDatabase, schema } from "@atomes/db";
import { enrolMembers, seasonById, upsertSeason } from "@atomes/db/repositories/pact";
import {
  answerQuestionnaire,
  cleanupTestMembers,
  createTestMember,
  prepareTestDatabase,
} from "@atomes/db/testing";
import { and, eq, inArray, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { computePact } from "./compute";
import { checkResponse, greedySolve, runPact } from "./pipeline";
import { revealPact } from "./reveal";
import { createSolver, type SolverRequest } from "./solver";
import { syntheticPact } from "./synthetic";

const noRelations = {
  hasBlocked: () => false,
  hasLiked: () => false,
  hasActiveMatch: () => false,
  hasEndedMatch: () => false,
};

describe("runPact", () => {
  const now = new Date("2026-10-02T12:00:00Z");
  const synthetic = syntheticPact(120, 3, now);

  it("matches each participant at most once per mode, above the threshold, with a radar per pair", async () => {
    const output = await runPact({
      participants: synthetic.participants,
      context: { today: "2026-10-02", relations: noRelations },
      threshold: 0.6,
      sectionOf: synthetic.sectionOf,
      sections: synthetic.sections,
      solve: greedySolve,
      random: () => 0.5,
    });
    expect(output.results.length).toBeGreaterThan(10);
    for (const mode of ["love", "friends"] as const) {
      const ids = output.results.filter((r) => r.mode === mode).flatMap((r) => [r.userLow, r.userHigh]);
      expect(new Set(ids).size).toBe(ids.length);
    }
    const pairs = output.results.map((r) => `${r.userLow}|${r.userHigh}`);
    expect(new Set(pairs).size).toBe(pairs.length);
    for (const result of output.results) {
      expect(result.userLow < result.userHigh).toBe(true);
      expect(result.score).toBeGreaterThanOrEqual(0.6);
      expect(result.explanation).toMatchObject({ sections: expect.any(Array) });
    }
    // The quality report is made of aggregates: no member id anywhere.
    const report = JSON.stringify(output.report);
    for (const participant of synthetic.participants) {
      expect(report).not.toContain(participant.member.id);
    }
  });
});

describe("checkResponse", () => {
  const request: SolverRequest = {
    threshold: 0.6,
    neighbours: 50,
    graphs: [
      {
        mode: "love",
        nodes: ["a", "b", "c"],
        edges: [
          ["a", "b", 0.8],
          ["b", "c", 0.7],
        ],
      },
      { mode: "friends", nodes: ["a", "b", "c"], edges: [["a", "b", 0.8]] },
    ],
  };
  const answer = (love: [string, string, number][], friends: [string, string, number][] = []) => ({
    graphs: [
      { mode: "love" as const, pairs: love, stats: {} },
      { mode: "friends" as const, pairs: friends, stats: {} },
    ],
  });

  it("accepts a valid matching", () => {
    expect(() => checkResponse(request, answer([["a", "b", 0.8]]))).not.toThrow();
  });

  it("rejects pairs that are not edges, members matched twice and pairs matched in two modes", () => {
    expect(() => checkResponse(request, answer([["a", "c", 0.9]]))).toThrow(/not an edge/);
    expect(() => checkResponse(request, answer([["a", "b", 0.95]]))).toThrow(/not an edge/);
    expect(() =>
      checkResponse(
        request,
        answer([
          ["a", "b", 0.8],
          ["b", "c", 0.7],
        ]),
      ),
    ).toThrow(/twice/);
    expect(() => checkResponse(request, answer([["a", "b", 0.8]], [["a", "b", 0.8]]))).toThrow(/two modes/);
  });
});

const hasUv = (() => {
  try {
    execFileSync("uv", ["--version"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
})();

describe.skipIf(!hasUv)("Python solver", () => {
  it("answers a request through stdin and stdout", async () => {
    const response = await createSolver()({
      threshold: 0.6,
      neighbours: 50,
      engine: "networkx",
      graphs: [
        {
          mode: "love",
          nodes: ["a", "b", "c", "d"],
          edges: [
            ["a", "b", 0.7],
            ["b", "c", 0.9],
            ["c", "d", 0.7],
          ],
        },
      ],
    });
    expect(response.graphs[0]?.pairs).toEqual([
      ["a", "b", 0.7],
      ["c", "d", 0.7],
    ]);
  }, 60_000);

  it("fails cleanly on an invalid request", async () => {
    await expect(
      createSolver()({ threshold: 2, neighbours: 50, graphs: [] } as SolverRequest),
    ).rejects.toThrow(/exit code 2/);
  }, 60_000);
});

const url = process.env.DATABASE_URL;

describe.skipIf(!url)("pact computation and reveal", () => {
  const { db, close } = createDatabase(url ?? "", { maxConnections: 4 });
  const seasons: string[] = [];
  beforeAll(() => prepareTestDatabase(db));
  afterAll(async () => {
    if (seasons.length > 0) {
      await db.delete(schema.pactSeason).where(inArray(schema.pactSeason.id, seasons));
    }
    await cleanupTestMembers(db);
    await close();
  });

  it("computes the results, then reveals them once, checking the policies again", async () => {
    const members = await Promise.all(
      ["Anaïs", "Basile", "Chloé", "Dylan"].map((firstName) => createTestMember(db, { firstName })),
    );
    for (const member of members) {
      await answerQuestionnaire(db, member);
    }
    const now = new Date();
    const day = 86_400_000;
    const seasonId = await upsertSeason(db, {
      slug: `test-${randomUUID()}`,
      name: "Pacte de test",
      opensAt: new Date(now.getTime() - 2 * day),
      closesAt: new Date(now.getTime() - day),
      revealAt: new Date(now.getTime() + day),
      status: "closed",
    });
    seasons.push(seasonId);
    await enrolMembers(
      db,
      seasonId,
      members.map((userId) => ({ userId, modes: ["love", "friends"] as const })),
      now,
    );

    const output = await computePact({ db, seasonId, now, solve: greedySolve });
    // Two love pairs, then two other pairs in friends mode (one match per pair).
    expect(output.results.filter((r) => r.mode === "love")).toHaveLength(2);
    expect(output.results.filter((r) => r.mode === "friends")).toHaveLength(2);
    const season = await seasonById(db, seasonId);
    expect(season?.status).toBe("computed");

    expect(await revealPact(db, seasonId, now)).toEqual({ revealed: false, reason: "too_early" });

    // A block between the computation and the reveal removes that pair.
    const blockedPair = output.results.find((r) => r.mode === "love");
    await db
      .insert(schema.block)
      .values({ blockerId: blockedPair?.userHigh ?? "", blockedId: blockedPair?.userLow ?? "" });

    const at = new Date(now.getTime() + day + 1000);
    expect(await revealPact(db, seasonId, at)).toEqual({
      revealed: true,
      matches: 3,
      dropped: 1,
      notified: 4,
    });

    const matches = await db
      .select({ source: schema.match.source, mode: schema.match.mode })
      .from(schema.match)
      .where(and(inArray(schema.match.userLow, members), inArray(schema.match.userHigh, members)));
    expect(matches).toHaveLength(3);
    expect(matches.every((m) => m.source === "pact")).toBe(true);
    const notifications = await db
      .select({ userId: schema.notification.userId })
      .from(schema.notification)
      .where(and(inArray(schema.notification.userId, members), eq(schema.notification.type, "pact_reveal")));
    expect(notifications).toHaveLength(4);
    const broadcasts = await db
      .select({ payload: schema.outbox.payload })
      .from(schema.outbox)
      .where(sql`${schema.outbox.payload}->'event'->>'seasonId' = ${seasonId}`);
    expect(broadcasts.map((b) => b.payload)).toEqual([
      { channel: "broadcast:pact", event: { type: "pact.reveal", seasonId } },
    ]);

    // Idempotent: a second run (a retried job) changes nothing.
    expect(await revealPact(db, seasonId, at)).toEqual({ revealed: false, reason: "not_computed" });
  });

  it("refuses to compute while participation is open", async () => {
    const now = new Date();
    const seasonId = await upsertSeason(db, {
      slug: `test-${randomUUID()}`,
      name: "Pacte ouvert",
      opensAt: new Date(now.getTime() - 1000),
      closesAt: new Date(now.getTime() + 60_000),
      revealAt: new Date(now.getTime() + 120_000),
      status: "open",
    });
    seasons.push(seasonId);
    await expect(computePact({ db, seasonId, now, solve: greedySolve })).rejects.toThrow(
      /cannot be computed/,
    );
  });
});
