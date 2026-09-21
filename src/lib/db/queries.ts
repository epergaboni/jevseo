import "server-only";
import { and, desc, eq, sql } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { ensureSchema } from "@/lib/db/migrate";
import {
  LOCAL_OWNER,
  cannibalPairs,
  crawls,
  pageDecisions,
  pageReports,
  pages,
  planItems,
  projects,
  snapshots,
} from "@/lib/db/schema";
import type { NewProject, Project } from "@/lib/db/schema";

/**
 * Every read and write is scoped by owner or project id. That is what makes
 * adding authentication later additive rather than a rewrite — the filter is
 * already there, it just starts returning a real account id.
 */
function ownerId(): string {
  return LOCAL_OWNER;
}

function db() {
  ensureSchema();
  return getDb();
}

/* --------------------------------------------------------------- projects */

export async function listProjects(): Promise<(Project & { lastCrawlAt: Date | null; pageCount: number })[]> {
  const rows = await db()
    .select({
      project: projects,
      lastCrawlAt: sql<number | null>`(SELECT MAX(created_at) FROM crawls WHERE crawls.project_id = ${projects.id})`,
      pageCount: sql<number>`(SELECT COUNT(*) FROM pages WHERE pages.project_id = ${projects.id})`,
    })
    .from(projects)
    .where(eq(projects.ownerId, ownerId()))
    .orderBy(desc(projects.createdAt));

  return rows.map((r) => ({
    ...r.project,
    lastCrawlAt: r.lastCrawlAt ? new Date(Number(r.lastCrawlAt)) : null,
    pageCount: Number(r.pageCount ?? 0),
  }));
}

export async function getProject(id: string): Promise<Project | null> {
  const rows = await db()
    .select()
    .from(projects)
    .where(and(eq(projects.id, id), eq(projects.ownerId, ownerId())))
    .limit(1);
  return rows[0] ?? null;
}

export async function createProject(input: Omit<NewProject, "id" | "ownerId">): Promise<Project> {
  const rows = await db()
    .insert(projects)
    .values({ ...input, ownerId: ownerId() })
    .returning();
  return rows[0];
}

export async function deleteProject(id: string): Promise<void> {
  await db().delete(projects).where(and(eq(projects.id, id), eq(projects.ownerId, ownerId())));
}

/* ----------------------------------------------------------------- crawls */

export async function createCrawl(projectId: string, maxPages: number) {
  const rows = await db().insert(crawls).values({ projectId, maxPages }).returning();
  return rows[0];
}

export async function getCrawl(id: string) {
  const rows = await db().select().from(crawls).where(eq(crawls.id, id)).limit(1);
  return rows[0] ?? null;
}

export async function latestCrawl(projectId: string) {
  const rows = await db()
    .select()
    .from(crawls)
    .where(eq(crawls.projectId, projectId))
    .orderBy(desc(crawls.startedAt))
    .limit(1);
  return rows[0] ?? null;
}

export async function listCrawls(projectId: string, limit = 20) {
  return db()
    .select()
    .from(crawls)
    .where(eq(crawls.projectId, projectId))
    .orderBy(desc(crawls.startedAt))
    .limit(limit);
}

/* ------------------------------------------------------------- page views */

export interface PageRow {
  id: string;
  url: string;
  title: string | null;
  wordCount: number | null;
  statusCode: number | null;
  fetchError: string | null;
  overall: number | null;
  seo: number | null;
  aeo: number | null;
  geo: number | null;
  action: string | null;
  actionConfidence: number | null;
  opportunity: number | null;
  effort: number | null;
  reason: string | null;
}

