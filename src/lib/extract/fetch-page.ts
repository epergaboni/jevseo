import * as cheerio from "cheerio";
import type { PageFacts } from "@/lib/types";

/** Model context budget. Jev allows 32k tokens for state + longest question. */
const MAX_TEXT_CHARS = 28_000;
const FETCH_TIMEOUT_MS = 15_000;
const MAX_HTML_BYTES = 5_000_000;

const USER_AGENT =
  "Mozilla/5.0 (compatible; JevSEO/1.0; +https://github.com/jevseo) AnalyserBot";

/** Elements that never belong in the judged content. */
const STRIP = "script,style,noscript,svg,iframe,nav,header,footer,aside,form,template";

export class FetchError extends Error {
  constructor(message: string, readonly statusCode: number | null = null) {
    super(message);
    this.name = "FetchError";
  }
}

function assertPublicUrl(raw: string): URL {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    throw new FetchError(`"${raw}" is not a valid URL.`);
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new FetchError("Only http and https URLs can be analysed.");
  }
  const host = url.hostname.toLowerCase();
  const isPrivate =
    host === "localhost" ||
    host.endsWith(".localhost") ||
    host === "0.0.0.0" ||
    host === "[::1]" ||
    /^127\./.test(host) ||
    /^10\./.test(host) ||
    /^192\.168\./.test(host) ||
    /^169\.254\./.test(host) ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(host) ||
    !host.includes(".");
  if (isPrivate) {
    throw new FetchError("Private, loopback and link-local addresses are blocked.");
  }
  return url;
}

export async function fetchPage(rawUrl: string): Promise<{ html: string; url: string; statusCode: number; responseMs: number }> {
  const url = assertPublicUrl(rawUrl);
  const started = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const res = await fetch(url, {
      redirect: "follow",
      signal: controller.signal,
      headers: { "user-agent": USER_AGENT, accept: "text/html,application/xhtml+xml" },
    });
    const responseMs = Date.now() - started;

    if (!res.ok) {
      // 403 and 429 from a live site almost always mean bot protection rather
      // than a broken page, and the fix is different, so say which it is.
      const blocked = res.status === 403 || res.status === 429 || res.status === 401;
      throw new FetchError(
        blocked
          ? `The site refused the request with HTTP ${res.status}. It is most likely blocking automated traffic rather than being down.`
          : `The page returned HTTP ${res.status}.`,
        res.status,
      );
    }
    const contentType = res.headers.get("content-type") ?? "";
    if (contentType && !contentType.includes("html") && !contentType.includes("xml")) {
      throw new FetchError(`Expected an HTML document but got "${contentType}".`, res.status);
    }

    const buffer = await res.arrayBuffer();
    if (buffer.byteLength > MAX_HTML_BYTES) {
      throw new FetchError("The document is too large to analyse (over 5 MB).", res.status);
    }
    return {
      html: new TextDecoder("utf-8").decode(buffer),
      url: res.url || url.toString(),
      statusCode: res.status,
      responseMs,
    };
  } catch (error) {
    if (error instanceof FetchError) throw error;
    if (error instanceof Error && error.name === "AbortError") {
      throw new FetchError("The page took longer than 15 seconds to respond.");
    }
    throw new FetchError(
      `Could not reach the page: ${error instanceof Error ? error.message : "unknown error"}.`,
    );
  } finally {
    clearTimeout(timer);
  }
}

function collectSchemaTypes($: cheerio.CheerioAPI): string[] {
  const types = new Set<string>();

  const walk = (node: unknown): void => {
    if (Array.isArray(node)) {
      node.forEach(walk);
      return;
    }
    if (!node || typeof node !== "object") return;
    const record = node as Record<string, unknown>;
    const type = record["@type"];
    if (typeof type === "string") types.add(type);
    if (Array.isArray(type)) type.forEach((t) => typeof t === "string" && types.add(t));
    Object.values(record).forEach(walk);
  };

  $('script[type="application/ld+json"]').each((_, el) => {
    const raw = $(el).text().trim();
    if (!raw) return;
    try {
      walk(JSON.parse(raw));
    } catch {
      // A malformed JSON-LD block is itself a finding; the rule layer reports it.
      types.add("__invalid_jsonld__");
    }
  });

  // Microdata fallback.
  $("[itemtype]").each((_, el) => {
    const itemtype = $(el).attr("itemtype");
    if (itemtype) types.add(itemtype.split("/").pop() ?? itemtype);
  });

  return [...types];
}

