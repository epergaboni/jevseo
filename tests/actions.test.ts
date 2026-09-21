import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";
import { ACTION_BLURB, ACTION_LABEL, PAGE_ACTIONS } from "@/lib/judge/actions";

/**
 * The page-action vocabulary is declared in three places: the shared module,
 * the database column enum, and the criteria Jev is asked to choose between.
 * They drift silently — a new action renders as a raw slug, or is rejected by
 * the database at write time, long after the tokens were spent. These tests
 * make that drift fail at build.
 */
describe("page actions", () => {
  test("every action has a label and a blurb", () => {
    for (const action of PAGE_ACTIONS) {
      expect(ACTION_LABEL[action], `${action} has no label`).toBeTruthy();
      expect(ACTION_BLURB[action]?.length ?? 0, `${action} has no blurb`).toBeGreaterThan(10);
    }
  });

  test("labels and blurbs contain no extra keys", () => {
    expect(Object.keys(ACTION_LABEL).sort()).toEqual([...PAGE_ACTIONS].sort());
    expect(Object.keys(ACTION_BLURB).sort()).toEqual([...PAGE_ACTIONS].sort());
  });

  test("labels are distinct, so two actions never read the same", () => {
    const labels = Object.values(ACTION_LABEL);
    expect(new Set(labels).size).toBe(labels.length);
  });

  test("the database enum lists exactly these actions", () => {
    const schema = readFileSync("src/lib/db/schema.ts", "utf8");
    const match = /action: text\("action", \{\s*enum: \[([^\]]+)\]/.exec(schema);
    expect(match, "could not find the action enum in the schema").not.toBeNull();
    const declared = [...match![1].matchAll(/"([a-z]+)"/g)].map((m) => m[1]);
    expect(declared.sort()).toEqual([...PAGE_ACTIONS].sort());
  });

  test("Jev is offered exactly these actions, each with a described outcome", () => {
    const decisions = readFileSync("src/lib/judge/decisions.ts", "utf8");
    const block = /const ACTION_CRITERIA = \{([\s\S]*?)\n\} as const;/.exec(decisions);
    expect(block, "could not find ACTION_CRITERIA").not.toBeNull();
    const offered = [...block![1].matchAll(/^\s{2}([a-z]+):/gm)].map((m) => m[1]);
    expect(offered.sort()).toEqual([...PAGE_ACTIONS].sort());
  });
});
