import type { AnalysisInput, Judgment, PageFacts, Rule } from "@/lib/types";

export const GOOD_HTML = `<!doctype html>
<html lang="en-GB">
<head>
  <title>How to Tax a Vehicle in the UK: Costs, Rules and Deadlines</title>
  <meta name="description" content="A complete guide to taxing a vehicle in the UK, covering the 2026 rates, what documents you need, and what happens if you miss the deadline for renewal." />
  <link rel="canonical" href="https://example.co.uk/vehicle-tax" />
  <meta property="article:modified_time" content="2026-03-01T00:00:00Z" />
  <script type="application/ld+json">{"@context":"https://schema.org","@type":"FAQPage","mainEntity":[{"@type":"Question","name":"How much?"}]}</script>
  <script type="application/ld+json">{"@type":"Article","author":{"@type":"Person","name":"A Writer"}}</script>
</head>
<body>
  <nav><a href="/ignore-me">Nav</a></nav>
  <main>
    <h1>How to tax a vehicle in the UK</h1>
    <p class="byline">By A Writer</p>
    <h2>How much does vehicle tax cost?</h2>
    <p>Standard rate vehicle tax is 195 pounds a year as of April 2026.</p>
    <ul><li>Petrol and diesel cars</li><li>Electric vehicles</li></ul>
    <table><tr><td>Band A</td><td>0</td></tr></table>
    <h2>What documents do you need?</h2>
    <p>You need a V5C log book or a reminder letter from the DVLA.</p>
    <img src="/a.png" alt="A tax disc" />
    <img src="/b.png" />
    <a href="https://example.co.uk/one">Internal one</a>
    <a href="https://example.co.uk/two">Internal two</a>
    <a href="https://www.gov.uk/vehicle-tax">Source: GOV.UK</a>
    <a href="https://www.dvla.gov.uk/">DVLA</a>
  </main>
</body>
</html>`;

export const POOR_HTML = `<!doctype html>
<html>
<head>
  <title>Home</title>
  <meta name="robots" content="noindex, nofollow" />
  <script type="application/ld+json">{ this is not json }</script>
</head>
<body>
  <div>
    <h1>Welcome</h1>
    <h1>Also welcome</h1>
    <h4>Skipped straight to four</h4>
    <p>We are a company that does company things for companies who need things done.</p>
  </div>
</body>
</html>`;

export const URL_INPUT: AnalysisInput = {
  mode: "url",
  url: "https://example.co.uk/vehicle-tax",
  targetQuery: "how much is vehicle tax uk",
  audience: "UK drivers",
  includeCompetitors: false,
};

export const CONTENT_INPUT: AnalysisInput = {
  mode: "content",
  content: "# Draft\n\nSome text.",
  includeCompetitors: false,
};

export function judgment(over: Partial<Judgment> = {}): Judgment {
  return {
    id: "test",
    pillars: ["seo"],
    label: "Test judgment",
    question: "Is this a test?",
    kind: "score",
    value: 0.5,
    confidence: 0.9,
    verdict: "A middling level",
    weight: 1,
    remedy: "Do the thing.",
    ...over,
  };
}

export function rule(over: Partial<Rule> = {}): Rule {
  return {
    id: "test_rule",
    pillars: ["seo"],
    label: "Test rule",
    value: 1,
    observed: "Fine",
    expected: "Fine",
    passed: true,
    ...over,
  };
}

export function facts(over: Partial<PageFacts> = {}): PageFacts {
  return {
    url: "https://example.co.uk/x",
    fetchedAt: new Date().toISOString(),
    statusCode: 200,
    responseMs: 200,
    htmlBytes: 1000,
    title: "A title that is comfortably within the recommended range",
    metaDescription: null,
    canonical: null,
    robotsMeta: null,
    lang: "en-GB",
    h1: ["A title"],
    headings: [{ level: 1, text: "A title" }],
    schemaTypes: [],
    openGraph: {},
    wordCount: 1000,
    paragraphCount: 10,
    listCount: 2,
    tableCount: 0,
    imageCount: 0,
    imagesMissingAlt: 0,
    internalLinks: 10,
    externalLinks: 3,
    outboundDomains: [],
    isHttps: true,
    hasAuthorByline: true,
    publishedDate: null,
    modifiedDate: null,
    text: "Some content.",
    textTruncated: false,
    ...over,
  };
}
