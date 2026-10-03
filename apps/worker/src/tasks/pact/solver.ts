import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { MODES, type Mode } from "@epilove/core";
import { z } from "zod";

/**
 * Bridge to the Python solver (apps/pact-solver, ADR 0021): one JSON request
 * on stdin, one JSON response on stdout. The request only holds member ids
 * and scores.
 */
export interface SolverRequest {
  readonly threshold: number;
  readonly neighbours: number;
  readonly power?: number;
  readonly engine?: "auto" | "networkx" | "cpsat";
  readonly timeLimitSeconds?: number;
  readonly distinctPairs?: boolean;
  readonly graphs: readonly {
    readonly mode: Mode;
    readonly nodes: readonly string[];
    readonly edges: readonly (readonly [string, string, number])[];
  }[];
}

const solverResponse = z.object({
  graphs: z.array(
    z.object({
      mode: z.enum(MODES),
      pairs: z.array(z.tuple([z.string(), z.string(), z.number()])),
      stats: z.record(z.string(), z.unknown()),
    }),
  ),
});
export type SolverResponse = z.infer<typeof solverResponse>;
export type Solve = (request: SolverRequest) => Promise<SolverResponse>;

const SOLVER_DIRECTORY = fileURLToPath(new URL("../../../../pact-solver/", import.meta.url));

/**
 * The command that runs the solver. In development, `uv` runs it from its
 * project (with OR-Tools); a container sets `PACT_SOLVER_COMMAND`, for
 * instance `python -m pact_solver`.
 */
export function solverCommand(env: Record<string, string | undefined> = process.env) {
  const custom = env.PACT_SOLVER_COMMAND?.trim();
  const [command, ...args] = custom
    ? custom.split(/\s+/)
    : ["uv", "run", "--frozen", "--extra", "cpsat", "python", "-m", "pact_solver"];
  return { command: command as string, args, cwd: env.PACT_SOLVER_DIRECTORY ?? SOLVER_DIRECTORY };
}

export function createSolver(env: Record<string, string | undefined> = process.env): Solve {
  const { command, args, cwd } = solverCommand(env);
  return (request) =>
    new Promise((resolve, reject) => {
      const child = spawn(command, args, { cwd, stdio: ["pipe", "pipe", "pipe"] });
      const stdout: Buffer[] = [];
      let stderr = "";
      child.stdout.on("data", (chunk: Buffer) => stdout.push(chunk));
      child.stderr.on("data", (chunk: Buffer) => {
        stderr = (stderr + chunk.toString()).slice(-2000);
      });
      child.on("error", reject);
      child.on("close", (code) => {
        if (code !== 0) {
          // The solver's messages never contain member ids (apps/pact-solver/README.md).
          reject(new Error(`Pact solver failed with exit code ${code}: ${stderr.trim().slice(-500)}`));
          return;
        }
        try {
          resolve(solverResponse.parse(JSON.parse(Buffer.concat(stdout).toString("utf8"))));
        } catch (error) {
          reject(error);
        }
      });
      child.stdin.end(JSON.stringify(request));
    });
}
