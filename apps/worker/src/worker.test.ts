import { quickAddJob, runOnce } from "graphile-worker";
import { describe, expect, it } from "vitest";
import { parseEnv } from "./env";
import { crontab, taskList } from "./tasks";

describe("environment", () => {
  it("applies defaults and validates the database URL", () => {
    expect(parseEnv({ DATABASE_URL: "postgres://u:p@localhost:5432/db" })).toEqual({
      DATABASE_URL: "postgres://u:p@localhost:5432/db",
      WORKER_CONCURRENCY: 4,
    });
    expect(() => parseEnv({ DATABASE_URL: "https://example.com" })).toThrow("DATABASE_URL");
    expect(() => parseEnv({})).toThrow("DATABASE_URL");
  });
});

describe("tasks", () => {
  it("only schedules known tasks", () => {
    for (const line of crontab.split("\n")) {
      const task = line.trim().split(/\s+/)[5];
      expect(task && task in taskList).toBe(true);
    }
  });
});

const connectionString = process.env.DATABASE_URL;

/** Needs a disposable PostgreSQL (`pnpm services:up` locally, a service container in CI). */
describe.skipIf(!connectionString)("graphile worker", () => {
  it("runs a queued job", async () => {
    const seen: unknown[] = [];
    await quickAddJob({ connectionString }, "sprint_zero_probe", { ok: true });
    await runOnce({
      connectionString,
      taskList: {
        sprint_zero_probe: async (payload) => {
          seen.push(payload);
        },
      },
    });
    expect(seen).toContainEqual({ ok: true });
  });
});
