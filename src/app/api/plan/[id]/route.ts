import { NextResponse } from "next/server";
import { z } from "zod";
import { setPlanItemStatus } from "@/lib/db/queries";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Schema = z.object({ status: z.enum(["todo", "doing", "done", "dismissed"]) });

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const parsed = Schema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "Invalid status." }, { status: 422 });
  }
  await setPlanItemStatus(id, parsed.data.status);
  return NextResponse.json({ ok: true });
}
