import { describe, expect, test } from "vitest";
import { canonicaliseUrl, extractLinks, pathAffinity, pathSegments, sameOrigin } from "@/lib/crawl/urls";

/**
 * Two URLs that render the same page must collapse to one key, or the crawler
 * spends its budget analysing the same content repeatedly.
 */
describe("canonicaliseUrl", () => {
  test("drops the fragment", () => {
    expect(canonicaliseUrl("https://a.co.uk/x#section")).toBe("https://a.co.uk/x");
  });

  test("drops tracking parameters but keeps meaningful ones", () => {
    expect(canonicaliseUrl("https://a.co.uk/x?utm_source=news&page=2&fbclid=abc")).toBe(
      "https://a.co.uk/x?page=2",
    );
  });

  test("sorts query parameters so order does not create a duplicate", () => {
    expect(canonicaliseUrl("https://a.co.uk/x?b=2&a=1")).toBe(
      canonicaliseUrl("https://a.co.uk/x?a=1&b=2"),
    );
  });

  test("treats a trailing slash as the same page", () => {
    expect(canonicaliseUrl("https://a.co.uk/guide/")).toBe("https://a.co.uk/guide");
  });

  test("keeps the root path intact", () => {
    expect(canonicaliseUrl("https://a.co.uk/")).toBe("https://a.co.uk/");
  });

  test("resolves a relative href against its base", () => {
    expect(canonicaliseUrl("../other", "https://a.co.uk/docs/page")).toBe("https://a.co.uk/other");
  });

  test("returns null for something that is not a URL", () => {
    expect(canonicaliseUrl("not a url")).toBeNull();
  });
});

describe("pathAffinity", () => {
  const seed = ["consumer", "energy"];

  test("a page under the seed path scores by how much it shares", () => {
    expect(pathAffinity("https://a.co.uk/consumer/energy/bills", seed)).toBe(2);
    expect(pathAffinity("https://a.co.uk/consumer/other", seed)).toBe(1);
  });

  test("an unrelated branch scores zero", () => {
    expect(pathAffinity("https://a.co.uk/about/team", seed)).toBe(0);
  });

  test("the site root ranks with the seed, because a homepage is a real target", () => {
    expect(pathAffinity("https://a.co.uk/", seed)).toBe(seed.length);
  });

  test("an unparseable URL scores zero rather than throwing", () => {
    expect(pathAffinity("nonsense", seed)).toBe(0);
  });

  test("with a root seed everything is equally near", () => {
    expect(pathAffinity("https://a.co.uk/anything/deep", [])).toBe(0);
  });
});

describe("pathSegments", () => {
  test("splits and drops empties", () => {
    expect(pathSegments("https://a.co.uk/one/two/")).toEqual(["one", "two"]);
    expect(pathSegments("https://a.co.uk/")).toEqual([]);
  });
});

describe("sameOrigin", () => {
  test("compares scheme, host and port", () => {
    expect(sameOrigin("https://a.co.uk/x", "https://a.co.uk")).toBe(true);
    expect(sameOrigin("http://a.co.uk/x", "https://a.co.uk")).toBe(false);
    expect(sameOrigin("https://b.co.uk/x", "https://a.co.uk")).toBe(false);
    expect(sameOrigin("rubbish", "https://a.co.uk")).toBe(false);
  });
});

describe("extractLinks", () => {
  const origin = "https://a.co.uk";
  const base = "https://a.co.uk/docs/page";

  test("keeps same-origin page links and resolves them", () => {
    const html = `<a href="/one">1</a><a href="two">2</a><a href="https://a.co.uk/three">3</a>`;
    expect(extractLinks(html, base, origin).sort()).toEqual([
      "https://a.co.uk/docs/two",
      "https://a.co.uk/one",
      "https://a.co.uk/three",
    ]);
  });

  test("drops other origins", () => {
    expect(extractLinks(`<a href="https://other.co.uk/x">x</a>`, base, origin)).toEqual([]);
  });

  test("drops mailto, tel, javascript and bare fragments", () => {
    const html = `<a href="mailto:a@b.co">m</a><a href="tel:123">t</a><a href="javascript:void(0)">j</a><a href="#top">f</a>`;
    expect(extractLinks(html, base, origin)).toEqual([]);
  });

  test("drops assets that are not pages", () => {
    const html = `<a href="/a.pdf">p</a><a href="/b.png">i</a><a href="/real">r</a>`;
    expect(extractLinks(html, base, origin)).toEqual(["https://a.co.uk/real"]);
  });

  test("deduplicates links that canonicalise to the same page", () => {
    const html = `<a href="/x">1</a><a href="/x#a">2</a><a href="/x/">3</a><a href="/x?utm_source=n">4</a>`;
    expect(extractLinks(html, base, origin)).toEqual(["https://a.co.uk/x"]);
  });
});
