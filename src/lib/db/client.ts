import "server-only";
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { drizzle as drizzleProxy } from "drizzle-orm/sqlite-proxy";
import { neon } from "@neondatabase/serverless";
import { drizzle as drizzleNeon } from "drizzle-orm/neon-http";
import * as schema from "@/lib/db/schema";
import * as pgSchema from "@/lib/db/schema.pg";

/**
 * One database layer, two homes.
 *
 * Locally it is a single SQLite file, through `node:sqlite` — built into
 * Node 22+, so `git clone && pnpm dev` needs no native build, no postinstall
 * and no signup.
 *
 * A deployed instance cannot use that file: a serverless filesystem is
 * ephemeral and per-invocation, so writes would vanish. Setting DATABASE_URL
 * switches the whole app to Postgres instead, which is checked at startup
 * rather than discovered when data goes missing.
 */

export const DB_FILE = join(".jevseo", "jevseo.db");

function dbPath(): string {
  return join(process.cwd(), DB_FILE);
}

let sqlite: DatabaseSync | null = null;

function connection(): DatabaseSync {
  if (sqlite) return sqlite;
  const path = dbPath();
  mkdirSync(dirname(path), { recursive: true });
  const db = new DatabaseSync(path);
  // WAL survives concurrent readers during a crawl; foreign keys are off by
  // default in SQLite and the cascade deletes depend on them.
  db.exec("PRAGMA journal_mode = WAL");
  db.exec("PRAGMA foreign_keys = ON");
  db.exec("PRAGMA busy_timeout = 5000");
  sqlite = db;
  return db;
}

/**
 * Drizzle's sqlite-proxy hands us raw SQL and expects rows back. `run` returns
 * nothing useful, `get` one row, and `all`/`values` an array — and the proxy
 * wants positional arrays for `values`, objects otherwise.
 */
function execute(sqlText: string, params: unknown[], method: string): { rows: unknown[] } {
  const db = connection();

  if (method === "run") {
    db.prepare(sqlText).run(...(params as never[]));
    return { rows: [] };
  }

  const statement = db.prepare(sqlText);
  const rows = statement.all(...(params as never[])) as Record<string, unknown>[];

  if (method === "get") {
    const first = rows[0];
    return { rows: first ? [Object.values(first)] : [] };
  }
  // `all` and `values` both want positional arrays from the proxy driver.
  return { rows: rows.map((row) => Object.values(row)) };
}

export function isPostgres(): boolean {
  return Boolean(process.env.DATABASE_URL);
}

let cachedSqlite: ReturnType<typeof drizzleProxy<typeof schema>> | null = null;
let cachedPg: ReturnType<typeof drizzleNeon<typeof pgSchema>> | null = null;

/**
 * Neon over HTTP rather than a TCP pool.
 *
 * A serverless function is short-lived and there can be many at once, so a
 * connection pool is the wrong shape: connections outlive the request that
 * opened them and the database runs out. The HTTP driver issues one stateless
 * request per query, which is what this workload actually does.
 *
 * Initialised lazily, because `neon()` throws on a missing DATABASE_URL and
 * Next evaluates module scope at build time — an eager call would break
 * `next build` on the first deploy, before the integration is provisioned.
 */
function postgresDb() {
  cachedPg ??= drizzleNeon(neon(process.env.DATABASE_URL!), { schema: pgSchema });
  return cachedPg;
}

function sqliteDb() {
  cachedSqlite ??= drizzleProxy<typeof schema>(
    async (sqlText, params, method) => execute(sqlText, params, method),
    { schema },
  );
  return cachedSqlite;
}

/**
 * The database for this environment.
 *
 * The two drivers expose the same query-builder surface over schemas that a
 * parity test keeps identical, so callers do not branch. The return type is
 * widened deliberately: pinning it to one dialect would make every query file
 * dialect-specific for no benefit.
 */
export function getDb() {
  return (isPostgres() ? postgresDb() : sqliteDb()) as ReturnType<typeof sqliteDb>;
}

/**
 * Nothing to close: the HTTP driver is stateless and holds no socket. Kept as
 * a named no-op so callers do not grow a connection-lifecycle habit that the
 * SQLite path would not honour either.
 */
export async function closeDb(): Promise<void> {}

/** Raw handle, for migrations and anything Drizzle should not own. */
export function rawSqlite(): DatabaseSync {
  return connection();
}

/**
 * Raw Neon handle for DDL.
 *
 * Migrations are plain SQL and have no business going through the query
 * builder — and the two drivers disagree about how to run raw statements
 * (`run` versus `execute`), which the widened return type of getDb() would
 * hide until runtime.
 */
export function rawPostgres() {
  return neon(process.env.DATABASE_URL!);
}