/** The inventory view: one row per page with its score and its decision. */
export async function listPagesForCrawl(crawlId: string): Promise<PageRow[]> {
  const rows = await db()
    .select({
      id: pages.id,
      url: pages.url,
      title: pages.title,
      wordCount: pages.wordCount,
      statusCode: pages.statusCode,
      fetchError: pages.fetchError,
      overall: pageReports.overall,
      seo: pageReports.seo,
      aeo: pageReports.aeo,
      geo: pageReports.geo,
      action: pageDecisions.action,
      actionConfidence: pageDecisions.confidence,
      opportunity: pageDecisions.opportunity,
      effort: pageDecisions.effort,
      reason: pageDecisions.reason,
    })
    .from(pages)
    .leftJoin(pageReports, eq(pageReports.pageId, pages.id))
    .leftJoin(pageDecisions, eq(pageDecisions.pageId, pages.id))
    .where(eq(pages.crawlId, crawlId));

  return rows as PageRow[];
}

export async function getPageReport(pageId: string) {
  const rows = await db()
    .select({ page: pages, report: pageReports, decision: pageDecisions })
    .from(pages)
    .leftJoin(pageReports, eq(pageReports.pageId, pages.id))
    .leftJoin(pageDecisions, eq(pageDecisions.pageId, pages.id))
    .where(eq(pages.id, pageId))
    .limit(1);
  return rows[0] ?? null;
}

/* ------------------------------------------------------------------- plan */

export async function listPlan(projectId: string) {
  return db()
    .select()
    .from(planItems)
    .where(eq(planItems.projectId, projectId))
    .orderBy(desc(planItems.priority));
}

export async function setPlanItemStatus(
  id: string,
  status: "todo" | "doing" | "done" | "dismissed",
) {
  await db().update(planItems).set({ status }).where(eq(planItems.id, id));
}

export async function listCannibalPairs(projectId: string) {
  const a = { id: pages.id, url: pages.url, title: pages.title };
  return db()
    .select({
      id: cannibalPairs.id,
      overlap: cannibalPairs.overlap,
      recommendation: cannibalPairs.recommendation,
      pageAId: cannibalPairs.pageAId,
      pageBId: cannibalPairs.pageBId,
    })
    .from(cannibalPairs)
    .where(eq(cannibalPairs.projectId, projectId))
    .orderBy(desc(cannibalPairs.overlap))
    .then(async (rows) => {
      if (rows.length === 0) return [];
      const all = await db()
        .select(a)
        .from(pages)
        .where(eq(pages.projectId, projectId));
      const byId = new Map(all.map((p) => [p.id, p]));
      return rows.map((r) => ({
        ...r,
        pageA: byId.get(r.pageAId) ?? null,
        pageB: byId.get(r.pageBId) ?? null,
      }));
    });
}

/* --------------------------------------------------------------- tracking */

/** Score movement per URL across crawls, for the tracking view. */
export async function listSnapshots(projectId: string, limit = 500) {
  return db()
    .select()
    .from(snapshots)
    .where(eq(snapshots.projectId, projectId))
    .orderBy(desc(snapshots.createdAt))
    .limit(limit);
}

export async function projectSummary(projectId: string) {
  const rows = await db()
    .select({
      pages: sql<number>`COUNT(DISTINCT ${pages.id})`,
      analysed: sql<number>`COUNT(DISTINCT ${pageReports.id})`,
      avgOverall: sql<number | null>`AVG(${pageReports.overall})`,
      avgSeo: sql<number | null>`AVG(${pageReports.seo})`,
      avgAeo: sql<number | null>`AVG(${pageReports.aeo})`,
      avgGeo: sql<number | null>`AVG(${pageReports.geo})`,
    })
    .from(pages)
    .leftJoin(pageReports, eq(pageReports.pageId, pages.id))
    .where(eq(pages.projectId, projectId));

  const r = rows[0];
  const round = (v: number | null | undefined) => (v === null || v === undefined ? null : Math.round(Number(v)));
  return {
    pages: Number(r?.pages ?? 0),
    analysed: Number(r?.analysed ?? 0),
    avgOverall: round(r?.avgOverall),
    avgSeo: round(r?.avgSeo),
    avgAeo: round(r?.avgAeo),
    avgGeo: round(r?.avgGeo),
  };
}
