/// <reference lib="webworker" />
import { CacheFirst, ExpirationPlugin, type PrecacheEntry, Serwist, type SerwistGlobalConfig } from "serwist";

/**
 * Service worker of the PWA (PLT-01, NOT-01), bundled by Serwist
 * (app/serwist/[path]/route.ts).
 *
 * Privacy first: only the app shell and static assets are cached. Pages and
 * API responses (profiles, messages) are never stored on the device, which
 * may be shared or lent. Without network, navigations fall back to /hors-ligne.
 */
declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined;
  }
}
declare const self: ServiceWorkerGlobalScope;

const OFFLINE_URL = "/hors-ligne";

const serwist = new Serwist({
  precacheEntries: [...(self.__SW_MANIFEST ?? []), { url: OFFLINE_URL, revision: "1" }],
  skipWaiting: true,
  clientsClaim: true,
  navigationPreload: true,
  runtimeCaching: [
    {
      matcher: ({ url, sameOrigin }) => sameOrigin && url.pathname.startsWith("/_next/static/"),
      handler: new CacheFirst({
        cacheName: "static-assets",
        plugins: [new ExpirationPlugin({ maxEntries: 300, maxAgeSeconds: 60 * 60 * 24 * 30 })],
      }),
    },
  ],
  fallbacks: {
    entries: [{ url: OFFLINE_URL, matcher: ({ request }) => request.destination === "document" }],
  },
});

interface PushPayload {
  readonly title: string;
  readonly body: string;
  readonly tag: string;
  readonly url: string;
}

self.addEventListener("push", (event) => {
  let payload: PushPayload;
  try {
    payload = event.data?.json() as PushPayload;
  } catch {
    return;
  }
  if (!payload?.title) {
    return;
  }
  event.waitUntil(
    self.registration.showNotification(payload.title, {
      body: payload.body,
      tag: payload.tag,
      icon: "/icon.svg",
      badge: "/icon.svg",
      data: { url: payload.url },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const path = typeof event.notification.data?.url === "string" ? event.notification.data.url : "/";
  // Only same-origin paths: a push payload can never send the member elsewhere.
  const target = new URL(path.startsWith("/") ? path : "/", self.location.origin).href;
  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      const existing = windows.find((client) => new URL(client.url).origin === self.location.origin);
      if (existing) {
        await existing.focus();
        await existing.navigate(target);
        return;
      }
      await self.clients.openWindow(target);
    })(),
  );
});

serwist.addEventListeners();
