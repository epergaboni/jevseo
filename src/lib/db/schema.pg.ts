import { index, integer, jsonb, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";

/**
 * Postgres mirror of the SQLite schema.
 *
 * A deployed instance cannot use a file, so this is what runs on Vercel. It
 * is a direct translation of `schema.ts` and must stay a direct translation:
 * `tests/schema-parity.test.ts` fails the build if the two ever declare
 * different tables or columns.
 *
 * Original notes follow.
 *
 * Schema for the project workspace.
 *
 * Two deliberate choices:
 *
 * 1. Every table that holds user data carries `ownerId`. It is "local" for a
 *    single-machine install, and becomes a real account id once authentication
 *    lands. Every query filters on it from day one, so adding accounts is
 *    additive rather than a rewrite.
 * 2. Analysis output is stored as JSON rather than shredded into columns. The
 *    judgment catalogue changes often; a schema migration per new dimension
 *    would be a tax on the thing we most want to iterate on. Anything queried
 *    or sorted is promoted to a real column.
 */

const id = () =>
  text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID());

const createdAt = () =>
  timestamp("created_at", { withTimezone: true }).notNull().defaultNow();

export const LOCAL_OWNER = "local";

export const projects = pgTable(
  "projects",
  {
    id: id(),
    ownerId: text("owner_id").notNull().default(LOCAL_OWNER),
    name: text("name").notNull(),
    /** Bare hostname, no scheme, no trailing slash. */
    domain: text("domain").notNull(),
    /** Seed URL the crawler starts from. */
    startUrl: text("start_url").notNull(),
    audience: text("audience"),
    /** DataForSEO location code. 2826 is the United Kingdom. */
    locationCode: integer("location_code").notNull().default(2826),
    languageCode: text("language_code").notNull().default("en"),
    createdAt: createdAt(),
  },
  (t) => [
    index("projects_owner_idx").on(t.ownerId),
    uniqueIndex("projects_owner_domain_idx").on(t.ownerId, t.domain),
  ],
);

export const crawls = pgTable(
  "crawls",
  {
    id: id(),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    status: text("status", {
      enum: ["queued", "crawling", "analysing", "deciding", "complete", "failed", "cancelled"],
    })
      .notNull()
      .default("queued"),
    maxPages: integer("max_pages").notNull().default(25),
    pagesFound: integer("pages_found").notNull().default(0),
    pagesAnalysed: integer("pages_analysed").notNull().default(0),
    /** Running totals so cost is never a surprise. */
    inputTokens: integer("input_tokens").notNull().default(0),
    serpCostUsd: integer("serp_cost_micros").notNull().default(0),
    error: text("error"),
    startedAt: createdAt(),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
  },
  (t) => [index("crawls_project_idx").on(t.projectId, t.startedAt)],
);

export const pages = pgTable(
  "pages",
  {
    id: id(),
    crawlId: text("crawl_id")
      .notNull()
      .references(() => crawls.id, { onDelete: "cascade" }),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    url: text("url").notNull(),
    /** How the crawler found it, for debugging a thin crawl. */
    discoveredVia: text("discovered_via", { enum: ["seed", "sitemap", "link"] }).notNull(),
    depth: integer("depth").notNull().default(0),
    statusCode: integer("status_code"),
    title: text("title"),
    wordCount: integer("word_count"),
    /** Full PageFacts. Not queried, so it stays as JSON. */
    facts: jsonb("facts"),
    fetchError: text("fetch_error"),
    createdAt: createdAt(),
  },
  (t) => [
    index("pages_crawl_idx").on(t.crawlId),
    uniqueIndex("pages_crawl_url_idx").on(t.crawlId, t.url),
  ],
);

export const pageReports = pgTable(
  "page_reports",
  {
    id: id(),
    pageId: text("page_id")
      .notNull()
      .references(() => pages.id, { onDelete: "cascade" }),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    /** Promoted to columns because the roadmap sorts on them. */
    overall: integer("overall").notNull(),
    seo: integer("seo").notNull(),
    aeo: integer("aeo").notNull(),
    geo: integer("geo").notNull(),
    targetQuery: text("target_query"),
    judgments: jsonb("judgments").notNull(),
    rules: jsonb("rules").notNull(),
    fixes: jsonb("fixes").notNull(),
    model: text("model").notNull(),
    inputTokens: integer("input_tokens").notNull().default(0),
    createdAt: createdAt(),
  },
  (t) => [
    index("reports_project_idx").on(t.projectId, t.createdAt),
    index("reports_page_idx").on(t.pageId),
  ],
);

/**
 * Jev as decision maker. One typed action per page, with the full distribution
 * kept so the UI can show how close the runner-up was.
 */
