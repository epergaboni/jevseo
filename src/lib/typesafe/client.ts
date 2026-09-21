import "server-only";
import { TypeSafeClient } from "@typesafe-ai/sdk";
import { getCredential } from "@/lib/config/credentials";

let cached: { key: string; model: string; client: TypeSafeClient } | null = null;

export class MissingCredentialError extends Error {}

/**
 * The API key never leaves the server. The client is cached against the
 * credentials that built it, so changing them in settings takes effect on the
 * next request without a restart.
 */
export function getTypeSafeClient(): TypeSafeClient {
  const apiKey = getCredential("TYPESAFE_API_KEY");
  if (!apiKey) {
    throw new MissingCredentialError(
      "No TypeSafe API key is configured. Add one on the Settings page, or set TYPESAFE_API_KEY in the environment.",
    );
  }
  const model = getCredential("TYPESAFE_MODEL") ?? "jev-latest";

  if (!cached || cached.key !== apiKey || cached.model !== model) {
    cached = { key: apiKey, model, client: new TypeSafeClient({ apiKey, defaultModel: model }) };
  }
  return cached.client;
}

export function hasTypeSafeCredentials(): boolean {
  return Boolean(getCredential("TYPESAFE_API_KEY"));
}

/** Free credential check: lists the account's models without running inference. */
export async function testTypeSafeConnection(): Promise<{ ok: boolean; detail: string }> {
  try {
    const models = await getTypeSafeClient().models.list();
    const names = models.map((m) => m.name);
    return {
      ok: true,
      detail: names.length
        ? `Connected. ${names.length} model${names.length === 1 ? "" : "s"} available: ${names.join(", ")}.`
        : "Connected, but the account lists no models.",
    };
  } catch (error) {
    if (error instanceof MissingCredentialError) return { ok: false, detail: error.message };
    const message = error instanceof Error ? error.message : "Unknown error.";
    if (/401|unauthor/i.test(message)) return { ok: false, detail: "The key was rejected by TypeSafe." };
    return { ok: false, detail: `Could not reach TypeSafe: ${message}` };
  }
}
