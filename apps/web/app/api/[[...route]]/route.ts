import { apiApp } from "@/lib/server/api-app";

// The Hono/oRPC API (packages/api), served from the same origin under /api.
const handler = (request: Request) => apiApp.fetch(request);

export { handler as DELETE, handler as GET, handler as PATCH, handler as POST, handler as PUT };
