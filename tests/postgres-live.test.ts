import { describe, expect, test } from "vitest";

/**
 * Exercises the real Postgres path against a live database.
 *
 * Skipped unless DATABASE_URL is set, so the ordinary suite and CI stay
 * offline and deterministic. Run it against a real Neon branch before a
 * deploy:
 *
 *   set -a && . ./.env.local && set +a && pnpm test
 *
 * It earns its place because the two drivers disagree in ways types cannot
 * catch — `run` versus `execute` was a real bug this caught before it
 * reached production.
 */
const live = Boolean(process.env.DATABASE_URL);

describe.skipIf(!live)("neon postgres (live)", () => {
  test("migrates, writes, scopes and cascades", async () => {
    const { ensureSchemaReady } = await import("@/lib/db/migrate");
    const q = await import("@/lib/db/queries");
    const { isPostgres } = await import("@/lib/db/client");

    expect(isPostgres()).toBe(true);

    await ensureSchemaReady();

    const project = await q.createProject({
      name: "Postgres smoke test",
      domain: `pg-smoke-${Date.now()}.example`,
      startUrl: "https://example.com",
      audience: "nobody",
    });
    expect(project.id).toBeTruthy();
    expect(project.ownerId).toBe("local");

    const found = await q.getProject(project.id);
    expect(found?.name).toBe("Postgres smoke test");

    const crawl = await q.createCrawl(project.id, 10);
    expect(crawl.status).toBe("queued");

    const summary = await q.projectSummary(project.id);
    expect(summary.pages).toBe(0);

    const listed = await q.listProjects();
    expect(listed.some((p) => p.id === project.id)).toBe(true);

    await q.deleteProject(project.id);
    expect(await q.getProject(project.id)).toBeNull();
    expect(await q.getCrawl(crawl.id)).toBeNull();
  }, 60_000);
});
