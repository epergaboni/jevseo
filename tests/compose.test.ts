import { describe, expect, test } from "vitest";
import { buildFixes, composePillars, overallScore } from "@/lib/score/compose";
import { judgment, rule } from "./fixtures";

describe("composePillars", () => {
  test("returns a score for every pillar even when only one has judgments", () => {
    const pillars = composePillars([judgment({ pillars: ["seo"], value: 1 })], []);
    expect(pillars.map((p) => p.pillar)).toEqual(["seo", "aeo", "geo"]);
    expect(pillars.find((p) => p.pillar === "seo")?.score).toBe(100);
    expect(pillars.find((p) => p.pillar === "aeo")?.score).toBe(0);
  });

  test("weights judgments against each other", () => {
    const pillars = composePillars(
      [
        judgment({ id: "heavy", value: 1, weight: 3 }),
        judgment({ id: "light", value: 0, weight: 1 }),
      ],
      [],
    );
    expect(pillars[0].score).toBe(75);
  });

  test("blends judgments and rules at the configured share", () => {
    const pillars = composePillars(
      [judgment({ value: 1, weight: 1 })],
      [rule({ value: 0, passed: false })],
    );
    // 1.0 * 0.7 + 0.0 * 0.3
    expect(pillars[0].score).toBe(70);
  });

  test("caps every affected pillar when a blocking rule fails", () => {
    const perfect = [
      judgment({ pillars: ["seo", "aeo", "geo"], value: 1 }),
    ];
    const blocked = [rule({ id: "indexable", pillars: ["seo", "aeo", "geo"], value: 0, passed: false })];
    for (const pillar of composePillars(perfect, blocked)) {
      expect(pillar.score).toBeLessThanOrEqual(20);
    }
  });

  test("averages confidence only over judgments that report it", () => {
    const pillars = composePillars(
      [judgment({ id: "a", confidence: 0.9 }), judgment({ id: "b", confidence: null, kind: "noul" })],
      [],
    );
    expect(pillars[0].confidence).toBeCloseTo(0.9);
  });

  test("reports null confidence when nothing measured it", () => {
    const pillars = composePillars([judgment({ confidence: null, kind: "noul" })], []);
    expect(pillars[0].confidence).toBeNull();
  });

  test("sorts judgments and rules worst first", () => {
    const pillars = composePillars(
      [judgment({ id: "high", value: 0.9 }), judgment({ id: "low", value: 0.1 })],
      [rule({ id: "bad", value: 0.2, passed: false }), rule({ id: "good", value: 1 })],
    );
    expect(pillars[0].judgments[0].id).toBe("low");
    expect(pillars[0].rules[0].id).toBe("bad");
  });
});

describe("overallScore", () => {
  test("is the mean of the pillar scores", () => {
    const pillars = composePillars(
      [
        judgment({ id: "s", pillars: ["seo"], value: 1 }),
        judgment({ id: "a", pillars: ["aeo"], value: 0.5 }),
        judgment({ id: "g", pillars: ["geo"], value: 0 }),
      ],
      [],
    );
    expect(overallScore(pillars)).toBe(50);
  });

  test("is zero for no pillars", () => {
    expect(overallScore([])).toBe(0);
  });
});

describe("buildFixes", () => {
  test("ignores passing rules and healthy judgments", () => {
    expect(buildFixes([judgment({ value: 0.95 })], [rule({ passed: true })])).toEqual([]);
  });

  test("marks a failed blocking rule critical", () => {
    const fixes = buildFixes([], [rule({ id: "indexable", value: 0, passed: false })]);
    expect(fixes[0].severity).toBe("critical");
    expect(fixes[0].title).toMatch(/blocked from indexing/);
  });

  test("orders by severity, then by how much score is recoverable", () => {
    const fixes = buildFixes(
      [
        judgment({ id: "small", value: 0.6, weight: 1 }),
        judgment({ id: "large", value: 0.1, weight: 3 }),
      ],
      [rule({ id: "indexable", value: 0, passed: false })],
    );
    expect(fixes.map((f) => f.severity)).toEqual(["critical", "high", "low"]);
    expect(fixes[1].id).toBe("judgment:large");
  });

  test("carries the model verdict through as evidence", () => {
    const fixes = buildFixes([judgment({ value: 0.2, verdict: "A poor level" })], []);
    expect(fixes[0].evidence).toContain("A poor level");
  });

  test("falls back to a percentage when a judgment has no verdict", () => {
    const fixes = buildFixes([judgment({ value: 0.2, verdict: null, kind: "noul" })], []);
    expect(fixes[0].evidence).toContain("20%");
  });

  test("keeps confidence on judgment fixes so the UI can flag uncertain ones", () => {
    const fixes = buildFixes([judgment({ value: 0.2, confidence: 0.4 })], []);
    expect(fixes[0].confidence).toBe(0.4);
    expect(fixes[0].source).toBe("judgment");
  });
});
