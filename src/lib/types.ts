/** Shared domain types for the SEO / AEO / GEO analyser. */

export type Pillar = "seo" | "aeo" | "geo";

export const PILLARS: readonly Pillar[] = ["seo", "aeo", "geo"] as const;

export const PILLAR_LABELS: Record<Pillar, string> = {
  seo: "SEO",
  aeo: "AEO",
  geo: "GEO",
};

export const PILLAR_BLURBS: Record<Pillar, string> = {
  seo: "Classic organic ranking: intent match, depth, structure, trust.",
  aeo: "Answer engines: snippets, PAA, voice. Direct, extractable answers.",
  geo: "Generative engines: being quoted and cited by AI assistants.",
};

export type Severity = "critical" | "high" | "medium" | "low";

/** A deterministic, code-computed signal. No model involved. */
export interface Rule {
  id: string;
  pillars: Pillar[];
  label: string;
  /** 0..1 — how well the page satisfies this rule. */
  value: number;
  /** What was actually measured, for display. */
  observed: string;
  /** What good looks like. */
  expected: string;
  passed: boolean;
}

/** A single semantic judgment returned by Jev. */
export interface Judgment {
  id: string;
  pillars: Pillar[];
  label: string;
  question: string;
  kind: "score" | "noul" | "choice";
  /** Normalised 0..1 across every kind, so code can compose them uniformly. */
  value: number;
  /** Model-reported confidence; a Noul has none, so this is null. */
  confidence: number | null;
  /** Raw level description Jev landed on, when it has one. */
  verdict: string | null;
  weight: number;
  /** What a low value means, used to build the fix text. */
  remedy: string;
}

export interface PillarScore {
  pillar: Pillar;
  /** 0..100 */
  score: number;
  /** Mean confidence across contributing judgments, or null when none report it. */
  confidence: number | null;
  judgments: Judgment[];
  rules: Rule[];
}

export interface Fix {
  id: string;
  pillars: Pillar[];
  severity: Severity;
  title: string;
  detail: string;
  evidence: string;
  /** 0..1 — how much headroom fixing this recovers, used for ranking. */
  impact: number;
  source: "rule" | "judgment";
  /** Present for judgments: how sure Jev was. Low confidence means verify by hand. */
  confidence: number | null;
}

export interface PageFacts {
  url: string | null;
  fetchedAt: string;
  statusCode: number | null;
  /** Milliseconds to first byte of the HTML document. */
  responseMs: number | null;
  htmlBytes: number | null;
  title: string | null;
  metaDescription: string | null;
  canonical: string | null;
  robotsMeta: string | null;
  lang: string | null;
  h1: string[];
  headings: { level: number; text: string }[];
  schemaTypes: string[];
  openGraph: Record<string, string>;
  wordCount: number;
  paragraphCount: number;
  listCount: number;
  tableCount: number;
  imageCount: number;
  imagesMissingAlt: number;
  internalLinks: number;
  externalLinks: number;
  outboundDomains: string[];
  isHttps: boolean;
  hasAuthorByline: boolean;
  publishedDate: string | null;
  modifiedDate: string | null;
  /** Cleaned main-content text, already truncated for the model budget. */
  text: string;
  /** True when text was cut to fit the context budget. */
  textTruncated: boolean;
}

export interface Competitor {
  rank: number;
  url: string;
  title: string;
  snippet: string;
}

export interface AnalysisInput {
  mode: "url" | "content";
  url?: string;
  content?: string;
  /** The query the page is meant to win. Optional but sharpens every judgment. */
  targetQuery?: string;
  audience?: string;
  includeCompetitors: boolean;
}

export interface AnalysisReport {
  input: AnalysisInput;
  facts: PageFacts;
  competitors: Competitor[];
  competitorSource: "dataforseo" | "cache" | "none";
  competitorNote: string | null;
  /** USD spent on SERP data for this report. Zero on a cache hit. */
  competitorCost: number;
  overall: number;
  pillars: PillarScore[];
  fixes: Fix[];
  intent: { choice: string; confidence: number; probabilities: Record<string, number> } | null;
  model: string;
  usage: { input_tokens: number; output_tokens: number };
  elapsedMs: number;
  warnings: string[];
}
