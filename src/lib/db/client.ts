import "server-only";
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { drizzle as drizzleProxy } from "drizzle-orm/sqlite-proxy";
import * as schema from "@/lib/db/schema";

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

let cached: ReturnType<typeof drizzleProxy<typeof schema>> | null = null;

export function getDb() {
  if (isPostgres()) {
    throw new Error(
      "DATABASE_URL is set, but the Postgres driver is not wired up yet. Unset it to use the local SQLite file, or finish the Postgres adapter in src/lib/db/client.ts.",
    );
  }
  cached ??= drizzleProxy<typeof schema>(
    async (sqlText, params, method) => execute(sqlText, params, method),
    { schema },
  );
  return cached;
}

/** Raw handle, for migrations and anything Drizzle should not own. */
export function rawSqlite(): DatabaseSync {
  return connection();
}
