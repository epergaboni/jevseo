import { describe, expect, test } from "vitest";
import { DIMENSIONS, buildQuestions } from "@/lib/judge/dimensions";
import { CONTENT_INPUT, URL_INPUT, facts } from "./fixtures";

describe("the judgment catalogue", () => {
  test("every id is unique", () => {
    const ids = DIMENSIONS.map((d) => d.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  test("every scored dimension names at least one pillar and a remedy", () => {
    for (const d of DIMENSIONS.filter((d) => !d.gateOnly)) {
      expect(d.pillars.length, `${d.id} has no pillar`).toBeGreaterThan(0);
      expect(d.remedy.length, `${d.id} has no remedy`).toBeGreaterThan(20);
      expect(d.weight, `${d.id} has no weight`).toBeGreaterThan(0);
    }
  });

  test("every score rubric has at least two levels and no empty level", () => {
    for (const d of DIMENSIONS) {
      const q = d.build();
      if (q.type !== "score") continue;
      expect(q.criteria.length, `${d.id} rubric too short`).toBeGreaterThanOrEqual(2);
      for (const level of q.criteria) {
        expect(typeof level === "string" && level.length > 10, `${d.id} has a thin level`).toBe(true);
      }
    }
  });

  test("every gate points at a dimension that exists and is gate-only", () => {
    for (const d of DIMENSIONS.filter((d) => d.gate)) {
      const target = DIMENSIONS.find((x) => x.id === d.gate!.id);
      expect(target, `${d.id} gates on a missing dimension`).toBeDefined();
      expect(target!.gateOnly).toBe(true);
    }
  });

  test("all three pillars are covered", () => {
    const covered = new Set(DIMENSIONS.flatMap((d) => d.pillars));
    expect([...covered].sort()).toEqual(["aeo", "geo", "seo"]);
  });
});

describe("buildQuestions", () => {
  test("includes the intent choice only when a target query is given", () => {
    expect(buildQuestions(facts(), URL_INPUT).questions.__intent).toBeDefined();
    expect(buildQuestions(facts(), CONTENT_INPUT).questions.__intent).toBeUndefined();
  });

  test("drops query-dependent questions when there is no query", () => {
    const { questions } = buildQuestions(facts(), CONTENT_INPUT);
    expect(questions.intent_match).toBeUndefined();
    expect(questions.direct_answer).toBeUndefined();
    expect(questions.quotability).toBeDefined();
  });

  test("drops the meta description question when the page has none", () => {
    expect(buildQuestions(facts({ metaDescription: null }), URL_INPUT).questions.meta_quality)
      .toBeUndefined();
    expect(buildQuestions(facts({ metaDescription: "A description." }), URL_INPUT).questions.meta_quality)
      .toBeDefined();
  });

  test("returns the applied dimensions alongside the questions", () => {
    const { questions, applied } = buildQuestions(facts({ metaDescription: "x" }), URL_INPUT);
    expect(applied.map((d) => d.id).sort()).toEqual(
      Object.keys(questions).filter((k) => k !== "__intent").sort(),
    );
  });

  test("always asks the gate alongside the question it gates", () => {
    const { questions } = buildQuestions(facts(), URL_INPUT);
    expect(questions.describes_process).toBeDefined();
    expect(questions.procedural_clarity).toBeDefined();
  });
});
