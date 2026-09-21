import "server-only";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Competitor } from "@/lib/types";

/**
 * Disk cache for SERP responses.
 *
 * Every live DataForSEO request is billed, and a results page does not change
 * meaningfully within a day. Re-analysing the same query — a re-run after
 * editing a page, a second click, a demo — must not spend again.
 */

const CACHE_DIR = ".jevseo-cache/serp";
const DEFAULT_TTL_HOURS = 24;

export interface CachedSerp {
  key: { keyword: string; locationCode: number; languageCode: string };
  fetchedAt: string;
  cost: number;
  competitors: Competitor[];
}

function ttlMs(): number {
  const raw = Number(process.env.SERP_CACHE_TTL_HOURS);
  const hours = Number.isFinite(raw) && raw >= 0 ? raw : DEFAULT_TTL_HOURS;
  return hours * 60 * 60 * 1000;
}

function cacheDir(): string {
  return join(process.cwd(), CACHE_DIR);
}

function fileFor(keyword: string, locationCode: number, languageCode: string): string {
  const digest = createHash("sha256")
    .update(`${keyword.trim().toLowerCase()}|${locationCode}|${languageCode}`)
    .digest("hex")
    .slice(0, 32);
  return join(cacheDir(), `${digest}.json`);
}

export function readSerpCache(
  keyword: string,
  locationCode: number,
  languageCode: string,
): CachedSerp | null {
  const ttl = ttlMs();
  if (ttl === 0) return null;

  const path = fileFor(keyword, locationCode, languageCode);
  if (!existsSync(path)) return null;

  try {
    const entry = JSON.parse(readFileSync(path, "utf8")) as CachedSerp;
    const age = Date.now() - new Date(entry.fetchedAt).getTime();
    if (!Number.isFinite(age) || age > ttl) return null;
    if (!Array.isArray(entry.competitors)) return null;
    return entry;
  } catch {
    // A corrupt entry is simply a miss; the next fetch overwrites it.
    return null;
  }
}

export function writeSerpCache(entry: CachedSerp): void {
  if (ttlMs() === 0) return;
  try {
    mkdirSync(cacheDir(), { recursive: true });
    writeFileSync(
      fileFor(entry.key.keyword, entry.key.locationCode, entry.key.languageCode),
      `${JSON.stringify(entry, null, 2)}\n`,
      "utf8",
    );
  } catch {
    // Caching is an optimisation. Failing to write must never fail an analysis.
  }
}

export function clearSerpCache(): number {
  const dir = cacheDir();
  if (!existsSync(dir)) return 0;
  const files = readdirSync(dir).filter((f) => f.endsWith(".json"));
  rmSync(dir, { recursive: true, force: true });
  return files.length;
}

export function serpCacheStats(): { entries: number; ttlHours: number } {
  const dir = cacheDir();
  const entries = existsSync(dir) ? readdirSync(dir).filter((f) => f.endsWith(".json")).length : 0;
  return { entries, ttlHours: ttlMs() / 3_600_000 };
}

export function describeAge(fetchedAt: string): string {
  const minutes = Math.round((Date.now() - new Date(fetchedAt).getTime()) / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? "" : "s"} ago`;
  const hours = Math.round(minutes / 60);
  return `${hours} hour${hours === 1 ? "" : "s"} ago`;
}
