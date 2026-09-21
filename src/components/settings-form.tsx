"use client";

import { useState } from "react";
import { Card, buttonClass, sizeClass } from "@/components/primitives";
import type { CredentialKey, CredentialMeta, CredentialStatus } from "@/lib/config/credential-schema";

const FIELD =
  "w-full rounded-lg border border-line bg-surface px-4 py-3 text-[15px] text-ink outline-none transition-colors placeholder:text-ink-3/70 focus:border-accent disabled:cursor-not-allowed disabled:bg-surface-2 disabled:opacity-70";

export interface SettingsState {
  statuses: CredentialStatus[];
  meta: Record<CredentialKey, CredentialMeta>;
  canWrite: boolean;
  storeFile: string;
}

type TestResult = { ok: boolean; detail: string; hint?: string };

const SERVICES = [
  {
    id: "typesafe" as const,
    name: "TypeSafe (Jev)",
    blurb:
      "Required. Every semantic judgment on this site is a typed question answered by Jev. Without a key, nothing runs.",
    href: "https://console.typesafe.ai",
    hrefLabel: "console.typesafe.ai",
    cost: "Input tokens only, at $0.042 per million. A typical page analysis costs about 4,000 tokens — a hundredth of a penny.",
  },
  {
    id: "dataforseo" as const,
    name: "DataForSEO",
    blurb:
      "Optional. Pulls the live top 10 for your target query so Jev can judge format, coverage and differentiation against what actually ranks.",
    href: "https://app.dataforseo.com/api-access",
    hrefLabel: "app.dataforseo.com/api-access",
    cost: "Charged per SERP request by DataForSEO. Connection tests here are free — they read your account balance and nothing else.",
  },
];

