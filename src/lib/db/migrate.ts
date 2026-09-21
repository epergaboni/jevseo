import "server-only";
import { isPostgres, rawPostgres, rawSqlite } from "@/lib/db/client";

/**
 * Migrations, applied in order and recorded so they run once.
 *
 * Hand-written rather than generated, because the file has to be readable by
 * anyone auditing what the tool stores on their machine, and because the app
 * must be able to bring its own database up on first run without a CLI step.
 * Never edit a shipped migration; append a new one.
 */
const MIGRATIONS: { name: string; sql: string }[] = [
  {
    name: "0001_initial",
    sql: `
CREATE TABLE IF NOT EXISTS projects (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL DEFAULT 'local',
  name TEXT NOT NULL,
  domain TEXT NOT NULL,
  start_url TEXT NOT NULL,
  audience TEXT,
  location_code INTEGER NOT NULL DEFAULT 2826,
  language_code TEXT NOT NULL DEFAULT 'en',
  created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
);
CREATE INDEX IF NOT EXISTS projects_owner_idx ON projects (owner_id);
CREATE UNIQUE INDEX IF NOT EXISTS projects_owner_domain_idx ON projects (owner_id, domain);

CREATE TABLE IF NOT EXISTS crawls (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'queued',
  max_pages INTEGER NOT NULL DEFAULT 25,
  pages_found INTEGER NOT NULL DEFAULT 0,
  pages_analysed INTEGER NOT NULL DEFAULT 0,
  input_tokens INTEGER NOT NULL DEFAULT 0,
  serp_cost_micros INTEGER NOT NULL DEFAULT 0,
  error TEXT,
  created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
  finished_at INTEGER
);
CREATE INDEX IF NOT EXISTS crawls_project_idx ON crawls (project_id, created_at);

CREATE TABLE IF NOT EXISTS pages (
  id TEXT PRIMARY KEY,
  crawl_id TEXT NOT NULL REFERENCES crawls(id) ON DELETE CASCADE,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  url TEXT NOT NULL,
  discovered_via TEXT NOT NULL,
  depth INTEGER NOT NULL DEFAULT 0,
  status_code INTEGER,
  title TEXT,
  word_count INTEGER,
  facts TEXT,
  fetch_error TEXT,
  created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
);
CREATE INDEX IF NOT EXISTS pages_crawl_idx ON pages (crawl_id);
CREATE UNIQUE INDEX IF NOT EXISTS pages_crawl_url_idx ON pages (crawl_id, url);

CREATE TABLE IF NOT EXISTS page_reports (
  id TEXT PRIMARY KEY,
  page_id TEXT NOT NULL REFERENCES pages(id) ON DELETE CASCADE,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  overall INTEGER NOT NULL,
  seo INTEGER NOT NULL,
  aeo INTEGER NOT NULL,
  geo INTEGER NOT NULL,
  target_query TEXT,
  judgments TEXT NOT NULL,
  rules TEXT NOT NULL,
  fixes TEXT NOT NULL,
  model TEXT NOT NULL,
  input_tokens INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
);
CREATE INDEX IF NOT EXISTS reports_project_idx ON page_reports (project_id, created_at);
CREATE INDEX IF NOT EXISTS reports_page_idx ON page_reports (page_id);

CREATE TABLE IF NOT EXISTS page_decisions (
  id TEXT PRIMARY KEY,
  page_id TEXT NOT NULL REFERENCES pages(id) ON DELETE CASCADE,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  action TEXT NOT NULL,
  confidence_pct INTEGER NOT NULL,
  probabilities TEXT NOT NULL,
  opportunity INTEGER NOT NULL DEFAULT 0,
  effort INTEGER NOT NULL DEFAULT 0,
  reason TEXT,
  created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
);
CREATE INDEX IF NOT EXISTS decisions_project_idx ON page_decisions (project_id);

CREATE TABLE IF NOT EXISTS cannibal_pairs (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  page_a_id TEXT NOT NULL REFERENCES pages(id) ON DELETE CASCADE,
  page_b_id TEXT NOT NULL REFERENCES pages(id) ON DELETE CASCADE,
  overlap_pct INTEGER NOT NULL,
  recommendation TEXT,
  created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
);
CREATE INDEX IF NOT EXISTS cannibal_project_idx ON cannibal_pairs (project_id);

CREATE TABLE IF NOT EXISTS keywords (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  keyword TEXT NOT NULL,
  volume INTEGER,
  difficulty INTEGER,
  cpc_micros INTEGER,
  source TEXT NOT NULL DEFAULT 'dataforseo',
  verdict TEXT,
  verdict_confidence_pct INTEGER,
  verdict_reason TEXT,
  assigned_page_id TEXT REFERENCES pages(id) ON DELETE SET NULL,
  created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
);
CREATE INDEX IF NOT EXISTS keywords_project_idx ON keywords (project_id);
CREATE UNIQUE INDEX IF NOT EXISTS keywords_project_keyword_idx ON keywords (project_id, keyword);

CREATE TABLE IF NOT EXISTS plan_items (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,
  title TEXT NOT NULL,
  detail TEXT NOT NULL,
  evidence TEXT,
  priority INTEGER NOT NULL DEFAULT 0,
  impact INTEGER NOT NULL DEFAULT 0,
  effort INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'todo',
  page_id TEXT REFERENCES pages(id) ON DELETE CASCADE,
  keyword_id TEXT REFERENCES keywords(id) ON DELETE SET NULL,
  confidence_pct INTEGER,
  created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
);
CREATE INDEX IF NOT EXISTS plan_project_idx ON plan_items (project_id, status, priority);

CREATE TABLE IF NOT EXISTS snapshots (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  crawl_id TEXT NOT NULL REFERENCES crawls(id) ON DELETE CASCADE,
  url TEXT NOT NULL,
  overall INTEGER NOT NULL,
  seo INTEGER NOT NULL,
  aeo INTEGER NOT NULL,
  geo INTEGER NOT NULL,
  created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
);
CREATE INDEX IF NOT EXISTS snapshots_project_url_idx ON snapshots (project_id, url, created_at);
`,
  },
];

