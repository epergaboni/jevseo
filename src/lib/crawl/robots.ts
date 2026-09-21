import "server-only";
import { sameOrigin } from "@/lib/crawl/urls";

/**
 * A small robots.txt reader. Deliberately conservative: anything it cannot
 * parse is treated as "allowed", but a failure to *fetch* is treated as
 * allowed too, because a missing robots.txt means no restrictions.
 *
 * This is not a full RFC 9309 implementation. It handles User-agent grouping,
 * Allow, Disallow, Crawl-delay and Sitemap, with longest-match precedence,
 * which covers what real sites use.
 */
export interface Robots {
  isAllowed: (pathname: string) => boolean;
  crawlDelayMs: number;
  sitemaps: string[];
}

const ALLOW_ALL: Robots = { isAllowed: () => true, crawlDelayMs: 0, sitemaps: [] };

const USER_AGENT = "JevSEOBot";

function toRegExp(pattern: string): RegExp {
  // robots.txt wildcards: * matches any run, $ anchors the end.
  const escaped = pattern
    .replace(/[.+?^{}()|[\]\\]/g, "\\$&")
    .replace(/\*/g, ".*")
    .replace(/\$$/, "\\$$");
  const anchored = pattern.endsWith("$") ? `^${escaped.slice(0, -2)}$` : `^${escaped}`;
  return new RegExp(anchored);
}

export function parseRobots(text: string): Robots {
  const lines = text.split(/\r?\n/);
  const groups: { agents: string[]; rules: { allow: boolean; pattern: string }[]; delay?: number }[] =
    [];
  const sitemaps: string[] = [];

  let current: (typeof groups)[number] | null = null;
  let lastWasAgent = false;

  for (const raw of lines) {
    const line = raw.split("#")[0].trim();
    if (!line) continue;
    const at = line.indexOf(":");
    if (at === -1) continue;

    const field = line.slice(0, at).trim().toLowerCase();
    const value = line.slice(at + 1).trim();

    if (field === "sitemap") {
      sitemaps.push(value);
      continue;
    }

    if (field === "user-agent") {
      if (!current || !lastWasAgent) {
        current = { agents: [], rules: [] };
        groups.push(current);
      }
      current.agents.push(value.toLowerCase());
      lastWasAgent = true;
      continue;
    }

    lastWasAgent = false;
    if (!current) continue;

    if (field === "allow" && value) current.rules.push({ allow: true, pattern: value });
    else if (field === "disallow") current.rules.push({ allow: false, pattern: value });
    else if (field === "crawl-delay") {
      const seconds = Number(value);
      if (Number.isFinite(seconds) && seconds >= 0) current.delay = seconds;
    }
  }

  // Most specific group wins: our own name, then *, then nothing.
  const named = groups.find((g) => g.agents.includes(USER_AGENT.toLowerCase()));
  const wildcard = groups.find((g) => g.agents.includes("*"));
  const group = named ?? wildcard;

  if (!group) return { ...ALLOW_ALL, sitemaps };

  // An empty Disallow means "allow everything" and carries no pattern.
  const rules = group.rules.filter((r) => r.pattern !== "");
  const compiled = rules.map((r) => ({ allow: r.allow, length: r.pattern.length, re: toRegExp(r.pattern) }));

  return {
    isAllowed(pathname: string) {
      let best: { allow: boolean; length: number } | null = null;
      for (const rule of compiled) {
        if (!rule.re.test(pathname)) continue;
        if (!best || rule.length > best.length) best = { allow: rule.allow, length: rule.length };
      }
      return best ? best.allow : true;
    },
    crawlDelayMs: (group.delay ?? 0) * 1000,
    sitemaps,
  };
}

export async function fetchRobots(origin: string, signal?: AbortSignal): Promise<Robots> {
  try {
    const res = await fetch(new URL("/robots.txt", origin), {
      signal,
      headers: { "user-agent": USER_AGENT },
    });
    if (!res.ok) return ALLOW_ALL;
    return parseRobots(await res.text());
  } catch {
    // No robots.txt, or unreachable. Neither forbids crawling.
    return ALLOW_ALL;
  }
}

/** Pull page URLs out of a sitemap, following sitemap indexes one level deep. */
export async function fetchSitemapUrls(
  sitemapUrl: string,
  origin: string,
  limit: number,
  signal?: AbortSignal,
  depth = 0,
): Promise<string[]> {
  if (depth > 1) return [];
  try {
    const res = await fetch(sitemapUrl, { signal, headers: { "user-agent": USER_AGENT } });
    if (!res.ok) return [];
    const xml = await res.text();

    const locs = [...xml.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/gi)].map((m) => m[1]);
    const isIndex = /<sitemapindex/i.test(xml);

    if (!isIndex) {
      return locs.filter((u) => sameOrigin(u, origin)).slice(0, limit);
    }

    const out: string[] = [];
    for (const child of locs.slice(0, 5)) {
      if (out.length >= limit) break;
      out.push(...(await fetchSitemapUrls(child, origin, limit - out.length, signal, depth + 1)));
    }
    return out;
  } catch {
    return [];
  }
}


