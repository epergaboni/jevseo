import "server-only";
import { readCredentialHeaders, withRequestCredentials } from "@/lib/config/request-credentials";

/**
 * Wraps a route handler so anything it calls can resolve the visitor's own
 * credentials. Applied to every route that reaches an external API, so no
 * handler has to remember to do it and none can quietly forget.
 */
export function withCredentials<A extends unknown[]>(
  handler: (request: Request, ...args: A) => Promise<Response>,
) {
  return async (request: Request, ...args: A): Promise<Response> =>
    withRequestCredentials(readCredentialHeaders(request.headers), () =>
      handler(request, ...args),
    );
}
