import { contract } from "@epilove/contracts";
import { implement, ORPCError } from "@orpc/server";
import type { ApiContext, Viewer } from "./context";

/**
 * Shared oRPC implementer. Every module router (src/modules/*.ts) builds its
 * procedures from `os`, and protects them with `requireViewer` or `requireRole`.
 */
export const os = implement(contract).$context<ApiContext>();

export const requireViewer = os.middleware(async ({ context, next }) => {
  if (!context.viewer) {
    throw new ORPCError("UNAUTHORIZED");
  }
  return next({ context: { viewer: context.viewer as Viewer } });
});

export const requireRole = (...roles: Viewer["role"][]) =>
  os.middleware(async ({ context, next }) => {
    if (!context.viewer) {
      throw new ORPCError("UNAUTHORIZED");
    }
    if (!roles.includes(context.viewer.role)) {
      throw new ORPCError("FORBIDDEN");
    }
    return next({ context: { viewer: context.viewer as Viewer } });
  });
