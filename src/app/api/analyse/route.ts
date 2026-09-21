import { NextResponse } from "next/server";
import { z } from "zod";
import { extractFacts, factsFromContent, fetchPage, FetchError } from "@/lib/extract/fetch-page";
import { evaluateRules } from "@/lib/extract/rules";
import { judge } from "@/lib/judge/run";
import { judgeAgainstSerp } from "@/lib/judge/competitive";
import { fetchCompetitors } from "@/lib/serp/dataforseo";
import { hasTypeSafeCredentials } from "@/lib/typesafe/client";
import { buildFixes, composePillars, overallScore } from "@/lib/score/compose";
import type { AnalysisReport } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 120;

const RequestSchema = z
  .object({
    mode: z.enum(["url", "content"]),
    url: z.string().trim().max(2048).optional(),
    content: z.string().trim().max(400_000).optional(),
    targetQuery: z.string().trim().max(300).optional(),
    audience: z.string().trim().max(300).optional(),
    includeCompetitors: z.boolean().default(false),
  })
  .refine((v) => (v.mode === "url" ? Boolean(v.url) : Boolean(v.content)), {
    message: "Provide a URL in url mode, or content in content mode.",
  })
  .refine((v) => v.mode !== "content" || (v.content?.length ?? 0) >= 200, {
    message: "Paste at least 200 characters of content to get a meaningful read.",
    path: ["content"],
  });

function fail(message: string, status: number, hint?: string) {
  return NextResponse.json({ ok: false, error: { message, hint: hint ?? null } }, { status });
}

export async function POST(request: Request) {
  const started = Date.now();

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return fail("The request body was not valid JSON.", 400);
  }

  const parsed = RequestSchema.safeParse(body);
  if (!parsed.success) {
    return fail(parsed.error.issues[0]?.message ?? "The request was not valid.", 422);
  }
  const input = parsed.data;

  if (!hasTypeSafeCredentials()) {
    return fail(
      "No TypeSafe API key is configured.",
      401,
      "Add one on the Settings page, or set TYPESAFE_API_KEY in the environment.",
    );
  }

  const warnings: string[] = [];

  // 1. Get the page facts. Deterministic, no model involved.
  let facts;
  try {
    if (input.mode === "url") {
      const page = await fetchPage(input.url!);
      facts = extractFacts(page.html, {
        url: page.url,
        statusCode: page.statusCode,
        responseMs: page.responseMs,
      });
    } else {
      facts = factsFromContent(input.content!);
    }
  } catch (error) {
    if (error instanceof FetchError) {
      const blocked = error.statusCode === 403 || error.statusCode === 429 || error.statusCode === 401;
      return fail(
        error.message,
        422,
        blocked
          ? "Open the page in a browser, copy the article text, and use \u201cCheck a draft\u201d instead."
          : undefined,
      );
    }
    return fail(
      error instanceof Error ? error.message : "Could not read the page.",
      500,
    );
  }

  if (facts.wordCount < 50) {
    return fail(
      "There is too little text on this page to judge — under 50 words were found.",
      422,
      input.mode === "url"
        ? "The page may render its content with JavaScript, which this analyser does not execute. Paste the content instead."
        : undefined,
    );
  }
  if (facts.textTruncated) {
    warnings.push("The content was longer than the model's context budget and was truncated.");
  }

  const rules = evaluateRules(facts, input);

  // 2. Competitor lookup, only when asked and only with a query to look up.
  const wantsCompetitors = input.includeCompetitors && Boolean(input.targetQuery?.trim());
  if (input.includeCompetitors && !input.targetQuery?.trim()) {
    warnings.push("Competitor comparison needs a target query, so it was skipped.");
  }
  const serp = wantsCompetitors
    ? await fetchCompetitors(input.targetQuery!.trim())
    : { competitors: [], source: "none" as const, note: null, cost: 0 };

  // A SERP lookup that was asked for and did not happen must be visible in the
  // report, not buried in a field the UI does not render.
  if (wantsCompetitors && serp.source === "none" && serp.note) {
    warnings.push(serp.note);
  }

  // 3. Ask Jev. The page judgments and the competitive ones run concurrently.
  let judged;
  let competitive;
  try {
    [judged, competitive] = await Promise.all([
      judge(facts, input),
      serp.competitors.length
        ? judgeAgainstSerp(facts, input, serp.competitors)
        : Promise.resolve({ judgments: [], usage: { input_tokens: 0, output_tokens: 0 } }),
    ]);
  } catch (error) {
    const message = error instanceof Error ? error.message : "The model request failed.";
    const status = /401|unauthor/i.test(message) ? 401 : /429|rate/i.test(message) ? 429 : 502;
    return fail(`Jev could not complete the analysis: ${message}`, status);
  }

  // 4. Compose. Weights and thresholds are code-owned, applied to reusable judgments.
  const judgments = [...judged.judgments, ...competitive.judgments];
  const pillars = composePillars(judgments, rules);

  const report: AnalysisReport = {
    input,
    facts,
    competitors: serp.competitors,
    competitorSource: serp.source,
    competitorNote: serp.note,
    competitorCost: serp.cost,
    overall: overallScore(pillars),
    pillars,
    fixes: buildFixes(judgments, rules),
    intent: judged.intent,
    model: judged.model,
    usage: {
      input_tokens: judged.usage.input_tokens + competitive.usage.input_tokens,
      output_tokens: judged.usage.output_tokens + competitive.usage.output_tokens,
    },
    elapsedMs: Date.now() - started,
    warnings: [...warnings, ...judged.warnings],
  };

  return NextResponse.json({ ok: true, report });
}