/**
 * The same tables in Postgres dialect. Kept beside the SQLite version rather
 * than translated at runtime, because a silent dialect mismatch in a CREATE
 * TABLE is the kind of thing that only shows up in production.
 */
const PG_MIGRATIONS: { name: string; sql: string }[] = MIGRATIONS.map((m) => ({
  name: m.name,
  sql: m.sql
    .replace(/INTEGER NOT NULL DEFAULT \(unixepoch\(\) \* 1000\)/g, "TIMESTAMPTZ NOT NULL DEFAULT NOW()")
    .replace(/(\bfinished_at\s+)INTEGER/g, "$1TIMESTAMPTZ")
    .replace(/\b(facts|judgments|rules|fixes|probabilities)\s+TEXT/g, "$1 JSONB"),
}));

let applied = false;
let pgApplied = false;

/**
 * Bring the Postgres schema up. Runs the same statements as the local path,
 * translated to the Postgres dialect, so a fresh deployment needs no separate
 * migration step.
 */
export async function ensureSchemaPostgres(): Promise<void> {
  if (pgApplied) return;
  const sql = rawPostgres();

  await sql`CREATE TABLE IF NOT EXISTS _migrations (
    name TEXT PRIMARY KEY,
    applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`;

  const existing = (await sql`SELECT name FROM _migrations`) as { name: string }[];
  const done = new Set(existing.map((r) => r.name));

  for (const migration of PG_MIGRATIONS) {
    if (done.has(migration.name)) continue;
    // The HTTP driver takes one statement per call, so the file is split.
    for (const statement of migration.sql.split(";").map((x) => x.trim()).filter(Boolean)) {
      await sql.query(statement);
    }
    await sql`INSERT INTO _migrations (name) VALUES (${migration.name})`;
  }
  pgApplied = true;
}

/** Idempotent. Safe to call on every request; the work happens once. */
export function ensureSchema(): void {
  // Postgres migration is async and runs through ensureSchemaReady instead.
  if (isPostgres()) return;
  if (applied) return;
  const db = rawSqlite();

  db.exec(`CREATE TABLE IF NOT EXISTS _migrations (
    name TEXT PRIMARY KEY,
    applied_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
  )`);

  const done = new Set(
    (db.prepare("SELECT name FROM _migrations").all() as { name: string }[]).map((r) => r.name),
  );

  for (const migration of MIGRATIONS) {
    if (done.has(migration.name)) continue;
    db.exec("BEGIN");
    try {
      db.exec(migration.sql);
      db.prepare("INSERT INTO _migrations (name) VALUES (?)").run(migration.name);
      db.exec("COMMIT");
    } catch (error) {
      db.exec("ROLLBACK");
      throw new Error(
        `Migration ${migration.name} failed: ${error instanceof Error ? error.message : error}`,
      );
    }
  }
  applied = true;
}

/**
 * The entry point callers use. Hides the fact that one dialect can migrate
 * synchronously and the other cannot.
 */
export async function ensureSchemaReady(): Promise<void> {
  if (isPostgres()) await ensureSchemaPostgres();
  else ensureSchema();
}
