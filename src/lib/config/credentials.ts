import "server-only";
import { readFileSync, writeFileSync, existsSync, statSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import {
  CREDENTIAL_KEYS,
  CREDENTIAL_META,
  type CredentialKey,
  type CredentialSource,
  type CredentialStatus,
} from "@/lib/config/credential-schema";
import { requestCredential } from "@/lib/config/request-credentials";

/**
 * Credential resolution for a tool that is run locally far more often than it
 * is deployed.
 *
 * Two sources, in order:
 *   1. Environment variables — how you configure a deployment.
 *   2. A gitignored local file written by the settings page — how you configure
 *      a laptop without restarting the dev server on every change.
 *
 * The environment always wins, so a deployed instance can never be reconfigured
 * by a file someone left in the image.
 */

export {
  CREDENTIAL_KEYS,
  CREDENTIAL_META,
  type CredentialKey,
  type CredentialMeta,
  type CredentialSource,
  type CredentialStatus,
} from "@/lib/config/credential-schema";

const STORE_FILE = ".jevseo.local.json";

function storePath(): string {
  return join(process.cwd(), STORE_FILE);
}

type Store = Partial<Record<CredentialKey, string>>;

let cache: { mtimeMs: number; store: Store } | null = null;

function readStore(): Store {
  const path = storePath();
  if (!existsSync(path)) {
    cache = null;
    return {};
  }
  try {
    const { mtimeMs } = statSync(path);
    if (cache && cache.mtimeMs === mtimeMs) return cache.store;

    const parsed: unknown = JSON.parse(readFileSync(path, "utf8"));
    const store: Store = {};
    if (parsed && typeof parsed === "object") {
      for (const key of CREDENTIAL_KEYS) {
        const value = (parsed as Record<string, unknown>)[key];
        if (typeof value === "string" && value.trim() !== "") store[key] = value.trim();
      }
    }
    cache = { mtimeMs, store };
    return store;
  } catch {
    // A corrupt store must not take the whole app down; the settings page
    // reports it as unconfigured and overwriting it repairs the file.
    cache = null;
    return {};
  }
}

function envValue(key: CredentialKey): string | undefined {
  const raw = process.env[key];
  return raw && raw.trim() !== "" ? raw.trim() : undefined;
}

/**
 * Resolve one credential: the visitor's own key first, then the environment,
 * then the local file.
 *
 * The request wins deliberately. On a public instance a visitor must spend
 * their own credits, never the host's, so a supplied key always takes
 * precedence over whatever the host configured as a fallback.
 */
export function getCredential(key: CredentialKey): string | undefined {
  return requestCredential(key) ?? envValue(key) ?? readStore()[key];
}

export function sourceOf(key: CredentialKey): CredentialSource {
  if (requestCredential(key)) return "request";
  if (envValue(key)) return "env";
  if (readStore()[key]) return "local";
  return "none";
}

function mask(value: string, secret: boolean): string {
  if (!secret) return value;
  if (value.length <= 8) return "••••";
  return `${value.slice(0, 3)}••••${value.slice(-4)}`;
}

export function credentialStatuses(): CredentialStatus[] {
  return CREDENTIAL_KEYS.map((key) => {
    const value = getCredential(key);
    return {
      key,
      configured: Boolean(value),
      source: sourceOf(key),
      preview: value ? mask(value, CREDENTIAL_META[key].secret) : null,
    };
  });
}

/**
 * Writing credentials to disk is a local-development convenience and nothing
 * else. A deployed instance must be configured through its environment, so the
 * write path refuses outright in production.
 */
export function canWriteCredentials(): boolean {
  return process.env.NODE_ENV !== "production";
}

export class CredentialWriteError extends Error {}

export function saveCredentials(values: Partial<Record<CredentialKey, string>>): void {
  if (!canWriteCredentials()) {
    throw new CredentialWriteError(
      "Credentials cannot be written from the browser in production. Set them as environment variables on the host instead.",
    );
  }

  const next: Store = { ...readStore() };
  for (const key of CREDENTIAL_KEYS) {
    if (!(key in values)) continue;
    const value = values[key]?.trim() ?? "";
    if (value === "") delete next[key];
    else next[key] = value;
  }

  const path = storePath();
  if (Object.keys(next).length === 0) {
    if (existsSync(path)) unlinkSync(path);
    cache = null;
    return;
  }

  writeFileSync(path, `${JSON.stringify(next, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
  cache = null;
}

export function clearCredentials(): void {
  if (!canWriteCredentials()) {
    throw new CredentialWriteError("Credentials cannot be cleared from the browser in production.");
  }
  const path = storePath();
  if (existsSync(path)) unlinkSync(path);
  cache = null;
}

export const CREDENTIAL_STORE_FILE = STORE_FILE;
