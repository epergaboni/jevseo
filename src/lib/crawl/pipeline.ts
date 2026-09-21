import "server-only";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { ensureSchema } from "@/lib/db/migrate";
import { crawls, pageDecisions, pageReports, pages, planItems, snapshots, cannibalPairs } from "@/lib/db/schema";
import { crawlSite, type CrawledPage } from "@/lib/crawl/crawler";
import { evaluateRules } from "@/lib/extract/rules";
import { judge } from "@/lib/judge/run";
import { ACTION_LABEL } from "@/lib/judge/actions";
import { decidePageAction, detectCannibalisation } from "@/lib/judge/decisions";
import { buildFixes, composePillars, overallScore } from "@/lib/score/compose";
import type { Project } from "@/lib/db/schema";
import type { AnalysisInput, Fix, PageFacts } from "@/lib/types";

/**
 * The end-to-end run: crawl, analyse, decide, plan.
 *
 * It runs detached from the request that started it, writing progress to the
 * crawls row, because a 40-page crawl outlives any sensible HTTP timeout. The
 * UI polls that row rather than holding a connection open.
 */

const ANALYSIS_CONCURRENCY = 4;
const DECISION_CONCURRENCY = 4;

/** Run tasks with a bounded worker pool, preserving input order in the output. */
async function pool<T, R>(items: T[], limit: number, fn: (item: T, index: number) => Promise<R>) {
  const results = new Array<R>(items.length);
  let cursor = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (cursor < items.length) {
        const index = cursor++;
        results[index] = await fn(items[index], index);
      }
    }),
  );
  return results;
}

export async function runCrawl(crawlId: string, project: Project): Promise<void> {
  ensureSchema();
  const db = getDb();

  const setStatus = async (patch: Partial<typeof crawls.$inferInsert>) => {
    await db.update(crawls).set(patch).where(eq(crawls.id, crawlId));
  };

  try {
    const row = await db.select().from(crawls).where(eq(crawls.id, crawlId)).limit(1);
    const maxPages = row[0]?.maxPages ?? 25;

    await setStatus({ status: "crawling" });

    // ---------------------------------------------------------------- crawl
    const crawled = await crawlSite({
      startUrl: project.startUrl,
      maxPages,
      onPage: () => {},
    });

    const inserted: { id: string; page: CrawledPage }[] = [];
    for (const page of crawled) {
      const id = crypto.randomUUID();
      await db.insert(pages).values({
        id,
        crawlId,
        projectId: project.id,
        url: page.url,
        discoveredVia: page.discoveredVia,
        depth: page.depth,
        statusCode: page.statusCode,
        title: page.facts?.title ?? null,
        wordCount: page.facts?.wordCount ?? null,
        facts: page.facts,
        fetchError: page.error,
      });
      inserted.push({ id, page });
    }
    await setStatus({ status: "analysing", pagesFound: crawled.length });

    // -------------------------------------------------------------- analyse
    const MIN_WORDS = 50;
    const analysable = inserted.filter(
      (r) => r.page.facts && (r.page.facts.wordCount ?? 0) >= MIN_WORDS,
    ) as { id: string; page: CrawledPage & { facts: PageFacts } }[];

    // A page skipped for being too thin must say so. Otherwise the inventory
    // shows a blank score and the reader cannot tell a skip from a failure.
    for (const row of inserted) {
      if (!row.page.facts || row.page.error) continue;
      const words = row.page.facts.wordCount ?? 0;
      if (words >= MIN_WORDS) continue;
      await db
        .update(pages)
        .set({
          fetchError: `Only ${words} words of text found, so it was not scored. The page most likely builds its content with JavaScript, which the crawler does not execute.`,
        })
        .where(eq(pages.id, row.id));
    }

    let tokens = 0;
    let analysed = 0;

    const analyses = await pool(analysable, ANALYSIS_CONCURRENCY, async (row) => {
      const input: AnalysisInput = {
        mode: "url",
        url: row.page.url,
        audience: project.audience ?? undefined,
        includeCompetitors: false,
      };
      try {
        const rules = evaluateRules(row.page.facts, input);
        const judged = await judge(row.page.facts, input);
        const pillars = composePillars(judged.judgments, rules);
        const overall = overallScore(pillars);
        const fixes = buildFixes(judged.judgments, rules);

        await db.insert(pageReports).values({
          pageId: row.id,
          projectId: project.id,
          overall,
          seo: pillars.find((p) => p.pillar === "seo")?.score ?? 0,
          aeo: pillars.find((p) => p.pillar === "aeo")?.score ?? 0,
          geo: pillars.find((p) => p.pillar === "geo")?.score ?? 0,
          judgments: judged.judgments,
          rules,
          fixes,
          model: judged.model,
          inputTokens: judged.usage.input_tokens,
        });
        await db.insert(snapshots).values({
          projectId: project.id,
          crawlId,
          url: row.page.url,
          overall,
          seo: pillars.find((p) => p.pillar === "seo")?.score ?? 0,
          aeo: pillars.find((p) => p.pillar === "aeo")?.score ?? 0,
          geo: pillars.find((p) => p.pillar === "geo")?.score ?? 0,
        });

        tokens += judged.usage.input_tokens;
        analysed += 1;
        await setStatus({ pagesAnalysed: analysed, inputTokens: tokens });

        return { row, pillars, overall, fixes };
      } catch (error) {
        // One page failing must not sink the crawl.
        await db
          .update(pages)
          .set({
            fetchError: `Analysis failed: ${error instanceof Error ? error.message : "unknown"}`,
          })
          .where(eq(pages.id, row.id));
        return null;
      }
    });

    const ok = analyses.filter((a): a is NonNullable<typeof a> => a !== null);

    // -------------------------------------------------------------- decide
    await setStatus({ status: "deciding" });
    const titles = ok.map((a) => a.row.page.facts.title ?? a.row.page.url);

    const decisions = await pool(ok, DECISION_CONCURRENCY, async (entry, index) => {
      try {
        const others = titles.filter((_, i) => i !== index);
        const decision = await decidePageAction(
          entry.row.page.facts,
          entry.pillars,
          project.audience,
          others,
        );
        tokens += decision.usage.input_tokens;

        await db.insert(pageDecisions).values({
          pageId: entry.row.id,
          projectId: project.id,
          action: decision.action,
          confidence: decision.confidence,
          probabilities: decision.probabilities,
          opportunity: decision.opportunity,
          effort: decision.effort,
          reason: decision.reason,
        });
        return { entry, decision };
      } catch {
        return null;
      }
    });

    const decided = decisions.filter((d): d is NonNullable<typeof d> => d !== null);
    await setStatus({ inputTokens: tokens });

    // ------------------------------------------------------- cannibalisation
    const candidates = buildCannibalCandidates(
      ok.map((a) => ({ id: a.row.id, title: a.row.page.facts.title ?? a.row.page.url })),
    );
    if (candidates.length > 0) {
      try {
        for (const pair of await detectCannibalisation(candidates)) {
          await db.insert(cannibalPairs).values({
            projectId: project.id,
            pageAId: pair.aId,
            pageBId: pair.bId,
            overlap: pair.overlap,
            recommendation: pair.recommendation,
          });
        }
      } catch {
        // Cannibalisation is an extra, not a gate on the run finishing.
      }
    }

    // ----------------------------------------------------------------- plan
    await db.delete(planItems).where(eq(planItems.projectId, project.id));
    for (const { entry, decision } of decided) {
      const url = entry.row.page.url;

      if (decision.action !== "leave") {
        await db.insert(planItems).values({
          projectId: project.id,
          kind: "page_action",
          pageId: entry.row.id,
          title: `${ACTION_LABEL[decision.action]} — ${entry.row.page.facts.title ?? url}`,
          detail: decision.reason,
          evidence: `Scored ${entry.overall}/100. Jev chose “${ACTION_LABEL[decision.action]}” with ${decision.confidence}% confidence.`,
          priority: priorityOf(decision.opportunity, decision.effort, entry.overall),
          impact: decision.opportunity,
          effort: decision.effort,
          confidence: decision.confidence,
        });
      }

      for (const fix of topFixes(entry.fixes)) {
        await db.insert(planItems).values({
          projectId: project.id,
          kind: "page_fix",
          pageId: entry.row.id,
          title: fix.title,
          detail: fix.detail,
          evidence: `${url} — ${fix.evidence}`,
          priority: fixPriority(fix, decision.opportunity),
          impact: Math.round(Math.min(1, fix.impact / 3) * 100),
          effort: 20,
          confidence: fix.confidence === null ? null : Math.round(fix.confidence * 100),
        });
      }
    }

    await setStatus({ status: "complete", finishedAt: new Date(), inputTokens: tokens });
  } catch (error) {
    await setStatus({
      status: "failed",
      error: error instanceof Error ? error.message : "Unknown error",
      finishedAt: new Date(),
    });
  }
}

