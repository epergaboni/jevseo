import type { AnalysisInput, PageFacts, Rule } from "@/lib/types";

/**
 * Deterministic checks. Anything with a known threshold lives here, never in a
 * question to the model — Jev is for semantics, code is for rules.
 */

const TITLE_MIN = 30;
const TITLE_MAX = 60;
const META_MIN = 70;
const META_MAX = 158;
const THIN_CONTENT_WORDS = 300;
const HEALTHY_CONTENT_WORDS = 900;

/** Schema types that answer engines actually consume. */
const ANSWER_SCHEMA = ["FAQPage", "HowTo", "QAPage", "Question", "Speakable"];
const TRUST_SCHEMA = ["Article", "NewsArticle", "BlogPosting", "Organization", "Person", "Product", "Review", "BreadcrumbList"];

function band(value: number, min: number, max: number): number {
  if (value >= min && value <= max) return 1;
  if (value === 0) return 0;
  const distance = value < min ? min - value : value - max;
  const tolerance = Math.max(min, 1);
  return Math.max(0, 1 - distance / tolerance);
}

function rule(r: Rule): Rule {
  return { ...r, passed: r.value >= 0.75 };
}

export function evaluateRules(facts: PageFacts, input: AnalysisInput): Rule[] {
  const rules: Rule[] = [];
  const isUrl = input.mode === "url";

  // --- Title -------------------------------------------------------------
  const titleLength = facts.title?.length ?? 0;
  rules.push(
    rule({
      id: "title_length",
      pillars: ["seo"],
      label: "Title tag length",
      value: titleLength === 0 ? 0 : band(titleLength, TITLE_MIN, TITLE_MAX),
      observed: facts.title ? `${titleLength} characters` : "No title tag",
      expected: `${TITLE_MIN}–${TITLE_MAX} characters`,
      passed: false,
    }),
  );

  if (isUrl) {
    const metaLength = facts.metaDescription?.length ?? 0;
    rules.push(
      rule({
        id: "meta_description",
        pillars: ["seo"],
        label: "Meta description",
        value: metaLength === 0 ? 0 : band(metaLength, META_MIN, META_MAX),
        observed: facts.metaDescription ? `${metaLength} characters` : "Missing",
        expected: `${META_MIN}–${META_MAX} characters`,
        passed: false,
      }),
    );

    rules.push(
      rule({
        id: "canonical",
        pillars: ["seo"],
        label: "Canonical URL",
        value: facts.canonical ? 1 : 0,
        observed: facts.canonical ?? "Missing",
        expected: "A self-referencing canonical link",
        passed: false,
      }),
    );

    const robots = (facts.robotsMeta ?? "").toLowerCase();
    const blocked = robots.includes("noindex") || robots.includes("none");
    rules.push(
      rule({
        id: "indexable",
        pillars: ["seo", "aeo", "geo"],
        label: "Indexable",
        value: blocked ? 0 : 1,
        observed: facts.robotsMeta ?? "No robots meta tag (indexable by default)",
        expected: "Not blocked by a robots meta tag",
        passed: false,
      }),
    );

    rules.push(
      rule({
        id: "https",
        pillars: ["seo"],
        label: "HTTPS",
        value: facts.isHttps ? 1 : 0,
        observed: facts.isHttps ? "Served over HTTPS" : "Served over plain HTTP",
        expected: "HTTPS",
        passed: false,
      }),
    );

    rules.push(
      rule({
        id: "lang",
        pillars: ["seo", "aeo"],
        label: "Declared language",
        value: facts.lang ? 1 : 0,
        observed: facts.lang ?? "No lang attribute on <html>",
        expected: 'A lang attribute, for example lang="en-GB"',
        passed: false,
      }),
    );

    if (facts.imageCount > 0) {
      const coverage = 1 - facts.imagesMissingAlt / facts.imageCount;
      rules.push(
        rule({
          id: "image_alt",
          pillars: ["seo"],
          label: "Image alt text",
          value: coverage,
          observed: `${facts.imagesMissingAlt} of ${facts.imageCount} images have no alt text`,
          expected: "Every meaningful image carries descriptive alt text",
          passed: false,
        }),
      );
    }

    rules.push(
      rule({
        id: "internal_links",
        pillars: ["seo"],
        label: "Internal linking",
        value: Math.min(1, facts.internalLinks / 10),
        observed: `${facts.internalLinks} internal links`,
        expected: "At least 10 internal links into related pages",
        passed: false,
      }),
    );

    const citesSources = facts.externalLinks > 0;
    rules.push(
      rule({
        id: "outbound_citations",
        pillars: ["geo"],
        label: "Outbound citations",
        value: citesSources ? Math.min(1, facts.externalLinks / 4) : 0,
        observed: citesSources
          ? `${facts.externalLinks} outbound links across ${facts.outboundDomains.length} domains`
          : "No outbound links",
        expected: "Links to the sources behind the claims — generative engines trace provenance",
        passed: false,
      }),
    );

    const invalidJsonLd = facts.schemaTypes.includes("__invalid_jsonld__");
    const answerSchema = facts.schemaTypes.filter((t) => ANSWER_SCHEMA.includes(t));
    const trustSchema = facts.schemaTypes.filter((t) => TRUST_SCHEMA.includes(t));

    rules.push(
      rule({
        id: "structured_data",
        pillars: ["seo", "geo"],
        label: "Structured data",
        value: invalidJsonLd ? 0 : trustSchema.length > 0 ? 1 : facts.schemaTypes.length > 0 ? 0.5 : 0,
        observed: invalidJsonLd
          ? "A JSON-LD block failed to parse"
          : facts.schemaTypes.length
            ? facts.schemaTypes.join(", ")
            : "No structured data found",
        expected: "Valid JSON-LD describing the page and its publisher",
        passed: false,
      }),
    );

    rules.push(
      rule({
        id: "answer_schema",
        pillars: ["aeo"],
        label: "Answer-engine schema",
        value: answerSchema.length > 0 ? 1 : 0,
        observed: answerSchema.length ? answerSchema.join(", ") : "None of FAQPage, HowTo, QAPage",
        expected: "FAQPage, HowTo or QAPage markup where the content supports it",
        passed: false,
      }),
    );

    rules.push(
      rule({
        id: "freshness_signal",
        pillars: ["geo", "seo"],
        label: "Date signals",
        value: facts.modifiedDate ? 1 : facts.publishedDate ? 0.6 : 0,
        observed:
          facts.modifiedDate ?? facts.publishedDate ?? "No published or modified date exposed",
        expected: "A machine-readable published and modified date",
        passed: false,
      }),
    );

    rules.push(
      rule({
        id: "author_byline",
        pillars: ["geo"],
        label: "Author attribution",
        value: facts.hasAuthorByline ? 1 : 0,
        observed: facts.hasAuthorByline ? "Byline present" : "No visible author attribution",
        expected: "A named, attributable author",
        passed: false,
      }),
    );

    if (facts.responseMs !== null) {
      rules.push(
        rule({
          id: "ttfb",
          pillars: ["seo"],
          label: "Document response time",
          value: facts.responseMs <= 600 ? 1 : facts.responseMs <= 1500 ? 0.6 : 0.2,
          observed: `${facts.responseMs} ms to fetch the HTML`,
          expected: "Under 600 ms",
          passed: false,
        }),
      );
    }
  }

  // --- Structure, both modes ---------------------------------------------
  rules.push(
    rule({
      id: "h1_single",
      pillars: ["seo", "aeo"],
      label: "Single H1",
      value: facts.h1.length === 1 ? 1 : facts.h1.length === 0 ? 0 : 0.4,
      observed:
        facts.h1.length === 0 ? "No H1" : facts.h1.length === 1 ? "Exactly one H1" : `${facts.h1.length} H1s`,
      expected: "Exactly one H1 stating the page's subject",
      passed: false,
    }),
  );

  const skips = countHeadingSkips(facts);
  rules.push(
    rule({
      id: "heading_hierarchy",
      pillars: ["seo", "aeo", "geo"],
      label: "Heading hierarchy",
      value: facts.headings.length === 0 ? 0 : skips === 0 ? 1 : Math.max(0, 1 - skips * 0.25),
      observed:
        facts.headings.length === 0
          ? "No headings"
          : skips === 0
            ? `${facts.headings.length} headings, no skipped levels`
            : `${skips} skipped heading level${skips === 1 ? "" : "s"}`,
      expected: "Headings that descend one level at a time",
      passed: false,
    }),
  );

  const questionHeadings = facts.headings.filter((h) => isQuestionLike(h.text)).length;
  rules.push(
    rule({
      id: "question_headings",
      pillars: ["aeo"],
      label: "Question-shaped headings",
      value: Math.min(1, questionHeadings / 3),
      observed: `${questionHeadings} heading${questionHeadings === 1 ? "" : "s"} phrased as a question`,
      expected: "Three or more headings that mirror how people actually ask",
      passed: false,
    }),
  );

  rules.push(
    rule({
      id: "content_depth",
      pillars: ["seo"],
      label: "Content depth",
      value:
        facts.wordCount >= HEALTHY_CONTENT_WORDS
          ? 1
          : facts.wordCount >= THIN_CONTENT_WORDS
            ? 0.6
            : facts.wordCount / THIN_CONTENT_WORDS,
      observed: `${facts.wordCount.toLocaleString("en-GB")} words`,
      expected: `At least ${THIN_CONTENT_WORDS} words, and typically ${HEALTHY_CONTENT_WORDS}+ for a competitive query`,
      passed: false,
    }),
  );

  rules.push(
    rule({
      id: "extractable_blocks",
      pillars: ["aeo", "geo"],
      label: "Lists and tables",
      value: Math.min(1, (facts.listCount + facts.tableCount * 2) / 3),
      observed: `${facts.listCount} list${facts.listCount === 1 ? "" : "s"}, ${facts.tableCount} table${facts.tableCount === 1 ? "" : "s"}`,
      expected: "Lists and tables — the structures answer and generative engines lift wholesale",
      passed: false,
    }),
  );

  return rules;
}

function countHeadingSkips(facts: PageFacts): number {
  let skips = 0;
  let previous = 0;
  for (const heading of facts.headings) {
    if (previous !== 0 && heading.level > previous + 1) skips += 1;
    previous = heading.level;
  }
  return skips;
}

function isQuestionLike(text: string): boolean {
  if (text.trim().endsWith("?")) return true;
  return /^(how|what|why|when|where|who|which|can|should|do|does|is|are)\b/i.test(text.trim());
}
