import "server-only";
import { getCredential } from "@/lib/config/credentials";
import { describeAge, readSerpCache, writeSerpCache } from "@/lib/serp/cache";
import type { Competitor } from "@/lib/types";

/**
 * DataForSEO live SERP lookup. Optional: without credentials the analysis still
 * runs, it just loses the competitor comparison.
 */

const ENDPOINT = "https://api.dataforseo.com/v3/serp/google/organic/live/advanced";

/** United Kingdom. Override per request if you need another market. */
const DEFAULT_LOCATION_CODE = 2826;
const DEFAULT_LANGUAGE_CODE = "en";
const DEFAULT_DEPTH = 10;
const TIMEOUT_MS = 20_000;

export interface SerpLookup {
  competitors: Competitor[];
  source: "dataforseo" | "cache" | "none";
  note: string | null;
  /** What this lookup cost in USD. Zero on a cache hit. */
  cost: number;
}

/** DataForSEO wraps everything in this envelope, including its errors. */
interface DataForSeoEnvelope {
  status_code?: number;
  status_message?: string;
  cost?: number;
  tasks?: {
    status_code?: number;
    status_message?: string;
    cost?: number;
    result?: { items?: DataForSeoItem[]; money?: { balance?: number } }[];
  }[];
}

/**
 * 40100 is returned for four quite different problems, and DataForSEO's own
 * message does not distinguish between them.
 */
export const UNAUTHORISED_HINT = [
  "DataForSEO returns this same code for four different problems:",
  "1. You used your dashboard password. The API password is separate — it is shown at app.dataforseo.com/api-access.",
  "2. Your API login is not your account email. That page shows the exact login string to use.",
  "3. The account is not activated yet. A new account needs its email confirmed before the API answers.",
  "4. IP access restriction is switched on and this machine's address is not on the allow list.",
].join(" ");

interface DataForSeoItem {
  type?: string;
  rank_group?: number;
  url?: string;
  title?: string;
  description?: string;
}

export function hasDataForSeoCredentials(): boolean {
  return Boolean(getCredential("DATAFORSEO_LOGIN") && getCredential("DATAFORSEO_PASSWORD"));
}

function authHeader(): string | null {
  const login = getCredential("DATAFORSEO_LOGIN");
  const password = getCredential("DATAFORSEO_PASSWORD");
  if (!login || !password) return null;
  return `Basic ${Buffer.from(`${login}:${password}`).toString("base64")}`;
}

/**
 * Free credential check. `appendix/user_data` reports the account balance and
 * costs nothing, so it verifies the login without spending a SERP credit.
 *
 * DataForSEO returns a JSON body carrying its own `status_code` and
 * `status_message` even on a 401, and that message is the only thing that
 * distinguishes a wrong password from an unactivated account or a blocked IP.
 * Always read the body before deciding what to report.
 */
export async function testDataForSeoConnection(): Promise<{ ok: boolean; detail: string; hint?: string }> {
  const auth = authHeader();
  if (!auth) return { ok: false, detail: "Both a DataForSEO login and password are needed." };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch("https://api.dataforseo.com/v3/appendix/user_data", {
      headers: { authorization: auth },
      signal: controller.signal,
    });

    const body = (await res.json().catch(() => null)) as DataForSeoEnvelope | null;
    const message = body?.status_message ?? body?.tasks?.[0]?.status_message ?? null;
    const code = body?.status_code ?? body?.tasks?.[0]?.status_code ?? null;

    if (!res.ok || (code !== null && code >= 40000)) {
      return {
        ok: false,
        detail: message
          ? `DataForSEO said (${code ?? res.status}): ${message}`
          : `DataForSEO returned HTTP ${res.status}.`,
        hint: code === 40100 || res.status === 401 ? UNAUTHORISED_HINT : undefined,
      };
    }

    const money = body?.tasks?.[0]?.result?.[0]?.money;
    const balance = money?.balance;
    return {
      ok: true,
      detail:
        typeof balance === "number"
          ? `Connected. Account balance $${balance.toFixed(2)}.`
          : "Connected.",
      hint:
        typeof balance === "number" && balance <= 0
          ? "The account has no balance, so SERP requests will fail even though the login works."
          : undefined,
    };
  } catch (error) {
    const reason =
      error instanceof Error && error.name === "AbortError"
        ? "the request timed out"
        : error instanceof Error
          ? error.message
          : "unknown error";
    return { ok: false, detail: `Could not reach DataForSEO (${reason}).` };
  } finally {
    clearTimeout(timer);
  }
}

