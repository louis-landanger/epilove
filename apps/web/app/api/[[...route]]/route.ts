import { createApp } from "@epilove/api";

// The Hono/oRPC API (packages/api), served from the same origin under /api.
const app = createApp({ version: process.env.APP_VERSION ?? "dev" });

const handler = (request: Request) => app.fetch(request);

export { handler as DELETE, handler as GET, handler as PATCH, handler as POST, handler as PUT };