/** Only the blocking and high-severity fixes reach the plan; the rest stay on the page report. */
function topFixes(fixes: Fix[]): Fix[] {
  return fixes.filter((f) => f.severity === "critical" || f.severity === "high").slice(0, 3);
}

/** Opportunity first, effort as a tie-break, a weak score as a nudge. */
function priorityOf(opportunity: number, effort: number, overall: number): number {
  return Math.round(opportunity * 2 - effort + (100 - overall) * 0.5);
}

function fixPriority(fix: Fix, opportunity: number): number {
  const severity = fix.severity === "critical" ? 160 : 90;
  return Math.round(severity + opportunity * 0.4);
}

/**
 * Pair pages whose titles share enough significant words to be worth asking
 * about. A full N² sweep would spend most of its tokens confirming that
 * unrelated pages are unrelated.
 */
function buildCannibalCandidates(items: { id: string; title: string }[]) {
  const stop = new Set([
    "the","a","an","and","or","for","to","of","in","on","with","your","our","how","what","why",
    "best","guide","uk","is","are","from","by","at","it","you",
  ]);
  const tokenise = (t: string) =>
    new Set(
      t.toLowerCase().replace(/[^a-z0-9\s]/g, " ").split(/\s+/).filter((w) => w.length > 2 && !stop.has(w)),
    );

  const tokens = items.map((i) => ({ ...i, words: tokenise(i.title) }));
  const out: { aId: string; aTitle: string; bId: string; bTitle: string }[] = [];

  for (let i = 0; i < tokens.length; i++) {
    for (let j = i + 1; j < tokens.length; j++) {
      const a = tokens[i];
      const b = tokens[j];
      const shared = [...a.words].filter((w) => b.words.has(w)).length;
      const smaller = Math.min(a.words.size, b.words.size);
      if (smaller === 0) continue;
      if (shared >= 2 && shared / smaller >= 0.5) {
        out.push({ aId: a.id, aTitle: a.title, bId: b.id, bTitle: b.title });
      }
    }
  }
  return out;
}
