"use client";

import { CREDENTIAL_KEYS, type CredentialKey } from "@/lib/config/credential-schema";

/**
 * Browser-held credentials, for the public deployment.
 *
 * The visitor's keys stay in their own browser and are attached to each
 * request as a header. The server holds them for the life of that request and
 * never writes them anywhere, so this instance never becomes a custodian of
 * anyone else's API credentials.
 *
 * The honest caveat, stated on the settings page too: the key does travel to
 * this server in order to reach TypeSafe, and anything in localStorage is
 * readable by script running on this origin. Anyone unwilling to accept that
 * should run the tool locally, which is what it was built for.
 */

const PREFIX = "jevseo.credential.";

export const CREDENTIAL_HEADERS: Record<CredentialKey, string> = {
  TYPESAFE_API_KEY: "x-jevseo-typesafe-key",
  TYPESAFE_MODEL: "x-jevseo-typesafe-model",
  DATAFORSEO_LOGIN: "x-jevseo-dataforseo-login",
  DATAFORSEO_PASSWORD: "x-jevseo-dataforseo-password",
};

function read(key: CredentialKey): string | null {
  try {
    const value = window.localStorage.getItem(PREFIX + key);
    return value && value.trim() !== "" ? value.trim() : null;
  } catch {
    return null;
  }
}

export function readLocalCredentials(): Partial<Record<CredentialKey, string>> {
  const out: Partial<Record<CredentialKey, string>> = {};
  for (const key of CREDENTIAL_KEYS) {
    const value = read(key);
    if (value) out[key] = value;
  }
  return out;
}

export function writeLocalCredential(key: CredentialKey, value: string): void {
  try {
    const trimmed = value.trim();
    if (trimmed === "") window.localStorage.removeItem(PREFIX + key);
    else window.localStorage.setItem(PREFIX + key, trimmed);
  } catch {
    // Private browsing or blocked storage. The page reports the field unset.
  }
  invalidate();
}

export function clearLocalCredentials(): void {
  try {
    for (const key of CREDENTIAL_KEYS) window.localStorage.removeItem(PREFIX + key);
  } catch {
    // As above.
  }
  invalidate();
}

/**
 * Headers for the credentials this browser holds, with anything typed into the
 * settings page taking precedence. The overrides matter: a key pasted into a
 * field but not yet saved is still what the visitor expects a connection test
 * to check, and testing the old value instead reads as the feature being
 * broken.
 */
export function credentialHeaders(
  overrides: Partial<Record<CredentialKey, string>> = {},
): Record<string, string> {
  const merged: Partial<Record<CredentialKey, string>> = { ...readLocalCredentials() };
  for (const key of CREDENTIAL_KEYS) {
    const value = overrides[key]?.trim();
    if (value) merged[key] = value;
  }

  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(merged)) {
    out[CREDENTIAL_HEADERS[key as CredentialKey]] = value;
  }
  return out;
}

/**
 * fetch with this browser's credentials attached. Every call the app makes to
 * its own API goes through here, so a new route cannot silently omit them.
 */
export async function apiFetch(
  input: string,
  init: RequestInit = {},
  overrides: Partial<Record<CredentialKey, string>> = {},
): Promise<Response> {
  return fetch(input, {
    ...init,
    headers: { ...(init.headers ?? {}), ...credentialHeaders(overrides) },
  });
}

export function maskCredential(value: string): string {
  if (value.length <= 8) return "••••";
  return `${value.slice(0, 3)}••••${value.slice(-4)}`;
}

/* ------------------------------------------------------ external store ---
 *
 * localStorage is external state, so React reads it through
 * useSyncExternalStore rather than an effect. That keeps the server-rendered
 * HTML consistent with the first client paint, and avoids the cascading
 * render that setting state inside an effect causes.
 *
 * The snapshot must be reference-stable between changes or the hook loops, so
 * it is cached and only rebuilt when something actually writes.
 */

const EVENT = "jevseo:credentials";
const EMPTY: Readonly<Partial<Record<CredentialKey, string>>> = Object.freeze({});

let snapshot: Partial<Record<CredentialKey, string>> = EMPTY;
let snapshotStale = true;

function invalidate(): void {
  snapshotStale = true;
  try {
    window.dispatchEvent(new Event(EVENT));
  } catch {
    // No window, or events unavailable. Nothing is listening either.
  }
}

export function subscribeToCredentials(onChange: () => void): () => void {
  const handler = () => onChange();
  window.addEventListener(EVENT, handler);
  // Another tab writing the same keys should update this one too.
  window.addEventListener("storage", handler);
  return () => {
    window.removeEventListener(EVENT, handler);
    window.removeEventListener("storage", handler);
  };
}

export function getCredentialSnapshot(): Partial<Record<CredentialKey, string>> {
  if (snapshotStale) {
    snapshot = readLocalCredentials();
    snapshotStale = false;
  }
  return snapshot;
}

/** The server has no browser storage, so it always sees nothing configured. */
export function getCredentialServerSnapshot(): Partial<Record<CredentialKey, string>> {
  return EMPTY;
}
