import { createORPCClient } from "@orpc/client";
import { RPCLink } from "@orpc/client/fetch";
import type { ContractRouterClient } from "@orpc/contract";
import type { Contract } from "./index";

export type ApiClient = ContractRouterClient<Contract>;

/** Typed client for the `/api/rpc` endpoint. */
export function createApiClient(options: {
  url: string;
  fetch?: (request: Request) => Promise<Response>;
}): ApiClient {
  const customFetch = options.fetch;
  const link = new RPCLink({
    url: options.url,
    ...(customFetch ? { fetch: (request: Request) => customFetch(request) } : {}),
  });
  return createORPCClient(link);
}