export async function fetchCompetitors(
  keyword: string,
  options: { locationCode?: number; languageCode?: string } = {},
): Promise<SerpLookup> {
  const locationCode = options.locationCode ?? DEFAULT_LOCATION_CODE;
  const languageCode = options.languageCode ?? DEFAULT_LANGUAGE_CODE;

  // A cache hit spends nothing, so it is checked before the credential test:
  // a cached answer is still useful after the credentials are removed.
  const cached = readSerpCache(keyword, locationCode, languageCode);
  if (cached) {
    return {
      competitors: cached.competitors,
      source: "cache",
      note: `Results cached ${describeAge(cached.fetchedAt)}; no DataForSEO credit was spent. Clear the cache with \`pnpm serp:cache clear\` to force a fresh lookup.`,
      cost: 0,
    };
  }

  if (!hasDataForSeoCredentials()) {
    return {
      competitors: [],
      source: "none",
      note: "Competitor comparison is off — add your DataForSEO credentials on the Settings page to turn it on.",
      cost: 0,
    };
  }

  const auth = authHeader();
  if (!auth) {
    return { competitors: [], source: "none", note: "DataForSEO credentials are incomplete.", cost: 0 };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const res = await fetch(ENDPOINT, {
      method: "POST",
      signal: controller.signal,
      headers: { authorization: auth, "content-type": "application/json" },
      body: JSON.stringify([
        { keyword, location_code: locationCode, language_code: languageCode, depth: DEFAULT_DEPTH },
      ]),
    });

    const payload = (await res.json().catch(() => null)) as DataForSeoEnvelope | null;
    const topMessage = payload?.status_message;
    const topCode = payload?.status_code;

    if (!res.ok || (topCode !== undefined && topCode >= 40000)) {
      const suffix = topCode === 40100 || res.status === 401 ? ` ${UNAUTHORISED_HINT}` : "";
      return {
        competitors: [],
        source: "none",
        note: `DataForSEO refused the request (${topCode ?? res.status}): ${
          topMessage ?? `HTTP ${res.status}`
        }.${suffix} The analysis continued without competitor data.`,
        cost: 0,
      };
    }

    const task = payload?.tasks?.[0];
    if (!task || (task.status_code !== undefined && task.status_code >= 40000)) {
      return {
        competitors: [],
        source: "none",
        note: `DataForSEO rejected the query (${task?.status_code ?? "unknown"}): ${
          task?.status_message ?? "no message given"
        }. The analysis continued without competitor data.`,
        cost: typeof payload?.cost === "number" ? payload.cost : 0,
      };
    }

    const items = task.result?.[0]?.items ?? [];
    const competitors: Competitor[] = items
      .filter((item) => item.type === "organic" && item.url)
      .slice(0, DEFAULT_DEPTH)
      .map((item, index) => ({
        rank: item.rank_group ?? index + 1,
        url: item.url ?? "",
        title: item.title ?? "",
        snippet: item.description ?? "",
      }));

    const cost = typeof payload?.cost === "number" ? payload.cost : 0;

    if (competitors.length) {
      writeSerpCache({
        key: { keyword, locationCode, languageCode },
        fetchedAt: new Date().toISOString(),
        cost,
        competitors,
      });
    }

    return {
      competitors,
      source: competitors.length ? "dataforseo" : "none",
      note: competitors.length
        ? `Fresh lookup, $${cost.toFixed(4)}. Cached for ${process.env.SERP_CACHE_TTL_HOURS ?? 24} hours, so re-running this query spends nothing.`
        : "DataForSEO returned no organic results for this query.",
      cost,
    };
  } catch (error) {
    const reason =
      error instanceof Error && error.name === "AbortError"
        ? "the request timed out"
        : error instanceof Error
          ? error.message
          : "unknown error";
    return {
      competitors: [],
      source: "none",
      note: `Could not reach DataForSEO (${reason}); the analysis continued without competitor data.`,
      cost: 0,
    };
  } finally {
    clearTimeout(timer);
  }
}
