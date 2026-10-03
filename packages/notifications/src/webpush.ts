import webpush from "web-push";
import type { PushContent } from "./render";

export interface VapidConfig {
  readonly publicKey: string;
  readonly privateKey: string;
  /** mailto: or https: contact of the sender, required by push services. */
  readonly subject: string;
}

export interface PushTarget {
  readonly endpoint: string;
  readonly p256dh: string;
  readonly auth: string;
}

export type PushResult = "sent" | "gone" | "failed";

export interface PushSender {
  send(target: PushTarget, content: PushContent): Promise<PushResult>;
}

/** Web Push (VAPID) sender. "gone" means the subscription expired and must be deleted. */
export function createPushSender(config: VapidConfig): PushSender {
  return {
    async send(target, content) {
      try {
        await webpush.sendNotification(
          { endpoint: target.endpoint, keys: { p256dh: target.p256dh, auth: target.auth } },
          JSON.stringify(content),
          {
            vapidDetails: {
              subject: config.subject,
              publicKey: config.publicKey,
              privateKey: config.privateKey,
            },
            TTL: 60 * 60 * 6,
            urgency: "normal",
            topic: content.tag.replace(/[^A-Za-z0-9_-]/g, "").slice(0, 32),
          },
        );
        return "sent";
      } catch (error) {
        const status = (error as { statusCode?: number }).statusCode;
        return status === 404 || status === 410 ? "gone" : "failed";
      }
    },
  };
}

export function vapidConfigFromEnv(
  env: Record<string, string | undefined> = process.env,
): VapidConfig | null {
  const { VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT } = env;
  return VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY
    ? {
        publicKey: VAPID_PUBLIC_KEY,
        privateKey: VAPID_PRIVATE_KEY,
        subject: VAPID_SUBJECT ?? "mailto:contact@example.org",
      }
    : null;
}

export function generateVapidKeys() {
  return webpush.generateVAPIDKeys();
}
