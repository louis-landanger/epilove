import { sql } from "drizzle-orm";
import type { Database } from "./client";

/** A database handle or an open transaction. */
export type Executor = Pick<Database, "execute">;

export interface EnqueueOptions {
  /** Deduplicates pending jobs: enqueuing the same key twice replaces the first job. */
  readonly jobKey?: string;
  readonly runAt?: Date;
  readonly maxAttempts?: number;
}

/**
 * Adds a Graphile Worker job. Called with a transaction, the job only exists
 * if the business write commits (docs/04-architecture.md).
 */
export async function enqueueJob(
  executor: Executor,
  task: string,
  payload: Record<string, unknown>,
  options: EnqueueOptions = {},
): Promise<void> {
  await executor.execute(sql`
    select graphile_worker.add_job(
      ${task},
      ${JSON.stringify(payload)}::json,
      job_key => ${options.jobKey ?? null}::text,
      run_at => ${options.runAt?.toISOString() ?? null}::timestamptz,
      max_attempts => ${options.maxAttempts ?? null}::int
    )
  `);
}
