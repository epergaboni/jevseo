import "server-only";
import { extractFacts, fetchPage, FetchError } from "@/lib/extract/fetch-page";
import { fetchRobots, fetchSitemapUrls } from "@/lib/crawl/robots";
import {
  NON_PAGE,
  canonicaliseUrl,
  extractLinks,
  pathAffinity,
  pathSegments,
} from "@/lib/crawl/urls";
import type { PageFacts } from "@/lib/types";

export interface CrawledPage {
  url: string;
  discoveredVia: "seed" | "sitemap" | "link";
  depth: number;
  statusCode: number | null;
  facts: PageFacts | null;
  error: string | null;
}

export interface CrawlOptions {
  startUrl: string;
  maxPages: number;
  maxDepth?: number;
  concurrency?: number;
  signal?: AbortSignal;
  onPage?: (page: CrawledPage, done: number, queued: number) => void;
}

const DEFAULT_CONCURRENCY = 4;
const DEFAULT_MAX_DEPTH = 3;

/**
 * Breadth-first crawl of one origin.
 *
 * Respects robots.txt including Crawl-delay, prefers the sitemap for discovery
 * because it reflects what the site considers its own pages, and falls back to
 * following links. Stays on one origin and never exceeds maxPages.
 */
export async function crawlSite(options: CrawlOptions): Promise<CrawledPage[]> {
  const {
    startUrl,
    maxPages,
    maxDepth = DEFAULT_MAX_DEPTH,
    concurrency = DEFAULT_CONCURRENCY,
    signal,
    onPage,
  } = options;

  const seed = canonicaliseUrl(startUrl);
  if (!seed) throw new FetchError(`"${startUrl}" is not a valid URL.`);
  const origin = new URL(seed).origin;

  const robots = await fetchRobots(origin, signal);

  const seedSegments = pathSegments(seed);

  type QueueItem = { url: string; via: CrawledPage["discoveredVia"]; depth: number; affinity: number };
  const queue: QueueItem[] = [{ url: seed, via: "seed", depth: 0, affinity: 99 }];

  /** Closest to the seed first, then shallowest. */
  const reorder = () =>
    queue.sort((a, b) => b.affinity - a.affinity || a.depth - b.depth);

  const enqueue = (url: string, via: CrawledPage["discoveredVia"], depth: number) => {
    queue.push({ url, via, depth, affinity: pathAffinity(url, seedSegments) });
  };
  const seen = new Set<string>([seed]);
  const results: CrawledPage[] = [];

  // The sitemap is the site's own account of what it publishes, so it is the
  // best source of URLs — but only for the part of the site being crawled.
  // A large domain's sitemap is a sample of everything it has ever published:
  // seeding at gov.uk/vehicle-tax and taking the sitemap wholesale returns
  // alcohol duty bulletins. When the seed names a path, sitemap entries must
  // sit under it; link discovery covers the rest.
  const scopeToSeedPath = seedSegments.length > 0;

  const sitemapCandidates = robots.sitemaps.length
    ? robots.sitemaps
    : [new URL("/sitemap.xml", origin).toString()];

  for (const sitemap of sitemapCandidates.slice(0, 3)) {
    if (queue.length >= maxPages * 2) break;
    const urls = await fetchSitemapUrls(sitemap, origin, maxPages * 20, signal);
    for (const raw of urls) {
      const url = canonicaliseUrl(raw);
      if (!url || seen.has(url)) continue;
      if (NON_PAGE.test(new URL(url).pathname)) continue;
      if (scopeToSeedPath && pathAffinity(url, seedSegments) < seedSegments.length) continue;
      seen.add(url);
      enqueue(url, "sitemap", 1);
      if (queue.length >= maxPages * 2) break;
    }
  }

  reorder();

  async function visit(item: QueueItem): Promise<void> {
    if (signal?.aborted) return;

    const pathname = new URL(item.url).pathname;
    if (!robots.isAllowed(pathname)) {
      results.push({
        url: item.url,
        discoveredVia: item.via,
        depth: item.depth,
        statusCode: null,
        facts: null,
        error: "Blocked by robots.txt",
      });
      onPage?.(results[results.length - 1], results.length, queue.length);
      return;
    }

    try {
      const fetched = await fetchPage(item.url);
      const facts = extractFacts(fetched.html, {
        url: fetched.url,
        statusCode: fetched.statusCode,
        responseMs: fetched.responseMs,
      });

      const page: CrawledPage = {
        url: item.url,
        discoveredVia: item.via,
        depth: item.depth,
        statusCode: fetched.statusCode,
        facts,
        error: null,
      };
      results.push(page);
      onPage?.(page, results.length, queue.length);

      if (item.depth < maxDepth && results.length + queue.length < maxPages) {
        for (const link of extractLinks(fetched.html, fetched.url, origin)) {
          if (seen.has(link)) continue;
          seen.add(link);
          enqueue(link, "link", item.depth + 1);
          if (results.length + queue.length >= maxPages) break;
        }
      }
    } catch (error) {
      const page: CrawledPage = {
        url: item.url,
        discoveredVia: item.via,
        depth: item.depth,
        statusCode: error instanceof FetchError ? error.statusCode : null,
        facts: null,
        error: error instanceof Error ? error.message : "Unknown fetch error",
      };
      results.push(page);
      onPage?.(page, results.length, queue.length);
    }

    if (robots.crawlDelayMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, robots.crawlDelayMs));
    }
  }

  // A fixed pool of workers pulling from a queue that the workers themselves
  // extend, which is what makes this breadth-first without a barrier per level.
  const workerCount = robots.crawlDelayMs > 0 ? 1 : concurrency;
  const workers = Array.from({ length: workerCount }, async () => {
    while (results.length < maxPages && !signal?.aborted) {
      reorder();
      const next = queue.shift();
      if (!next) break;
      await visit(next);
    }
  });

  await Promise.all(workers);
  return results.slice(0, maxPages);
}
