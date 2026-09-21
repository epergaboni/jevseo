import { after, NextResponse } from "next/server";
import { z } from "zod";
import { createCrawl, getProject, latestCrawl } from "@/lib/db/queries";
import { runCrawl } from "@/lib/crawl/pipeline";
import { hasTypeSafeCredentials } from "@/lib/typesafe/client";
import {
  currentRequestCredentials,
  withRequestCredentials,
} from "@/lib/config/request-credentials";
import { withCredentials } from "@/lib/config/with-credentials";

export const runtime = "nodejs";
// 300s is the ceiling on Vercel's hobby plan. The pipeline is given a
// slightly shorter budget so it finishes and records partial results rather
// than being killed with the crawl row stuck at "analysing".
export const maxDuration = 300;
export const dynamic = "force-dynamic";

const Schema = z.object({ maxPages: z.number().int().min(1).max(200).default(25) });

const RUNNING = new Set(["queued", "crawling", "analysing", "deciding"]);

async function POSTHandler(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  if (!hasTypeSafeCredentials()) {
    return NextResponse.json(
      {
        ok: false,
        error: "No TypeSafe API key is configured.",
        hint: "Add your own key on the Settings page. It is kept in your browser and never stored on this server.",
      },
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
  //
  // AsyncLocalStorage does not reliably survive into `after`, and under
  // bring-your-own-key the visitor's credentials only exist in that context.
  // Capture them here and re-establish them around the run, or every crawl on
  // a public instance fails at the first call to Jev.
  const credentials = currentRequestCredentials();
  after(async () => {
    await withRequestCredentials(credentials, () => runCrawl(crawl.id, project));
  });

  return NextResponse.json({ ok: true, crawlId: crawl.id }, { status: 202 });
}


export const POST = withCredentials(POSTHandler);
