import { after, NextResponse } from "next/server";
import { z } from "zod";
import { createCrawl, getProject, latestCrawl } from "@/lib/db/queries";
import { runCrawl } from "@/lib/crawl/pipeline";
import { hasTypeSafeCredentials } from "@/lib/typesafe/client";

export const runtime = "nodejs";
export const maxDuration = 800;
export const dynamic = "force-dynamic";

const Schema = z.object({ maxPages: z.number().int().min(1).max(200).default(25) });

const RUNNING = new Set(["queued", "crawling", "analysing", "deciding"]);

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  if (!hasTypeSafeCredentials()) {
    return NextResponse.json(
      { ok: false, error: "No TypeSafe API key is configured.", hint: "Add one on the Settings page." },
      { status: 401 },
    );
  }

  const project = await getProject(id);
  if (!project) return NextResponse.json({ ok: false, error: "Project not found." }, { status: 404 });

  const existing = await latestCrawl(id);
  if (existing && RUNNING.has(existing.status)) {
    return NextResponse.json(
      { ok: false, error: "A crawl is already running for this project.", crawlId: existing.id },
      { status: 409 },
    );
  }

  const body = await request.json().catch(() => ({}));
  const parsed = Schema.safeParse(body);
  const maxPages = parsed.success ? parsed.data.maxPages : 25;

  const crawl = await createCrawl(id, maxPages);

  // The run outlives this request by design; the UI polls the crawl row.
  // `after` keeps the serverless invocation alive until it settles.
  after(async () => {
    await runCrawl(crawl.id, project);
  });

  return NextResponse.json({ ok: true, crawlId: crawl.id }, { status: 202 });
}
