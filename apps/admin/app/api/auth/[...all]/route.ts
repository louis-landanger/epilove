import { toNextJsHandler } from "better-auth/next-js";
import { getAuth } from "@/lib/server/auth";

// Staff sessions (/api/auth/*), created lazily on the first request.
const handlers = () => toNextJsHandler(getAuth());

export function GET(request: Request) {
  return handlers().GET(request);
}

export function POST(request: Request) {
  return handlers().POST(request);
}
