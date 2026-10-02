import { AwsClient } from "aws4fetch";

/**
 * Object storage for conversation media (CHAT-06, CHAT-07): S3-compatible
 * (SeaweedFS in development). Objects are never public: they are read
 * through presigned, expiring URLs (or signed imgproxy URLs for photos).
 */
export interface ObjectStore {
  put(key: string, body: Uint8Array, contentType: string): Promise<void>;
  delete(key: string): Promise<void>;
  /** A GET URL valid for `ttlSeconds`. */
  signedUrl(key: string, ttlSeconds: number): Promise<string>;
}

const safeKey = (key: string) => {
  if (key.includes("..") || key.startsWith("/")) {
    throw new Error("Invalid storage key.");
  }
  return key;
};

export function objectStoreFromEnv(
  env: Record<string, string | undefined> = process.env,
): ObjectStore | null {
  const { S3_ENDPOINT, S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY, S3_BUCKET } = env;
  if (!S3_ENDPOINT || !S3_ACCESS_KEY_ID || !S3_SECRET_ACCESS_KEY || !S3_BUCKET) {
    return null;
  }
  const client = new AwsClient({
    accessKeyId: S3_ACCESS_KEY_ID,
    secretAccessKey: S3_SECRET_ACCESS_KEY,
    service: "s3",
    region: env.S3_REGION ?? "eu-west-1",
  });
  const bucketUrl = `${S3_ENDPOINT.replace(/\/$/, "")}/${S3_BUCKET}`;
  const objectUrl = (key: string) =>
    `${bucketUrl}/${safeKey(key).split("/").map(encodeURIComponent).join("/")}`;
  return {
    async put(key, body, contentType) {
      const response = await client.fetch(objectUrl(key), {
        method: "PUT",
        body: new Uint8Array(body),
        headers: { "content-type": contentType },
      });
      if (!response.ok) {
        throw new Error(`Object upload failed: HTTP ${response.status}`);
      }
    },
    async delete(key) {
      const response = await client.fetch(objectUrl(key), { method: "DELETE" });
      if (!response.ok && response.status !== 404) {
        throw new Error(`Object deletion failed: HTTP ${response.status}`);
      }
    },
    async signedUrl(key, ttlSeconds) {
      const url = new URL(objectUrl(key));
      url.searchParams.set("X-Amz-Expires", String(ttlSeconds));
      const signed = await client.sign(url.toString(), { method: "GET", aws: { signQuery: true } });
      return signed.url;
    },
  };
}

/** In-memory store for tests and environments without S3. */
export function createMemoryObjectStore() {
  const objects = new Map<string, { body: Uint8Array; contentType: string }>();
  const store: ObjectStore = {
    async put(key, body, contentType) {
      objects.set(safeKey(key), { body, contentType });
    },
    async delete(key) {
      objects.delete(key);
    },
    async signedUrl(key, ttlSeconds) {
      return `memory://${safeKey(key)}?expires=${ttlSeconds}`;
    },
  };
  return { store, objects };
}