export function SettingsForm({ initial }: { initial: SettingsState }) {
  const [state, setState] = useState<SettingsState>(initial);
  const [drafts, setDrafts] = useState<Partial<Record<CredentialKey, string>>>({});
  const [reveal, setReveal] = useState<Partial<Record<CredentialKey, boolean>>>({});
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ tone: "good" | "bad"; text: string } | null>(null);
  const [tests, setTests] = useState<Partial<Record<string, TestResult | "pending">>>({});

  async function save(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    setMessage(null);
    try {
      const res = await fetch("/api/settings", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(drafts),
      });
      const payload = (await res.json()) as ({ ok: true } & SettingsState) | { ok: false; error: string };
      if (!payload.ok) {
        setMessage({ tone: "bad", text: payload.error });
        return;
      }
      setState(payload);
      setDrafts({});
      setTests({});
      setMessage({ tone: "good", text: "Saved. New requests will use these straight away — no restart needed." });
    } finally {
      setSaving(false);
    }
  }

  async function clearAll() {
    if (!confirm("Remove every credential from the local store? Environment variables are not affected.")) return;
    const res = await fetch("/api/settings", { method: "DELETE" });
    const payload = (await res.json()) as ({ ok: true } & SettingsState) | { ok: false; error: string };
    if (payload.ok) {
      setState(payload);
      setDrafts({});
      setTests({});
      setMessage({ tone: "good", text: "Local credential store deleted." });
    } else {
      setMessage({ tone: "bad", text: payload.error });
    }
  }

  async function runTest(service: "typesafe" | "dataforseo") {
    setTests((t) => ({ ...t, [service]: "pending" }));
    const res = await fetch("/api/settings/test", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ service }),
    });
    const result = (await res.json()) as TestResult;
    setTests((t) => ({ ...t, [service]: result }));
  }

  const statusOf = (key: CredentialKey) => state.statuses.find((s) => s.key === key)!;

  return (
    <>
      {!state.canWrite && (
        <div className="mb-6 rounded-lg border border-warn/30 bg-warn-soft px-4 py-3 text-sm text-warn-text">
          This instance is running in production, so credentials cannot be written from the browser. Set them as
          environment variables on the host instead.
        </div>
      )}

      <form onSubmit={save} className="flex flex-col gap-5">
        {SERVICES.map((service) => {
          const keys = (Object.keys(state.meta) as CredentialKey[]).filter(
            (k) => state.meta[k].service === service.id,
          );
          const test = tests[service.id];

          return (
            <Card key={service.id}>
              <div className="mb-1 flex items-baseline justify-between gap-3">
                <h2 className="text-base font-semibold">{service.name}</h2>
                <a
                  href={service.href}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="text-xs text-accent underline underline-offset-2"
                >
                  {service.hrefLabel}
                </a>
              </div>
              <p className="text-sm text-ink-2">{service.blurb}</p>
              <p className="mt-1 text-xs text-ink-2">{service.cost}</p>

              <div className="mt-4 flex flex-col gap-4">
                {keys.map((key) => {
                  const meta = state.meta[key];
                  const status = statusOf(key);
                  const fromEnv = status.source === "env";
                  const shown = reveal[key] === true;

                  return (
                    <div key={key} className="flex flex-col gap-1.5">
                      <div className="flex flex-wrap items-baseline justify-between gap-2">
                        <label htmlFor={key} className="text-sm font-medium">
                          {meta.label}
                          {meta.required && <span className="ml-1 text-bad-text">*</span>}
                        </label>
                        <SourceTag status={status} />
                      </div>

                      <div className="flex gap-2">
                        <input
                          id={key}
                          type={meta.secret && !shown ? "password" : "text"}
                          autoComplete="off"
                          spellCheck={false}
                          disabled={fromEnv || !state.canWrite}
                          value={drafts[key] ?? ""}
                          onChange={(e) => setDrafts((d) => ({ ...d, [key]: e.target.value }))}
                          placeholder={
                            fromEnv
                              ? "Set by an environment variable"
                              : status.configured
                                ? `${status.preview} — type to replace`
                                : "Not set"
                          }
                          className={FIELD}
                        />
                        {meta.secret && !fromEnv && state.canWrite && (
                          <button
                            type="button"
                            onClick={() => setReveal((r) => ({ ...r, [key]: !shown }))}
                            className="shrink-0 rounded-lg border border-line px-3 text-xs text-ink-2 hover:text-foreground"
                          >
                            {shown ? "Hide" : "Show"}
                          </button>
                        )}
                      </div>

                      <p className="text-xs text-ink-2">
                        {fromEnv
                          ? `Coming from the ${key} environment variable, which always wins over this file.`
                          : meta.help}
                      </p>
                    </div>
                  );
                })}
              </div>

              <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-line pt-3">
                <button
                  type="button"
                  onClick={() => void runTest(service.id)}
                  disabled={test === "pending"}
                  className="rounded-lg border border-line px-3 py-1.5 text-xs font-medium transition-colors hover:border-accent disabled:opacity-50"
                >
                  {test === "pending" ? "Testing…" : "Test connection"}
                </button>
                {test && test !== "pending" && (
                  <div className="min-w-0 flex-1">
                    <p className={`text-xs ${test.ok ? "text-good-text" : "text-bad-text"}`}>
                      {test.ok ? "✓" : "✗"} {test.detail}
                    </p>
                    {test.hint && (
                      <p className="mt-1.5 rounded border border-warn/30 bg-warn-soft px-2.5 py-2 text-xs leading-relaxed text-warn-text">
                        {test.hint}
                      </p>
                    )}
                  </div>
                )}
              </div>
            </Card>
          );
        })}

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="submit"
            disabled={saving || !state.canWrite || Object.keys(drafts).length === 0}
            className={`${buttonClass.primary} ${sizeClass.md}`}
          >
            {saving ? "Saving…" : "Save credentials"}
          </button>
          <button
            type="button"
            onClick={() => void clearAll()}
            disabled={!state.canWrite}
            className={`${buttonClass.quiet} ${sizeClass.md}`}
          >
            Clear local store
          </button>
        </div>

        {message && (
          <p className={`text-sm ${message.tone === "good" ? "text-good-text" : "text-bad-text"}`}>{message.text}</p>
        )}
      </form>
    </>
  );
}

function SourceTag({ status }: { status: CredentialStatus }) {
  const label =
    status.source === "env" ? "environment" : status.source === "local" ? "local file" : "not set";
  const tone =
    status.source === "none" ? "border-line text-ink-2" : "border-good/30 bg-good-soft text-good-text";
  return (
    <span className={`rounded border px-2 py-0.5 text-[11px] font-medium uppercase tracking-wide ${tone}`}>
      {label}
    </span>
  );
}
