import { NextResponse } from "next/server";
import { getCrawl, listPagesForCrawl } from "@/lib/db/queries";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const crawl = await getCrawl(id);
  if (!crawl) return NextResponse.json({ ok: false, error: "Crawl not found." }, { status: 404 });

  const terminal = ["complete", "failed", "cancelled"].includes(crawl.status);
  return NextResponse.json({
    ok: true,
    crawl,
    terminal,
    pages: terminal ? await listPagesForCrawl(id) : [],
  });
}
