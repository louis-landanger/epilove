import Redis from "ioredis";

export interface RateLimitResult {
  readonly allowed: boolean;
  readonly remaining: number;
  /** Seconds until the window resets. */
  readonly resetInSeconds: number;
}

export interface RateLimiter {
  /** Counts one hit for `key` and tells whether it is within `limit` per `windowSeconds`. */
  consume(key: string, limit: number, windowSeconds: number): Promise<RateLimitResult>;
}

// INCR then set the expiry on the first hit, atomically.
const CONSUME_SCRIPT = `
local count = redis.call("INCR", KEYS[1])
if count == 1 then
  redis.call("EXPIRE", KEYS[1], ARGV[1])
end
local ttl = redis.call("TTL", KEYS[1])
return { count, ttl }
`;

export function createValkeyRateLimiter(client: Redis, prefix = "rl"): RateLimiter {
  return {
    async consume(key, limit, windowSeconds) {
      const [count, ttl] = (await client.eval(CONSUME_SCRIPT, 1, `${prefix}:${key}`, windowSeconds)) as [
        number,
        number,
      ];
      return {
        allowed: count <= limit,
        remaining: Math.max(0, limit - count),
        resetInSeconds: ttl > 0 ? ttl : windowSeconds,
      };
    },
  };
}

export function createMemoryRateLimiter(now: () => number = Date.now): RateLimiter {
  const windows = new Map<string, { count: number; resetAt: number }>();
  return {
    async consume(key, limit, windowSeconds) {
      const current = now();
      let entry = windows.get(key);
      if (!entry || entry.resetAt <= current) {
        entry = { count: 0, resetAt: current + windowSeconds * 1000 };
        windows.set(key, entry);
      }
      entry.count += 1;
      return {
        allowed: entry.count <= limit,
        remaining: Math.max(0, limit - entry.count),
        resetInSeconds: Math.ceil((entry.resetAt - current) / 1000),
      };
    },
  };
}

let shared: Redis | undefined;

/** One Valkey connection per process (VALKEY_URL), opened on first use. */
export function valkeyFromEnv(env: Record<string, string | undefined> = process.env): Redis {
  if (!env.VALKEY_URL) {
    throw new Error("VALKEY_URL must be set.");
  }
  shared ??= new Redis(env.VALKEY_URL, { maxRetriesPerRequest: 2, lazyConnect: false });
  return shared;
}

export { Redis };
