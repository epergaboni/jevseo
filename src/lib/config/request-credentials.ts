import "server-only";
import { AsyncLocalStorage } from "node:async_hooks";
import { CREDENTIAL_KEYS, type CredentialKey } from "@/lib/config/credential-schema";

/**
 * Per-request credentials, for the bring-your-own-key deployment.
 *
 * On a public instance the visitor's key lives in their own browser and rides
 * along on each request as a header. It is never written to disk, never put
 * in the database, and never logged. AsyncLocalStorage carries it down to the
 * API clients so the key does not have to be threaded through every function
 * between the route and the fetch.
 *
 * Precedence is deliberate: a request-supplied key wins, so a visitor always
 * spends their own credits rather than the host's, and a host that configures
 * an environment key is only providing a fallback.
 */

export const CREDENTIAL_HEADERS: Record<CredentialKey, string> = {
  TYPESAFE_API_KEY: "x-jevseo-typesafe-key",
  TYPESAFE_MODEL: "x-jevseo-typesafe-model",
  DATAFORSEO_LOGIN: "x-jevseo-dataforseo-login",
  DATAFORSEO_PASSWORD: "x-jevseo-dataforseo-password",
};

/** A header value long enough to be abused is rejected rather than truncated. */
const MAX_LENGTH = 400;

export type RequestCredentials = Partial<Record<CredentialKey, string>>;

const store = new AsyncLocalStorage<RequestCredentials>();

/**
 * Header values arrive as attacker-controlled strings. Anything with a control
 * character, or anything implausibly long, is dropped entirely rather than
 * sanitised, because a mangled credential produces a confusing 401 instead of
 * an honest "not supplied".
 */
function clean(value: string | null): string | undefined {
  if (!value) return undefined;
  const trimmed = value.trim();
  if (trimmed === "" || trimmed.length > MAX_LENGTH) return undefined;
  if (/[\u0000-\u001f\u007f]/.test(trimmed)) return undefined;
  return trimmed;
}

export function readCredentialHeaders(headers: Headers): RequestCredentials {
  const out: RequestCredentials = {};
  for (const key of CREDENTIAL_KEYS) {
    const value = clean(headers.get(CREDENTIAL_HEADERS[key]));
    if (value) out[key] = value;
  }
  return out;
}

/** Run `fn` with these credentials visible to getCredential further down. */
export function withRequestCredentials<T>(credentials: RequestCredentials, fn: () => T): T {
  return store.run(credentials, fn);
}

export function requestCredential(key: CredentialKey): string | undefined {
  return store.getStore()?.[key];
}

/** Snapshot the current context, for work that outlives the request. */
export function currentRequestCredentials(): RequestCredentials {
  return { ...(store.getStore() ?? {}) };
}

export function hasAnyRequestCredential(): boolean {
  const current = store.getStore();
  return Boolean(current && Object.keys(current).length > 0);
}
