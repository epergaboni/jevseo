import { NextResponse } from "next/server";
import { z } from "zod";
import { createProject, listProjects } from "@/lib/db/queries";
import { withCredentials } from "@/lib/config/with-credentials";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CreateSchema = z.object({
  name: z.string().trim().min(1).max(120),
  startUrl: z.string().trim().url().max(2048),
  audience: z.string().trim().max(300).optional(),
  locationCode: z.number().int().optional(),
  languageCode: z.string().trim().max(8).optional(),
});

async function GETHandler() {
  return NextResponse.json({ ok: true, projects: await listProjects() });
}

async function POSTHandler(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON body." }, { status: 400 });
  }

  const parsed = CreateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid project." },
      { status: 422 },
    );
  }

  let domain: string;
  try {
    const url = new URL(parsed.data.startUrl);
    if (url.protocol !== "http:" && url.protocol !== "https:") throw new Error();
    domain = url.hostname.replace(/^www\./, "");
  } catch {
    return NextResponse.json({ ok: false, error: "Start URL must be http or https." }, { status: 422 });
  }

  try {
    const project = await createProject({
      name: parsed.data.name,
      domain,
      startUrl: parsed.data.startUrl,
      audience: parsed.data.audience ?? null,
      locationCode: parsed.data.locationCode ?? 2826,
      languageCode: parsed.data.languageCode ?? "en",
    });
    return NextResponse.json({ ok: true, project }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not create the project.";
    const duplicate = /UNIQUE|constraint/i.test(message);
    return NextResponse.json(
      {
        ok: false,
        error: duplicate ? `A project for ${domain} already exists.` : message,
      },
      { status: duplicate ? 409 : 500 },
    );
  }
}


export const GET = withCredentials(GETHandler);


export const POST = withCredentials(POSTHandler);
