#!/usr/bin/env node
/**
 * Inspect or clear the cached SERP responses.
 *
 *   node scripts/serp-cache.mjs          list what is cached
 *   node scripts/serp-cache.mjs clear    delete every entry
 *
 * Each entry is a live DataForSEO lookup that was paid for once. Clearing the
 * cache means the next analysis of those queries spends again.
 */
import { existsSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { argv } from "node:process";

const DIR = join(process.cwd(), ".jevseo-cache/serp");
const ttl = Number(process.env.SERP_CACHE_TTL_HOURS ?? 24);

if (!existsSync(DIR)) {
  console.log("No SERP cache yet. The first competitor lookup creates it.");
  process.exit(0);
}

const files = readdirSync(DIR).filter((f) => f.endsWith(".json"));

if (argv[2] === "clear") {
  rmSync(DIR, { recursive: true, force: true });
  console.log(`Deleted ${files.length} cached ${files.length === 1 ? "entry" : "entries"}.`);
  console.log("The next analysis of those queries will spend DataForSEO credit again.");
  process.exit(0);
}

if (files.length === 0) {
  console.log("The SERP cache is empty.");
  process.exit(0);
}

let spent = 0;
const rows = files.map((file) => {
  const e = JSON.parse(readFileSync(join(DIR, file), "utf8"));
  spent += e.cost ?? 0;
  const ageH = (Date.now() - new Date(e.fetchedAt).getTime()) / 3_600_000;
  return {
    keyword: e.key.keyword,
    location: e.key.locationCode,
    results: e.competitors.length,
    age: ageH < 1 ? `${Math.round(ageH * 60)}m` : `${ageH.toFixed(1)}h`,
    live: ageH <= ttl,
    cost: e.cost ?? 0,
  };
});

console.log(`${rows.length} cached ${rows.length === 1 ? "lookup" : "lookups"} · TTL ${ttl}h\n`);
for (const r of rows.sort((a, b) => a.keyword.localeCompare(b.keyword))) {
  const state = r.live ? "fresh  " : "expired";
  console.log(`  ${state}  ${r.age.padStart(5)}  ${String(r.results).padStart(2)} results  $${r.cost.toFixed(4)}  ${r.keyword}`);
}
console.log(`\n$${spent.toFixed(4)} spent fetching these. Re-running any of the fresh ones costs nothing.`);
