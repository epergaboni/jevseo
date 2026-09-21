import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

/**
 * The database layer, exercised against a real temporary SQLite file rather
 * than a mock. The properties worth proving are that the schema applies
 * cleanly and only once, that cascade deletes actually cascade, and that
 * every read is scoped by owner — the last one becomes a tenancy boundary the
 * moment accounts exist, so it must not silently regress.
 */
let dir: string;

async function load() {
  vi.resetModules();
  const [queries, migrate, client] = await Promise.all([
    import("@/lib/db/queries"),
    import("@/lib/db/migrate"),
    import("@/lib/db/client"),
  ]);
  return { ...queries, ...migrate, ...client };
}

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "jevseo-db-"));
  vi.spyOn(process, "cwd").mockReturnValue(dir);
  delete process.env.DATABASE_URL;
});

afterEach(() => {
  vi.restoreAllMocks();
  rmSync(dir, { recursive: true, force: true });
});

describe("schema", () => {
  test("creates the database file on first use", async () => {
    const { ensureSchema } = await load();
    ensureSchema();
    expect(existsSync(join(dir, ".jevseo", "jevseo.db"))).toBe(true);
  });

  test("is idempotent, so a second call is a no-op rather than an error", async () => {
    const { ensureSchema } = await load();
    ensureSchema();
    expect(() => ensureSchema()).not.toThrow();
  });

  test("records what it applied so migrations do not re-run", async () => {
    const { ensureSchema, rawSqlite } = await load();
    ensureSchema();
    const rows = rawSqlite().prepare("SELECT name FROM _migrations").all() as { name: string }[];
    expect(rows.map((r) => r.name)).toContain("0001_initial");
  });

  test("enables foreign keys, which SQLite leaves off by default", async () => {
    const { ensureSchema, rawSqlite } = await load();
    ensureSchema();
    const row = rawSqlite().prepare("PRAGMA foreign_keys").get() as Record<string, number>;
    expect(Object.values(row)[0]).toBe(1);
  });
});

describe("projects", () => {
  test("round-trips a project", async () => {
    const { createProject, getProject } = await load();
    const created = await createProject({
      name: "Acme",
      domain: "acme.co.uk",
      startUrl: "https://acme.co.uk",
      audience: "buyers",
    });
    const found = await getProject(created.id);
    expect(found?.name).toBe("Acme");
    expect(found?.domain).toBe("acme.co.uk");
  });

  test("defaults to the United Kingdom market", async () => {
    const { createProject } = await load();
    const p = await createProject({ name: "A", domain: "a.co.uk", startUrl: "https://a.co.uk" });
    expect(p.locationCode).toBe(2826);
    expect(p.languageCode).toBe("en");
  });

  test("stamps every project with an owner, so scoping has something to filter on", async () => {
    const { createProject } = await load();
    const p = await createProject({ name: "A", domain: "a.co.uk", startUrl: "https://a.co.uk" });
    expect(p.ownerId).toBe("local");
  });

  test("refuses two projects for the same domain and owner", async () => {
    const { createProject } = await load();
    await createProject({ name: "A", domain: "a.co.uk", startUrl: "https://a.co.uk" });
    await expect(
      createProject({ name: "B", domain: "a.co.uk", startUrl: "https://a.co.uk/other" }),
    ).rejects.toThrow();
  });

  test("a project belonging to another owner is invisible", async () => {
    const { createProject, getProject, rawSqlite, ensureSchema } = await load();
    const mine = await createProject({ name: "A", domain: "a.co.uk", startUrl: "https://a.co.uk" });
    ensureSchema();
    rawSqlite()
      .prepare("UPDATE projects SET owner_id = 'someone-else' WHERE id = ?")
      .run(mine.id);
    expect(await getProject(mine.id)).toBeNull();
  });

  test("listing returns only this owner's projects", async () => {
    const { createProject, listProjects, rawSqlite } = await load();
    await createProject({ name: "Mine", domain: "mine.co.uk", startUrl: "https://mine.co.uk" });
    const theirs = await createProject({
      name: "Theirs",
      domain: "theirs.co.uk",
      startUrl: "https://theirs.co.uk",
    });
    rawSqlite().prepare("UPDATE projects SET owner_id = 'other' WHERE id = ?").run(theirs.id);

    const listed = await listProjects();
    expect(listed.map((p) => p.name)).toEqual(["Mine"]);
  });

  test("deleting a project cascades to its crawls", async () => {
    const { createProject, createCrawl, getCrawl, deleteProject } = await load();
    const p = await createProject({ name: "A", domain: "a.co.uk", startUrl: "https://a.co.uk" });
    const crawl = await createCrawl(p.id, 10);
    await deleteProject(p.id);
    expect(await getCrawl(crawl.id)).toBeNull();
  });
});

describe("crawls", () => {
  test("a new crawl starts queued with nothing done", async () => {
    const { createProject, createCrawl } = await load();
    const p = await createProject({ name: "A", domain: "a.co.uk", startUrl: "https://a.co.uk" });
    const c = await createCrawl(p.id, 25);
    expect(c.status).toBe("queued");
    expect(c.pagesFound).toBe(0);
    expect(c.maxPages).toBe(25);
  });

  test("latestCrawl returns the most recent", async () => {
    const { createProject, createCrawl, latestCrawl } = await load();
    const p = await createProject({ name: "A", domain: "a.co.uk", startUrl: "https://a.co.uk" });
    await createCrawl(p.id, 10);
    const second = await createCrawl(p.id, 50);
    expect((await latestCrawl(p.id))?.id).toBe(second.id);
  });

  test("a project with no crawls has no latest crawl", async () => {
    const { createProject, latestCrawl } = await load();
    const p = await createProject({ name: "A", domain: "a.co.uk", startUrl: "https://a.co.uk" });
    expect(await latestCrawl(p.id)).toBeNull();
  });
});

describe("summary", () => {
  test("reports zeroes for an untouched project rather than throwing", async () => {
    const { createProject, projectSummary } = await load();
    const p = await createProject({ name: "A", domain: "a.co.uk", startUrl: "https://a.co.uk" });
    expect(await projectSummary(p.id)).toEqual({
      pages: 0,
      analysed: 0,
      avgOverall: null,
      avgSeo: null,
      avgAeo: null,
      avgGeo: null,
    });
  });
});

describe("postgres guard", () => {
  test("refuses to fall back to a local file when DATABASE_URL is set", async () => {
    vi.stubEnv("DATABASE_URL", "postgres://user:pass@host/db");
    const { getDb, isPostgres } = await load();
    expect(isPostgres()).toBe(true);
    // Silently writing to a file that a deployment will never read is the
    // failure this guard exists to prevent.
    expect(() => getDb()).toThrow(/Postgres/i);
    vi.unstubAllEnvs();
  });
});
