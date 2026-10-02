import { type ApiClient, createApiClient } from "@epilove/contracts/client";
import type { Database } from "@epilove/db";
import { createApp } from "../app";
import { devHeaderResolver } from "../context";
import { setMessageKeyRing } from "./messages";

/** An in-memory API wired to a test database; `as(memberId)` returns a client signed in as that member. */
export function createTestApi(db: Database) {
  // A fixed test key ring, so that message tests do not depend on the local .env.
  setMessageKeyRing({ currentKeyId: "test", keys: new Map([["test", new Uint8Array(32).fill(7)]]) });
  const app = createApp({
    version: "test",
    database: () => db,
    resolveViewer: devHeaderResolver({ APP_ENV: "test" }),
  });
  const as = (memberId: string | null): ApiClient =>
    createApiClient({
      url: "http://localhost/api/rpc",
      fetch: (request) => {
        if (memberId) {
          request.headers.set("x-dev-user-id", memberId);
        }
        return Promise.resolve(app.fetch(request));
      },
    });
  return { app, as };
}
