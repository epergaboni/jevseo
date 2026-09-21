import { NextResponse } from "next/server";
import { z } from "zod";
import { testTypeSafeConnection } from "@/lib/typesafe/client";
import { testDataForSeoConnection } from "@/lib/serp/dataforseo";
import { withCredentials } from "@/lib/config/with-credentials";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Schema = z.object({ service: z.enum(["typesafe", "dataforseo"]) });

async function POSTHandler(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, detail: "The request body was not valid JSON." }, { status: 400 });
  }

  const parsed = Schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, detail: "Name a service to test." }, { status: 422 });
  }

  const result =
    parsed.data.service === "typesafe"
      ? await testTypeSafeConnection()
      : await testDataForSeoConnection();

  return NextResponse.json(result);
}


export const POST = withCredentials(POSTHandler);
