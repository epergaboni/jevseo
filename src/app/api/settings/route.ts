import { withCredentials } from "@/lib/config/with-credentials";
import { NextResponse } from "next/server";
import { z } from "zod";
import {
  CREDENTIAL_KEYS,
  CREDENTIAL_META,
  CREDENTIAL_STORE_FILE,
  CredentialWriteError,
  canWriteCredentials,
  clearCredentials,
  credentialStatuses,
  saveCredentials,
} from "@/lib/config/credentials";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SaveSchema = z.object(
  Object.fromEntries(CREDENTIAL_KEYS.map((k) => [k, z.string().max(500).optional()])) as Record<
    (typeof CREDENTIAL_KEYS)[number],
    z.ZodOptional<z.ZodString>
  >,
);

function state() {
  return {
    statuses: credentialStatuses(),
    meta: CREDENTIAL_META,
    canWrite: canWriteCredentials(),
    storeFile: CREDENTIAL_STORE_FILE,
  };
}

async function GETHandler() {
  return NextResponse.json({ ok: true, ...state() });
}

async function PUTHandler(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "The request body was not valid JSON." }, { status: 400 });
  }

  const parsed = SaveSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid credentials payload." },
      { status: 422 },
    );
  }

  try {
    saveCredentials(parsed.data);
  } catch (error) {
    if (error instanceof CredentialWriteError) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 403 });
    }
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Could not save credentials." },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true, ...state() });
}

async function DELETEHandler() {
  try {
    clearCredentials();
  } catch (error) {
    if (error instanceof CredentialWriteError) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 403 });
    }
    return NextResponse.json({ ok: false, error: "Could not clear credentials." }, { status: 500 });
  }
  return NextResponse.json({ ok: true, ...state() });
}


export const GET = withCredentials(GETHandler);


export const PUT = withCredentials(PUTHandler);


export const DELETE = withCredentials(DELETEHandler);