function normaliseWhitespace(input: string): string {
  return input
    .replace(/[ \t ]+/g, " ")
    .split("\n")
    .map((line) => line.trim())
    // Block-level extraction leaves runs of whitespace-only lines behind. They
    // say nothing and cost context budget, so collapse them to one.
    .filter((line, index, lines) => line !== "" || lines[index - 1] !== "")
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Pull deterministic signals out of raw HTML. No model involved. */
export function extractFacts(
  html: string,
  meta: { url: string | null; statusCode: number | null; responseMs: number | null },
): PageFacts {
  const $ = cheerio.load(html);
  const htmlBytes = Buffer.byteLength(html, "utf8");

  const openGraph: Record<string, string> = {};
  $('meta[property^="og:"], meta[name^="twitter:"]').each((_, el) => {
    const key = $(el).attr("property") ?? $(el).attr("name");
    const value = $(el).attr("content");
    if (key && value) openGraph[key] = value;
  });

  const body = $("main").length ? $("main") : $("article").length ? $("article") : $("body");
  const scoped = body.clone();
  scoped.find(STRIP).remove();

  // Links are counted inside the content region only. Navigation and footer
  // links are boilerplate — counting them would let a mega-menu satisfy the
  // internal-linking rule without a single contextual link.
  const origin = meta.url ? safeOrigin(meta.url) : null;
  let internalLinks = 0;
  let externalLinks = 0;
  const outboundDomains = new Set<string>();

  scoped.find("a[href]").each((_, el) => {
    const href = $(el).attr("href");
    if (!href || href.startsWith("#") || href.startsWith("mailto:") || href.startsWith("tel:")) return;
    if (!origin) return;
    try {
      const resolved = new URL(href, meta.url ?? undefined);
      if (resolved.origin === origin) internalLinks += 1;
      else {
        externalLinks += 1;
        outboundDomains.add(resolved.hostname.replace(/^www\./, ""));
      }
    } catch {
      // Unresolvable href; ignore for counting purposes.
    }
  });

  const imageCount = scoped.find("img").length;
  const imagesMissingAlt = scoped.find("img").filter((_, el) => {
    const alt = $(el).attr("alt");
    return alt === undefined || alt.trim() === "";
  }).length;

  const listCount = scoped.find("ul, ol").length;
  const tableCount = scoped.find("table").length;

  const headings: { level: number; text: string }[] = [];
  scoped.find("h1,h2,h3,h4,h5,h6").each((_, el) => {
    const text = normaliseWhitespace($(el).text());
    if (text) headings.push({ level: Number(el.tagName.slice(1)), text });
  });

  const paragraphs = scoped
    .find("p")
    .map((_, el) => normaliseWhitespace($(el).text()))
    .get()
    .filter((p) => p.length > 0);

  const text = normaliseWhitespace(scoped.text());
  const wordCount = text.split(/\s+/).filter(Boolean).length;
  const textTruncated = text.length > MAX_TEXT_CHARS;

  const bylineText = $('[rel="author"], [itemprop="author"], .author, .byline, [class*="author"]')
    .first()
    .text()
    .trim();

  return {
    url: meta.url,
    fetchedAt: new Date().toISOString(),
    statusCode: meta.statusCode,
    responseMs: meta.responseMs,
    htmlBytes,
    title: $("title").first().text().trim() || null,
    metaDescription: $('meta[name="description"]').attr("content")?.trim() ?? null,
    canonical: $('link[rel="canonical"]').attr("href")?.trim() ?? null,
    robotsMeta: $('meta[name="robots"]').attr("content")?.trim() ?? null,
    lang: $("html").attr("lang")?.trim() ?? null,
    h1: $("h1").map((_, el) => normaliseWhitespace($(el).text())).get().filter(Boolean),
    headings,
    schemaTypes: collectSchemaTypes($),
    openGraph,
    wordCount,
    paragraphCount: paragraphs.length,
    listCount,
    tableCount,
    imageCount,
    imagesMissingAlt,
    internalLinks,
    externalLinks,
    outboundDomains: [...outboundDomains].slice(0, 25),
    isHttps: meta.url ? meta.url.startsWith("https://") : true,
    hasAuthorByline: bylineText.length > 1,
    publishedDate:
      $('meta[property="article:published_time"]').attr("content")?.trim() ??
      $("time[datetime]").first().attr("datetime")?.trim() ??
      null,
    modifiedDate: $('meta[property="article:modified_time"]').attr("content")?.trim() ?? null,
    text: textTruncated ? `${text.slice(0, MAX_TEXT_CHARS)}\n\n[content truncated]` : text,
    textTruncated,
  };
}

function safeOrigin(url: string): string | null {
  try {
    return new URL(url).origin;
  } catch {
    return null;
  }
}

/** Build facts for pasted content, where most HTML signals genuinely do not exist. */
export function factsFromContent(content: string): PageFacts {
  const trimmed = content.trim();
  const lines = trimmed.split("\n");
  const headings: { level: number; text: string }[] = [];

  for (const line of lines) {
    const match = /^(#{1,6})\s+(.*)$/.exec(line.trim());
    if (match) headings.push({ level: match[1].length, text: match[2].trim() });
  }

  const h1 = headings.filter((h) => h.level === 1).map((h) => h.text);
  const plain = trimmed.replace(/^#{1,6}\s+/gm, "");
  const truncated = plain.length > MAX_TEXT_CHARS;

  return {
    url: null,
    fetchedAt: new Date().toISOString(),
    statusCode: null,
    responseMs: null,
    htmlBytes: null,
    title: h1[0] ?? null,
    metaDescription: null,
    canonical: null,
    robotsMeta: null,
    lang: null,
    h1,
    headings,
    schemaTypes: [],
    openGraph: {},
    wordCount: plain.split(/\s+/).filter(Boolean).length,
    paragraphCount: plain.split(/\n\s*\n/).filter((p) => p.trim().length > 0).length,
    listCount: lines.filter((l) => /^\s*([-*+]|\d+\.)\s+/.test(l)).length > 0 ? 1 : 0,
    tableCount: lines.filter((l) => l.trim().startsWith("|")).length > 2 ? 1 : 0,
    imageCount: 0,
    imagesMissingAlt: 0,
    internalLinks: 0,
    externalLinks: 0,
    outboundDomains: [],
    isHttps: true,
    hasAuthorByline: false,
    publishedDate: null,
    modifiedDate: null,
    text: truncated ? `${plain.slice(0, MAX_TEXT_CHARS)}\n\n[content truncated]` : plain,
    textTruncated: truncated,
  };
}
