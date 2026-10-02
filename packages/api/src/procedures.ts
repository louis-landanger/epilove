import { contract } from "@epilove/contracts";
import { schema } from "@epilove/db";
import { implement, ORPCError } from "@orpc/server";
import { eq } from "drizzle-orm";
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

const ACTIVE_STATUSES = new Set(["active", "restricted", "paused"]);

/**
 * For social actions (likes, messages, reports from B's surfaces): the
 * viewer's account must be usable right now. Suspended, banned, deleting
 * and onboarding accounts are refused, whatever their session says.
 */
export const requireActiveMember = os.middleware(async ({ context, next }) => {
  if (!context.viewer) {
    throw new ORPCError("UNAUTHORIZED");
  }
  const [account] = await context
    .database()
    .select({ status: schema.appUser.status })
    .from(schema.appUser)
    .where(eq(schema.appUser.id, context.viewer.userId))
    .limit(1);
  if (!account || !ACTIVE_STATUSES.has(account.status)) {
    throw new ORPCError("FORBIDDEN", { message: "ACCOUNT_INACTIVE" });
  }
  return next({ context: { viewer: context.viewer as Viewer, accountStatus: account.status } });
});
