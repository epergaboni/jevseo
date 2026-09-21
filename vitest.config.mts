import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
      // `server-only` throws on import outside a React Server Component. It is
      // a build-time guard with no runtime behaviour worth exercising here.
      "server-only": fileURLToPath(new URL("./tests/stubs/server-only.ts", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    coverage: {
      provider: "v8",
      include: ["src/lib/**/*.ts"],
      // Excluded: these only wrap network I/O, which the suite does not exercise.
      // Excluded: modules whose whole job is network or multi-service
      // orchestration. Mocking them would produce a green number that proves
      // nothing. Everything with real logic — rules, scoring, credentials,
      // the SERP cache, robots parsing, URL canonicalisation and the database
      // layer — stays in and is tested against real files.
      exclude: [
        "src/lib/typesafe/**",
        "src/lib/serp/dataforseo.ts",
        "src/lib/judge/run.ts",
        "src/lib/judge/competitive.ts",
        "src/lib/judge/decisions.ts",
        "src/lib/crawl/pipeline.ts",
        "src/lib/crawl/crawler.ts",
        // Table declarations, not logic. schema-parity.test.ts proves the two
        // dialects agree, which is the only property worth asserting here.
        "src/lib/db/schema.ts",
        "src/lib/db/schema.pg.ts",
      ],
      thresholds: { lines: 80, functions: 80, branches: 75, statements: 80 },
    },
  },
});
