import { AwsClient } from "aws4fetch";

/** Just enough S3 to put development pictures in the local SeaweedFS bucket. */
export interface DevStorage {
  ensureBucket(): Promise<void>;
  exists(key: string): Promise<boolean>;
  put(key: string, body: Uint8Array, contentType: string): Promise<void>;
}

export function devStorageFromEnv(env: Record<string, string | undefined> = process.env): DevStorage {
  const { S3_ENDPOINT, S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY, S3_BUCKET } = env;
  if (!S3_ENDPOINT || !S3_ACCESS_KEY_ID || !S3_SECRET_ACCESS_KEY || !S3_BUCKET) {
    throw new Error("S3_ENDPOINT, S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY and S3_BUCKET must be set.");
  }
  const client = new AwsClient({
    accessKeyId: S3_ACCESS_KEY_ID,
    secretAccessKey: S3_SECRET_ACCESS_KEY,
    service: "s3",
    region: env.S3_REGION ?? "eu-west-1",
  });
  const bucketUrl = `${S3_ENDPOINT.replace(/\/$/, "")}/${S3_BUCKET}`;
  const objectUrl = (key: string) => `${bucketUrl}/${key.split("/").map(encodeURIComponent).join("/")}`;

  return {
    async ensureBucket() {
      const head = await client.fetch(bucketUrl, { method: "HEAD" });
      if (head.ok) {
        return;
      }
      const created = await client.fetch(bucketUrl, { method: "PUT" });
      if (!created.ok && created.status !== 409) {
        throw new Error(`Could not create bucket ${S3_BUCKET}: HTTP ${created.status}`);
      }
    },
    async exists(key) {
      const response = await client.fetch(objectUrl(key), { method: "HEAD" });
      return response.ok;
    },
    async put(key, body, contentType) {
      const response = await client.fetch(objectUrl(key), {
        method: "PUT",
        body,
        headers: { "content-type": contentType },
      });
      if (!response.ok) {
        throw new Error(`Upload of ${key} failed: HTTP ${response.status}`);
      }
    },
  };
}
