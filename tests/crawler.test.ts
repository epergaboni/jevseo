import { describe, expect, test } from "vitest";
import { parseRobots } from "@/lib/crawl/robots";

/**
 * robots.txt decides whether we are allowed to fetch at all, so a parsing
 * mistake here is a politeness failure against someone else's server.
 */
describe("robots.txt", () => {
  test("no rules means everything is allowed", () => {
    const r = parseRobots("");
    expect(r.isAllowed("/anything")).toBe(true);
    expect(r.crawlDelayMs).toBe(0);
  });

  test("honours a wildcard disallow", () => {
    const r = parseRobots("User-agent: *\nDisallow: /admin");
    expect(r.isAllowed("/admin")).toBe(false);
    expect(r.isAllowed("/admin/users")).toBe(false);
    expect(r.isAllowed("/public")).toBe(true);
  });

  test("an empty Disallow allows everything", () => {
    const r = parseRobots("User-agent: *\nDisallow:");
    expect(r.isAllowed("/anything")).toBe(true);
  });

  test("the longest matching rule wins, so Allow can carve out of Disallow", () => {
    const r = parseRobots("User-agent: *\nDisallow: /docs\nAllow: /docs/public");
    expect(r.isAllowed("/docs/private")).toBe(false);
    expect(r.isAllowed("/docs/public/a")).toBe(true);
  });

  test("handles wildcard and end-anchor patterns", () => {
    const r = parseRobots("User-agent: *\nDisallow: /*.pdf$");
    expect(r.isAllowed("/files/report.pdf")).toBe(false);
    expect(r.isAllowed("/files/report.pdf.html")).toBe(true);
  });

  test("a group naming our agent beats the wildcard group", () => {
    const r = parseRobots(
      "User-agent: *\nDisallow: /\n\nUser-agent: JevSEOBot\nDisallow: /private",
    );
    expect(r.isAllowed("/anything")).toBe(true);
    expect(r.isAllowed("/private")).toBe(false);
  });

  test("groups several agents sharing one rule block", () => {
    const r = parseRobots("User-agent: Googlebot\nUser-agent: *\nDisallow: /no");
    expect(r.isAllowed("/no")).toBe(false);
  });

  test("reads crawl-delay and converts to milliseconds", () => {
    expect(parseRobots("User-agent: *\nCrawl-delay: 2").crawlDelayMs).toBe(2000);
  });

  test("collects sitemaps regardless of grouping", () => {
    const r = parseRobots("Sitemap: https://x.co.uk/a.xml\nUser-agent: *\nSitemap: https://x.co.uk/b.xml");
    expect(r.sitemaps).toEqual(["https://x.co.uk/a.xml", "https://x.co.uk/b.xml"]);
  });

  test("ignores comments and blank lines", () => {
    const r = parseRobots("# a comment\n\nUser-agent: *  # inline\nDisallow: /x  # why\n");
    expect(r.isAllowed("/x")).toBe(false);
  });

  test("rules before any user-agent line are ignored rather than applied globally", () => {
    const r = parseRobots("Disallow: /orphan\nUser-agent: *\nDisallow: /real");
    expect(r.isAllowed("/orphan")).toBe(true);
    expect(r.isAllowed("/real")).toBe(false);
  });
});
