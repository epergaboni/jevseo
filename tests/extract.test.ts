import { describe, expect, test } from "vitest";
import { extractFacts, factsFromContent, fetchPage, FetchError } from "@/lib/extract/fetch-page";
import { GOOD_HTML, POOR_HTML } from "./fixtures";

const META = { url: "https://example.co.uk/vehicle-tax", statusCode: 200, responseMs: 210 };

describe("extractFacts", () => {
  const f = extractFacts(GOOD_HTML, META);

  test("reads the head metadata", () => {
    expect(f.title).toBe("How to Tax a Vehicle in the UK: Costs, Rules and Deadlines");
    expect(f.metaDescription).toContain("complete guide");
    expect(f.canonical).toBe("https://example.co.uk/vehicle-tax");
    expect(f.lang).toBe("en-GB");
    expect(f.modifiedDate).toBe("2026-03-01T00:00:00Z");
  });

  test("collects schema types from every JSON-LD block", () => {
    expect(f.schemaTypes).toContain("FAQPage");
    expect(f.schemaTypes).toContain("Article");
    expect(f.schemaTypes).toContain("Question");
  });

  test("separates internal from external links and records outbound domains", () => {
    expect(f.internalLinks).toBe(2);
    expect(f.externalLinks).toBe(2);
    expect(f.outboundDomains).toContain("gov.uk");
  });

  test("counts images missing alt text", () => {
    expect(f.imageCount).toBe(2);
    expect(f.imagesMissingAlt).toBe(1);
  });

  test("excludes navigation chrome from the judged content", () => {
    expect(f.text).not.toContain("Nav");
    expect(f.text).toContain("195 pounds a year");
  });

  test("collapses whitespace-only lines left behind by block extraction", () => {
    expect(f.text).not.toMatch(/\n\s+\n/);
    expect(f.text).not.toMatch(/\n{3,}/);
  });

  test("detects an author byline", () => {
    expect(f.hasAuthorByline).toBe(true);
  });

  test("records headings with their levels", () => {
    expect(f.headings[0]).toEqual({ level: 1, text: "How to tax a vehicle in the UK" });
    expect(f.headings.filter((h) => h.level === 2)).toHaveLength(2);
  });
});

describe("extractFacts on a poor page", () => {
  const f = extractFacts(POOR_HTML, { url: "http://example.co.uk", statusCode: 200, responseMs: 90 });

  test("flags malformed JSON-LD rather than silently dropping it", () => {
    expect(f.schemaTypes).toContain("__invalid_jsonld__");
  });

  test("records every H1 so the rule layer can see there is more than one", () => {
    expect(f.h1).toHaveLength(2);
  });

  test("notices the page is not served over HTTPS", () => {
    expect(f.isHttps).toBe(false);
  });

  test("carries the robots directive through", () => {
    expect(f.robotsMeta).toBe("noindex, nofollow");
  });
});

describe("factsFromContent", () => {
  const f = factsFromContent("# My draft\n\nFirst paragraph here.\n\n## A section\n\n- one\n- two\n");

  test("derives headings and title from markdown", () => {
    expect(f.title).toBe("My draft");
    expect(f.headings.map((h) => h.level)).toEqual([1, 2]);
  });

  test("reports no URL-only signals", () => {
    expect(f.url).toBeNull();
    expect(f.internalLinks).toBe(0);
    expect(f.schemaTypes).toEqual([]);
  });

  test("strips heading markers from the judged text", () => {
    expect(f.text).not.toContain("#");
    expect(f.text).toContain("First paragraph here.");
  });
});

describe("fetchPage URL guard", () => {
  test.each([
    "http://localhost:3000/admin",
    "http://127.0.0.1/",
    "http://169.254.169.254/latest/meta-data/",
    "http://10.0.0.1/",
    "http://192.168.1.1/",
    "http://172.16.0.1/",
  ])("refuses %s", async (url) => {
    await expect(fetchPage(url)).rejects.toBeInstanceOf(FetchError);
  });

  test("refuses a non-http scheme", async () => {
    await expect(fetchPage("file:///etc/passwd")).rejects.toThrow(/http and https/);
  });

  test("refuses a malformed URL", async () => {
    await expect(fetchPage("not a url")).rejects.toThrow(/not a valid URL/);
  });
});