export const pageDecisions = pgTable(
  "page_decisions",
  {
    id: id(),
    pageId: text("page_id")
      .notNull()
      .references(() => pages.id, { onDelete: "cascade" }),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    action: text("action", {
      enum: ["leave", "improve", "rewrite", "merge", "prune", "split"],
    }).notNull(),
    confidence: integer("confidence_pct").notNull(),
    probabilities: jsonb("probabilities").notNull(),
    /** 0-100. How much this page is worth working on at all. */
    opportunity: integer("opportunity").notNull().default(0),
    /** 0-100. How much work the action implies. */
    effort: integer("effort").notNull().default(0),
    reason: text("reason"),
    createdAt: createdAt(),
  },
  (t) => [index("decisions_project_idx").on(t.projectId)],
);

/** Pages competing for the same intent. Detected pairwise by Jev. */
export const cannibalPairs = pgTable(
  "cannibal_pairs",
  {
    id: id(),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    pageAId: text("page_a_id")
      .notNull()
      .references(() => pages.id, { onDelete: "cascade" }),
    pageBId: text("page_b_id")
      .notNull()
      .references(() => pages.id, { onDelete: "cascade" }),
    /** Probability the two compete for the same intent. */
    overlap: integer("overlap_pct").notNull(),
    recommendation: text("recommendation"),
    createdAt: createdAt(),
  },
  (t) => [index("cannibal_project_idx").on(t.projectId)],
);

export const keywords = pgTable(
  "keywords",
  {
    id: id(),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    keyword: text("keyword").notNull(),
    volume: integer("volume"),
    difficulty: integer("difficulty"),
    cpcMicros: integer("cpc_micros"),
    source: text("source", { enum: ["dataforseo", "manual"] })
      .notNull()
      .default("dataforseo"),
    /** Jev's verdict on whether this site should chase it. */
    verdict: text("verdict", { enum: ["target", "maybe", "skip"] }),
    verdictConfidence: integer("verdict_confidence_pct"),
    verdictReason: text("verdict_reason"),
    /** The page that should own it, when one already exists. */
    assignedPageId: text("assigned_page_id").references(() => pages.id, { onDelete: "set null" }),
    createdAt: createdAt(),
  },
  (t) => [
    index("keywords_project_idx").on(t.projectId),
    uniqueIndex("keywords_project_keyword_idx").on(t.projectId, t.keyword),
  ],
);

/** The ordered plan. Rows come from decisions, fixes and keyword gaps alike. */
export const planItems = pgTable(
  "plan_items",
  {
    id: id(),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    kind: text("kind", {
      enum: ["page_action", "page_fix", "new_content", "consolidation"],
    }).notNull(),
    title: text("title").notNull(),
    detail: text("detail").notNull(),
    evidence: text("evidence"),
    /** Sort key. Higher is sooner. */
    priority: integer("priority").notNull().default(0),
    impact: integer("impact").notNull().default(0),
    effort: integer("effort").notNull().default(0),
    status: text("status", { enum: ["todo", "doing", "done", "dismissed"] })
      .notNull()
      .default("todo"),
    pageId: text("page_id").references(() => pages.id, { onDelete: "cascade" }),
    keywordId: text("keyword_id").references(() => keywords.id, { onDelete: "set null" }),
    /** Null when the item came from a rule rather than a judgment. */
    confidence: integer("confidence_pct"),
    createdAt: createdAt(),
  },
  (t) => [index("plan_project_idx").on(t.projectId, t.status, t.priority)],
);

/** One row per page per crawl, so movement over time is queryable. */
export const snapshots = pgTable(
  "snapshots",
  {
    id: id(),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    crawlId: text("crawl_id")
      .notNull()
      .references(() => crawls.id, { onDelete: "cascade" }),
    url: text("url").notNull(),
    overall: integer("overall").notNull(),
    seo: integer("seo").notNull(),
    aeo: integer("aeo").notNull(),
    geo: integer("geo").notNull(),
    createdAt: createdAt(),
  },
  (t) => [index("snapshots_project_url_idx").on(t.projectId, t.url, t.createdAt)],
);

export type Project = typeof projects.$inferSelect;
export type NewProject = typeof projects.$inferInsert;
export type Crawl = typeof crawls.$inferSelect;
export type Page = typeof pages.$inferSelect;
export type PageReport = typeof pageReports.$inferSelect;
export type PageDecision = typeof pageDecisions.$inferSelect;
export type Keyword = typeof keywords.$inferSelect;
export type PlanItem = typeof planItems.$inferSelect;
export type Snapshot = typeof snapshots.$inferSelect;
