import { describe, expect, test } from "vitest";
import { getTableColumns, getTableName } from "drizzle-orm";
import * as sqliteSchema from "@/lib/db/schema";
import * as pgSchema from "@/lib/db/schema.pg";

/**
 * The app runs on SQLite locally and Postgres when deployed, which means two
 * schema declarations. They are a translation of one another, and a drift
 * between them is the worst kind of bug: everything passes locally and the
 * deployment fails on a column that does not exist.
 *
 * These tests fail the build the moment the two disagree.
 */

type TableLike = { [k: string]: unknown };

function tables(mod: Record<string, unknown>): Map<string, TableLike> {
  const out = new Map<string, TableLike>();
  for (const value of Object.values(mod)) {
    if (!value || typeof value !== "object") continue;
    try {
      const name = getTableName(value as never);
      if (typeof name === "string") out.set(name, value as TableLike);
    } catch {
      // Not a table (a type export, a constant). Skip it.
    }
  }
  return out;
}

const sqliteTables = tables(sqliteSchema as Record<string, unknown>);
const pgTables = tables(pgSchema as Record<string, unknown>);

describe("schema parity", () => {
  test("both dialects declare at least the core tables", () => {
    expect(sqliteTables.size).toBeGreaterThanOrEqual(8);
  });

  test("the same tables exist in both", () => {
    expect([...pgTables.keys()].sort()).toEqual([...sqliteTables.keys()].sort());
  });

  test.each([...sqliteTables.keys()])("%s has the same columns in both", (name) => {
    const a = Object.keys(getTableColumns(sqliteTables.get(name) as never)).sort();
    const b = Object.keys(getTableColumns(pgTables.get(name) as never)).sort();
    expect(b).toEqual(a);
  });

  test.each([...sqliteTables.keys()])("%s column nullability matches in both", (name) => {
    const a = getTableColumns(sqliteTables.get(name) as never) as Record<string, { notNull: boolean }>;
    const b = getTableColumns(pgTables.get(name) as never) as Record<string, { notNull: boolean }>;
    const mismatched = Object.keys(a).filter((col) => a[col].notNull !== b[col]?.notNull);
    expect(mismatched).toEqual([]);
  });

  test("owner scoping exists on projects in both dialects", () => {
    for (const [label, set] of [["sqlite", sqliteTables], ["postgres", pgTables]] as const) {
      const cols = Object.keys(getTableColumns(set.get("projects") as never));
      expect(cols, `${label} projects table`).toContain("ownerId");
    }
  });
});
