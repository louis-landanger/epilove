import { ORPCError } from "@orpc/client";

/** Why a page cannot show its content to the current visitor. */
export type Gate = "signin" | "profile" | "notfound" | "error";

export type Gated<T> = { readonly ok: true; readonly data: T } | { readonly ok: false; readonly gate: Gate };

/** Runs a server-side API call and turns authentication errors into a page state. */
export async function gated<T>(load: () => Promise<T>): Promise<Gated<T>> {
  try {
    return { ok: true, data: await load() };
  } catch (error) {
    if (error instanceof ORPCError) {
      if (error.code === "UNAUTHORIZED") {
        return { ok: false, gate: "signin" };
      }
      if (error.code === "FORBIDDEN" && error.message === "profile_required") {
        return { ok: false, gate: "profile" };
      }
      if (error.code === "NOT_FOUND") {
        return { ok: false, gate: "notfound" };
      }
    }
    console.error(`[rencontre] page data failed: ${error instanceof Error ? error.name : "unknown"}`);
    return { ok: false, gate: "error" };
  }
}
