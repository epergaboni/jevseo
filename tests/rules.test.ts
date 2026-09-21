import { describe, expect, test } from "vitest";
import { extractFacts, factsFromContent } from "@/lib/extract/fetch-page";
import { evaluateRules } from "@/lib/extract/rules";
import { CONTENT_INPUT, GOOD_HTML, POOR_HTML, URL_INPUT, facts } from "./fixtures";

const META = { url: "https://example.co.uk/vehicle-tax", statusCode: 200, responseMs: 210 };
const byId = (rules: ReturnType<typeof evaluateRules>, id: string) => rules.find((r) => r.id === id);

describe("evaluateRules on a well-built page", () => {
  const rules = evaluateRules(extractFacts(GOOD_HTML, META), URL_INPUT);

  test("passes the head-level rules", () => {
    expect(byId(rules, "canonical")?.passed).toBe(true);
    expect(byId(rules, "indexable")?.passed).toBe(true);
    expect(byId(rules, "https")?.passed).toBe(true);
    expect(byId(rules, "lang")?.passed).toBe(true);
  });

  test("recognises answer-engine schema", () => {
    expect(byId(rules, "answer_schema")?.passed).toBe(true);
  });

  test("recognises question-shaped headings", () => {
    expect(byId(rules, "question_headings")?.value).toBeGreaterThan(0);
  });

  test("finds exactly one H1", () => {
    expect(byId(rules, "h1_single")?.value).toBe(1);
  });

  test("penalises the image missing alt text", () => {
    expect(byId(rules, "image_alt")?.value).toBe(0.5);
  });
});

describe("evaluateRules on a poor page", () => {
  const rules = evaluateRules(
    extractFacts(POOR_HTML, { url: "http://example.co.uk", statusCode: 200, responseMs: 90 }),
    URL_INPUT,
  );

  test("fails the indexable rule when robots says noindex", () => {
    expect(byId(rules, "indexable")?.value).toBe(0);
  });

  test("scores structured data at zero when JSON-LD will not parse", () => {
    expect(byId(rules, "structured_data")?.value).toBe(0);
    expect(byId(rules, "structured_data")?.observed).toMatch(/failed to parse/);
  });

  test("penalises multiple H1s without zeroing them", () => {
    const h1 = byId(rules, "h1_single");
    expect(h1?.value).toBe(0.4);
    expect(h1?.passed).toBe(false);
  });

  test("penalises a skipped heading level", () => {
    expect(byId(rules, "heading_hierarchy")?.value).toBeLessThan(1);
  });

  test("fails HTTPS", () => {
    expect(byId(rules, "https")?.value).toBe(0);
  });

  test("fails thin content", () => {
    expect(byId(rules, "content_depth")?.passed).toBe(false);
  });
});

describe("rule applicability", () => {
  test("skips URL-only rules for pasted content", () => {
    const rules = evaluateRules(factsFromContent("# Draft\n\n" + "word ".repeat(400)), CONTENT_INPUT);
    const ids = rules.map((r) => r.id);
    expect(ids).not.toContain("canonical");
    expect(ids).not.toContain("indexable");
    expect(ids).not.toContain("answer_schema");
    expect(ids).toContain("content_depth");
    expect(ids).toContain("h1_single");
  });

  test("omits the image rule when there are no images", () => {
    const rules = evaluateRules(facts({ imageCount: 0 }), URL_INPUT);
    expect(byId(rules, "image_alt")).toBeUndefined();
  });
});

describe("title length banding", () => {
  test.each([
    ["", 0],
    ["A short one", null],
  ])("handles %s", (title, expected) => {
    const rules = evaluateRules(facts({ title: title || null }), URL_INPUT);
    const value = byId(rules, "title_length")!.value;
    if (expected !== null) expect(value).toBe(expected);
    else expect(value).toBeLessThan(1);
  });

  test("passes a title inside the band", () => {
    const rules = evaluateRules(
      facts({ title: "How to tax a vehicle in the UK: a guide" }),
      URL_INPUT,
    );
    expect(byId(rules, "title_length")?.value).toBe(1);
  });
});
