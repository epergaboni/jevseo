import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Competitor } from "@/lib/types";

/**
 * Every live SERP lookup is billed, so the cache is a spend control, not just
 * a speed-up. These tests pin the behaviour that keeps it from re-charging.
 */
let dir: string;

async function load() {
  vi.resetModules();
  return import("@/lib/serp/cache");
}

const competitors: Competitor[] = [
  { rank: 1, url: "https://example.co.uk/a", title: "A", snippet: "first" },
  { rank: 2, url: "https://example.co.uk/b", title: "B", snippet: "second" },
];

const KEY = { keyword: "how much is car tax uk", locationCode: 2826, languageCode: "en" };

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "jevseo-serp-"));
  vi.spyOn(process, "cwd").mockReturnValue(dir);
  delete process.env.SERP_CACHE_TTL_HOURS;
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  rmSync(dir, { recursive: true, force: true });
});

function seed(fetchedAt: string, cost = 0.002) {
  return { key: KEY, fetchedAt, cost, competitors };
}

describe("cache round trip", () => {
  test("misses on an empty cache", async () => {
    const { readSerpCache } = await load();
    expect(readSerpCache(KEY.keyword, KEY.locationCode, KEY.languageCode)).toBeNull();
  });

  test("returns what was written", async () => {
    const { readSerpCache, writeSerpCache } = await load();
    writeSerpCache(seed(new Date().toISOString()));
    const hit = readSerpCache(KEY.keyword, KEY.locationCode, KEY.languageCode);
    expect(hit?.competitors).toHaveLength(2);
    expect(hit?.cost).toBe(0.002);
  });

  test("the key ignores case and surrounding whitespace", async () => {
    const { readSerpCache, writeSerpCache } = await load();
    writeSerpCache(seed(new Date().toISOString()));
    expect(readSerpCache("  HOW MUCH IS CAR TAX UK  ", 2826, "en")).not.toBeNull();
  });

  test("a different market is a different entry", async () => {
    const { readSerpCache, writeSerpCache } = await load();
    writeSerpCache(seed(new Date().toISOString()));
    expect(readSerpCache(KEY.keyword, 2840, "en")).toBeNull();
    expect(readSerpCache(KEY.keyword, 2826, "fr")).toBeNull();
  });
});

describe("expiry", () => {
  test("an entry inside the window is a hit", async () => {
    const { readSerpCache, writeSerpCache } = await load();
    writeSerpCache(seed(new Date(Date.now() - 60 * 60 * 1000).toISOString()));
    expect(readSerpCache(KEY.keyword, KEY.locationCode, KEY.languageCode)).not.toBeNull();
  });

  test("an entry past the window is a miss", async () => {
    const { readSerpCache, writeSerpCache } = await load();
    writeSerpCache(seed(new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString()));
    expect(readSerpCache(KEY.keyword, KEY.locationCode, KEY.languageCode)).toBeNull();
  });

  test("SERP_CACHE_TTL_HOURS shortens the window", async () => {
    vi.stubEnv("SERP_CACHE_TTL_HOURS", "1");
    const { readSerpCache, writeSerpCache } = await load();
    writeSerpCache(seed(new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString()));
    expect(readSerpCache(KEY.keyword, KEY.locationCode, KEY.languageCode)).toBeNull();
  });

  test("a TTL of zero disables the cache in both directions", async () => {
    vi.stubEnv("SERP_CACHE_TTL_HOURS", "0");
    const { readSerpCache, writeSerpCache, serpCacheStats } = await load();
    writeSerpCache(seed(new Date().toISOString()));
    expect(serpCacheStats().entries).toBe(0);
    expect(readSerpCache(KEY.keyword, KEY.locationCode, KEY.languageCode)).toBeNull();
  });

  test("a nonsense TTL falls back to the default rather than disabling the cache", async () => {
    vi.stubEnv("SERP_CACHE_TTL_HOURS", "not-a-number");
    const { readSerpCache, writeSerpCache } = await load();
    writeSerpCache(seed(new Date().toISOString()));
    expect(readSerpCache(KEY.keyword, KEY.locationCode, KEY.languageCode)).not.toBeNull();
  });
});

describe("robustness", () => {
  test("a corrupt entry is a miss, not a crash", async () => {
    const { readSerpCache } = await load();
    mkdirSync(join(dir, ".jevseo-cache/serp"), { recursive: true });
    for (const f of ["a.json", "b.json"]) {
      writeFileSync(join(dir, ".jevseo-cache/serp", f), "{ not json");
    }
    expect(() => readSerpCache(KEY.keyword, KEY.locationCode, KEY.languageCode)).not.toThrow();
    expect(readSerpCache(KEY.keyword, KEY.locationCode, KEY.languageCode)).toBeNull();
  });

  test("an entry with a broken timestamp is a miss", async () => {
    const { readSerpCache, writeSerpCache } = await load();
    writeSerpCache(seed("not-a-date"));
    expect(readSerpCache(KEY.keyword, KEY.locationCode, KEY.languageCode)).toBeNull();
  });
});

describe("management", () => {
  test("stats report the entry count and the window", async () => {
    const { writeSerpCache, serpCacheStats } = await load();
    writeSerpCache(seed(new Date().toISOString()));
    expect(serpCacheStats()).toEqual({ entries: 1, ttlHours: 24 });
  });

  test("clearing removes every entry and reports how many", async () => {
    const { writeSerpCache, clearSerpCache, readSerpCache } = await load();
    writeSerpCache(seed(new Date().toISOString()));
    writeSerpCache({ ...seed(new Date().toISOString()), key: { ...KEY, keyword: "another query" } });
    expect(clearSerpCache()).toBe(2);
    expect(readSerpCache(KEY.keyword, KEY.locationCode, KEY.languageCode)).toBeNull();
    expect(existsSync(join(dir, ".jevseo-cache/serp"))).toBe(false);
  });

  test("clearing an absent cache is a no-op", async () => {
    const { clearSerpCache } = await load();
    expect(clearSerpCache()).toBe(0);
  });
});

describe("describeAge", () => {
  test.each([
    [10_000, "just now"],
    [5 * 60_000, "5 minutes ago"],
    [60_000, "1 minute ago"],
    [3 * 3_600_000, "3 hours ago"],
  ])("renders %ims as %s", async (ms, expected) => {
    const { describeAge } = await load();
    expect(describeAge(new Date(Date.now() - ms).toISOString())).toBe(expected);
  });
});
