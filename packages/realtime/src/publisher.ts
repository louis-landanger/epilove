import type { RealtimeEvent } from "./events";

/** Server-side publication through Centrifugo's HTTP API (never from the browser). */
export interface Publisher {
  publish(channel: string, event: RealtimeEvent, options?: { idempotencyKey?: string }): Promise<void>;
  /** Number of distinct members connected to a channel (presence must be enabled on its namespace). */
  presenceCount(channel: string): Promise<number>;
  /** Whether a member currently has an open connection on their personal channel. */
  isOnline(channel: string): Promise<boolean>;
}

export interface CentrifugoConfig {
  readonly url: string;
  readonly apiKey: string;
  readonly fetch?: typeof fetch;
}

export function createPublisher(config: CentrifugoConfig): Publisher {
  const call = async <T>(method: string, body: Record<string, unknown>): Promise<T> => {
    const response = await (config.fetch ?? fetch)(`${config.url.replace(/\/$/, "")}/api/${method}`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": config.apiKey },
      body: JSON.stringify(body),
    });
    if (!response.ok) {
      throw new Error(`Centrifugo ${method} failed: HTTP ${response.status}`);
    }
    const json = (await response.json()) as { error?: { code: number }; result?: T };
    if (json.error) {
      throw new Error(`Centrifugo ${method} failed: error ${json.error.code}`);
    }
    return json.result as T;
  };
  return {
    async publish(channel, event, options = {}) {
      await call("publish", {
        channel,
        data: event,
        ...(options.idempotencyKey ? { idempotency_key: options.idempotencyKey } : {}),
      });
    },
    async presenceCount(channel) {
      const result = await call<{ num_users?: number }>("presence_stats", { channel });
      return result?.num_users ?? 0;
    },
    async isOnline(channel) {
      try {
        return (await this.presenceCount(channel)) > 0;
      } catch {
        return false;
      }
    },
  };
}

/** Publisher used when Centrifugo is not configured (tests): records instead of sending. */
export function createMemoryPublisher() {
  const published: { channel: string; event: RealtimeEvent }[] = [];
  const publisher: Publisher = {
    async publish(channel, event) {
      published.push({ channel, event });
    },
    async presenceCount() {
      return 0;
    },
    async isOnline() {
      return false;
    },
  };
  return { publisher, published };
}

export function centrifugoConfigFromEnv(
  env: Record<string, string | undefined> = process.env,
): CentrifugoConfig | null {
  return env.CENTRIFUGO_URL && env.CENTRIFUGO_HTTP_API_KEY
    ? { url: env.CENTRIFUGO_URL, apiKey: env.CENTRIFUGO_HTTP_API_KEY }
    : null;
}
