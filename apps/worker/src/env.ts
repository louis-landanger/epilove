import { z } from "zod";

const envSchema = z.object({
  DATABASE_URL: z.url({ protocol: /^postgres(ql)?$/ }),
  WORKER_CONCURRENCY: z.coerce.number().int().min(1).max(32).default(4),
  // Session B: realtime relay. Without them the outbox is not relayed (development without Centrifugo).
  CENTRIFUGO_URL: z.url().optional(),
  CENTRIFUGO_HTTP_API_KEY: z.string().min(1).optional(),
});

export type WorkerEnv = z.infer<typeof envSchema>;

/** Fails fast at startup instead of failing later on a missing variable. */
export function parseEnv(source: Record<string, string | undefined> = process.env): WorkerEnv {
  const result = envSchema.safeParse(source);
  if (!result.success) {
    const keys = result.error.issues.map((issue) => issue.path.join(".")).join(", ");
    throw new Error(`Invalid worker environment: ${keys}`);
  }
  return result.data;
}
