import {
  CreateBucketCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadBucketCommand,
  HeadObjectCommand,
  PutBucketCorsCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { createPresignedPost } from "@aws-sdk/s3-presigned-post";
import { MAX_UPLOAD_BYTES, UPLOAD_CONTENT_TYPES } from "./policy";

/**
 * Object storage (S3 API: Cloudflare R2 in production, SeaweedFS locally).
 *
 * Uploads never go through the application servers: the browser posts the
 * file directly to a quarantine key with a presigned policy limited in size,
 * type and time (docs/07-confiance-securite.md). The worker then re-encodes
 * the file and writes the published version; quarantine objects are deleted.
 */
export interface StorageConfig {
  readonly endpoint: string;
  /** Endpoint reachable by browsers, when it differs from the internal one. */
  readonly publicEndpoint: string;
  readonly region: string;
  readonly accessKeyId: string;
  readonly secretAccessKey: string;
  readonly bucket: string;
}

export interface PresignedUpload {
  readonly url: string;
  readonly fields: Record<string, string>;
  readonly maxBytes: number;
  readonly expiresAt: string;
}

export interface StoredObject {
  readonly size: number;
  readonly contentType: string | undefined;
}

export interface Storage {
  readonly bucket: string;
  presignUpload(key: string, contentType: string, now?: Date): Promise<PresignedUpload>;
  head(key: string): Promise<StoredObject | null>;
  read(key: string): Promise<Uint8Array>;
  write(key: string, body: Uint8Array, contentType: string): Promise<void>;
  remove(key: string): Promise<void>;
  /** Creates the bucket (and a permissive CORS rule) when missing. Development and tests only. */
  ensureBucket(allowedOrigins: readonly string[]): Promise<void>;
}

const UPLOAD_TTL_SECONDS = 300;

function client(config: StorageConfig, endpoint: string) {
  return new S3Client({
    endpoint,
    region: config.region,
    forcePathStyle: true,
    credentials: { accessKeyId: config.accessKeyId, secretAccessKey: config.secretAccessKey },
  });
}

function isNotFound(error: unknown) {
  if (typeof error !== "object" || error === null) {
    return false;
  }
  const { name, $metadata } = error as { name?: string; $metadata?: { httpStatusCode?: number } };
  return name === "NotFound" || name === "NoSuchKey" || $metadata?.httpStatusCode === 404;
}

export interface StorageOptions {
  /**
   * Development and tests only: create the bucket and its CORS rule for these
   * origins before the first presigned upload.
   */
  readonly autoCreateBucketFor?: readonly string[];
}

export function createStorage(config: StorageConfig, options: StorageOptions = {}): Storage {
  const internal = client(config, config.endpoint);
  const external =
    config.publicEndpoint === config.endpoint ? internal : client(config, config.publicEndpoint);
  const Bucket = config.bucket;
  let bucketReady: Promise<void> | undefined;

  const storage: Storage = {
    bucket: Bucket,

    async presignUpload(key, contentType, now = new Date()) {
      if (!(UPLOAD_CONTENT_TYPES as readonly string[]).includes(contentType)) {
        throw new Error("Unsupported content type.");
      }
      if (options.autoCreateBucketFor) {
        bucketReady ??= storage.ensureBucket(options.autoCreateBucketFor).catch((error: unknown) => {
          bucketReady = undefined;
          throw error;
        });
        await bucketReady;
      }
      const { url, fields } = await createPresignedPost(external, {
        Bucket,
        Key: key,
        Expires: UPLOAD_TTL_SECONDS,
        Fields: { "Content-Type": contentType },
        Conditions: [
          ["content-length-range", 1, MAX_UPLOAD_BYTES],
          ["eq", "$Content-Type", contentType],
        ],
      });
      return {
        url,
        fields,
        maxBytes: MAX_UPLOAD_BYTES,
        expiresAt: new Date(now.getTime() + UPLOAD_TTL_SECONDS * 1000).toISOString(),
      };
    },

    async head(key) {
      try {
        const result = await internal.send(new HeadObjectCommand({ Bucket, Key: key }));
        return { size: result.ContentLength ?? 0, contentType: result.ContentType };
      } catch (error) {
        if (isNotFound(error)) {
          return null;
        }
        throw error;
      }
    },

    async read(key) {
      const result = await internal.send(new GetObjectCommand({ Bucket, Key: key }));
      if (!result.Body) {
        throw new Error("Empty object body.");
      }
      return result.Body.transformToByteArray();
    },

    async write(key, body, contentType) {
      await internal.send(new PutObjectCommand({ Bucket, Key: key, Body: body, ContentType: contentType }));
    },

    async remove(key) {
      await internal.send(new DeleteObjectCommand({ Bucket, Key: key }));
    },

    async ensureBucket(allowedOrigins) {
      try {
        await internal.send(new HeadBucketCommand({ Bucket }));
      } catch (error) {
        if (!isNotFound(error)) {
          throw error;
        }
        await internal.send(new CreateBucketCommand({ Bucket }));
      }
      if (allowedOrigins.length > 0) {
        await internal.send(
          new PutBucketCorsCommand({
            Bucket,
            CORSConfiguration: {
              CORSRules: [
                {
                  AllowedOrigins: [...allowedOrigins],
                  AllowedMethods: ["POST"],
                  AllowedHeaders: ["*"],
                  MaxAgeSeconds: 600,
                },
              ],
            },
          }),
        );
      }
    },
  };
  return storage;
}

export function storageConfigFromEnv(env: Record<string, string | undefined> = process.env): StorageConfig {
  const { S3_ENDPOINT, S3_PUBLIC_ENDPOINT, S3_REGION, S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY, S3_BUCKET } =
    env;
  if (!S3_ENDPOINT || !S3_ACCESS_KEY_ID || !S3_SECRET_ACCESS_KEY || !S3_BUCKET) {
    throw new Error("S3_ENDPOINT, S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY and S3_BUCKET must be set.");
  }
  return {
    endpoint: S3_ENDPOINT,
    publicEndpoint: S3_PUBLIC_ENDPOINT || S3_ENDPOINT,
    region: S3_REGION || "auto",
    accessKeyId: S3_ACCESS_KEY_ID,
    secretAccessKey: S3_SECRET_ACCESS_KEY,
    bucket: S3_BUCKET,
  };
}

/** In-memory storage for tests: same contract, no network. */
export function createMemoryStorage(bucket = "test-bucket"): Storage & { objects: Map<string, Uint8Array> } {
  const objects = new Map<string, Uint8Array>();
  const types = new Map<string, string>();
  return {
    bucket,
    objects,
    async presignUpload(key, contentType, now = new Date()) {
      if (!(UPLOAD_CONTENT_TYPES as readonly string[]).includes(contentType)) {
        throw new Error("Unsupported content type.");
      }
      return {
        url: `http://storage.test/${bucket}`,
        fields: { key, "Content-Type": contentType },
        maxBytes: MAX_UPLOAD_BYTES,
        expiresAt: new Date(now.getTime() + UPLOAD_TTL_SECONDS * 1000).toISOString(),
      };
    },
    async head(key) {
      const body = objects.get(key);
      return body ? { size: body.byteLength, contentType: types.get(key) } : null;
    },
    async read(key) {
      const body = objects.get(key);
      if (!body) {
        throw new Error("NoSuchKey");
      }
      return body;
    },
    async write(key, body, contentType) {
      objects.set(key, body);
      types.set(key, contentType);
    },
    async remove(key) {
      objects.delete(key);
      types.delete(key);
    },
    async ensureBucket() {},
  };
}
