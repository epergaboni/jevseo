import * as cheerio from "cheerio";

/**
 * Pure URL and link logic, kept apart from anything that touches the network
 * so it can be tested directly rather than mocked.
 */

/** Linked, but not a page worth judging. */
export const NON_PAGE =
  /\.(pdf|docx?|xlsx?|pptx?|zip|gz|rar|jpe?g|png|gif|svg|webp|avif|ico|mp4|webm|mp3|wav|css|js|json|xml|rss|atom)$/i;

export function sameOrigin(url: string, origin: string): boolean {
  try {
    return new URL(url).origin === origin;
  } catch {
    return false;
  }
}

/** Collapse the variations that render the same page into one key. */
export function canonicaliseUrl(raw: string, base?: string): string | null {
  try {
    const url = new URL(raw, base);
    url.hash = "";
    for (const key of [...url.searchParams.keys()]) {
      if (/^(utm_|fbclid|gclid|mc_|ref$|source$)/i.test(key)) url.searchParams.delete(key);
    }
    url.searchParams.sort();
    if (url.pathname.length > 1 && url.pathname.endsWith("/")) {
      url.pathname = url.pathname.replace(/\/+$/, "");
    }
    return url.toString();
  } catch {
    return null;
  }
}

/**
 * How closely a URL sits to the seed in the path hierarchy.
 *
 * Plain breadth-first is wrong on a large multi-topic domain: seeding at
 * gov.uk/vehicle-tax and following links lands you in Commonwealth
 * Scholarships within two hops. Pages under the seed's own path are what the
 * operator meant, so they go first and unrelated branches fill what is left.
 */
export function pathAffinity(url: string, seedSegments: string[]): number {
  let segments: string[];
  try {
    segments = new URL(url).pathname.split("/").filter(Boolean);
  } catch {
    return 0;
  }
  // The site root is a legitimate target, not an unrelated branch.
  if (segments.length === 0) return seedSegments.length;

  let shared = 0;
  while (
    shared < seedSegments.length &&
    shared < segments.length &&
    segments[shared] === seedSegments[shared]
  ) {
    shared += 1;
  }
  return shared;
}

export function pathSegments(url: string): string[] {
  try {
    return new URL(url).pathname.split("/").filter(Boolean);
  } catch {
    return [];
  }
}

/** Same-origin page links from a document, canonicalised and deduplicated. */
export function extractLinks(html: string, base: string, origin: string): string[] {
  const $ = cheerio.load(html);
  const found = new Set<string>();

  $("a[href]").each((_, el) => {
    const href = $(el).attr("href");
    if (!href) return;
    if (/^(mailto:|tel:|javascript:|#)/i.test(href.trim())) return;

    const resolved = canonicaliseUrl(href, base);
    if (!resolved || !sameOrigin(resolved, origin)) return;
    try {
      if (NON_PAGE.test(new URL(resolved).pathname)) return;
    } catch {
      return;
    }
    found.add(resolved);
  });

  return [...found];
}
