"use client";

import { useState, useSyncExternalStore } from "react";
import { Card, buttonClass, sizeClass } from "@/components/primitives";
import {
  apiFetch,
  clearLocalCredentials,
  getCredentialServerSnapshot,
  getCredentialSnapshot,
  maskCredential,
  subscribeToCredentials,
  writeLocalCredential,
} from "@/lib/client/credential-store";
import { CREDENTIAL_KEYS, type CredentialKey, type CredentialMeta, type CredentialStatus } from "@/lib/config/credential-schema";

export interface SettingsState {
  statuses: CredentialStatus[];
  meta: Record<CredentialKey, CredentialMeta>;
  canWrite: boolean;
  storeFile: string;
}

type TestResult = { ok: boolean; detail: string; hint?: string };

const FIELD =
  "w-full rounded-lg border border-line bg-surface px-4 py-3 text-[15px] text-ink outline-none transition-colors placeholder:text-ink-3/70 focus:border-accent";

const SERVICES = [
  {
    id: "typesafe" as const,
    name: "TypeSafe",
    required: true,
    blurb:
      "Required. Every semantic judgment on every page is answered by Jev. Without a key, nothing runs.",
    href: "https://console.typesafe.ai",
    hrefLabel: "console.typesafe.ai",
    cost: "Charged on input tokens only, at $0.042 per million. A page costs roughly 4,000 tokens — about a hundredth of a penny.",
  },
  {
    id: "dataforseo" as const,
    name: "DataForSEO",
    required: false,
    blurb:
      "Optional. Fetches the live top ten for your target query so Jev can judge format, coverage and differentiation against what actually ranks. Everything else works without it.",
    href: "https://app.dataforseo.com/api-access",
    hrefLabel: "app.dataforseo.com/api-access",
    cost: "About $0.002 per lookup, then cached for 24 hours so re-running costs nothing. Testing the connection here is free.",
  },
];

export function SettingsForm({ initial }: { initial: SettingsState }) {
  const [serverStatuses] = useState(initial.statuses);
  const local = useSyncExternalStore(
    subscribeToCredentials,
    getCredentialSnapshot,
    getCredentialServerSnapshot,
  );
  const [drafts, setDrafts] = useState<Partial<Record<CredentialKey, string>>>({});
  const [reveal, setReveal] = useState<Partial<Record<CredentialKey, boolean>>>({});
  const [message, setMessage] = useState<{ tone: "good" | "bad"; text: string } | null>(null);
  const [tests, setTests] = useState<Partial<Record<string, TestResult | "pending">>>({});

  function save(event: React.FormEvent) {
    event.preventDefault();
    for (const [key, value] of Object.entries(drafts)) {
      writeLocalCredential(key as CredentialKey, value);
    }
    setDrafts({});
    setTests({});
    setMessage({
      tone: "good",
      text: "Saved in this browser. Nothing was sent to the server.",
    });
  }

  function clearAll() {
    if (!confirm("Remove every key from this browser?")) return;
    clearLocalCredentials();
    setDrafts({});
    setTests({});
    setMessage({ tone: "good", text: "Cleared from this browser." });
  }

  async function runTest(service: "typesafe" | "dataforseo") {
    setTests((t) => ({ ...t, [service]: "pending" }));
    try {
      const res = await apiFetch("/api/settings/test", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ service }),
      });
      const result = (await res.json()) as TestResult;
      setTests((t) => ({ ...t, [service]: result }));
    } catch {
      setTests((t) => ({
        ...t,
        [service]: { ok: false, detail: "The request never reached the server." },
      }));
    }
  }

  const serverStatus = (key: CredentialKey) => serverStatuses.find((s) => s.key === key);

  return (
    <>
      <Card className="mb-6 border-accent-line bg-accent-soft p-5">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-accent">
          Where your key is kept
        </h2>
        <p className="mt-2 text-[15px] leading-relaxed text-ink-2">
          Whatever you enter here is stored in <strong className="font-medium text-ink">your
          own browser</strong> and attached to each request as a header. This server holds it for
          the length of one request, never writes it to disk, never puts it in a database and
          never logs it.
        </p>
        <p className="mt-2 text-[15px] leading-relaxed text-ink-2">
          Being straight with you about the limits: the key does travel to this server, because
          that is how it reaches TypeSafe. Anything in browser storage can also be read by script
          running on this page. If neither is acceptable,{" "}
          <a
            href="https://github.com/epergaboni/jevseo"
            target="_blank"
            rel="noreferrer noopener"
            className="font-medium text-accent underline underline-offset-2"
          >
            run it locally
          </a>{" "}
          — that is what it was built for.
        </p>
      </Card>

      <form onSubmit={save} className="flex flex-col gap-5">
        {SERVICES.map((service) => {
          const keys = CREDENTIAL_KEYS.filter((k) => initial.meta[k].service === service.id);
          const test = tests[service.id];

          return (
            <Card key={service.id} className="p-6">
              <div className="mb-1 flex flex-wrap items-baseline justify-between gap-3">
                <h2 className="flex items-baseline gap-2.5 text-base font-semibold text-ink">
                  {service.name}
                  <span
                    className={`rounded px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide ${
                      service.required
                        ? "bg-good-soft text-good-text"
                        : "bg-surface-2 text-ink-3"
                    }`}
                  >
                    {service.required ? "Required" : "Optional"}
                  </span>
                </h2>
                <a
                  href={service.href}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="text-xs text-accent underline underline-offset-2"
                >
                  {service.hrefLabel}
                </a>
              </div>
              <p className="text-sm leading-relaxed text-ink-2">{service.blurb}</p>
              <p className="mt-1.5 text-xs leading-relaxed text-ink-3">{service.cost}</p>

              <div className="mt-5 flex flex-col gap-4">
                {keys.map((key) => {
                  const meta = initial.meta[key];
                  const stored = local[key];
                  const server = serverStatus(key);
                  const shown = reveal[key] === true;

                  return (
                    <div key={key} className="flex flex-col gap-1.5">
                      <div className="flex flex-wrap items-baseline justify-between gap-2">
                        <label htmlFor={key} className="text-sm font-medium text-ink">
                          {meta.label}
                          {meta.required && <span className="ml-1 text-bad-text">*</span>}
                        </label>
                        {(
                          <span
                            className={`rounded border px-2 py-0.5 text-[11px] font-medium uppercase tracking-wide ${
                              stored
                                ? "border-good/30 bg-good-soft text-good-text"
                                : server?.configured
                                  ? "border-line bg-surface-2 text-ink-3"
                                  : "border-line text-ink-3"
                            }`}
                          >
                            {stored
                              ? "in this browser"
                              : server?.configured
                                ? "provided by host"
                                : "not set"}
                          </span>
                        )}
                      </div>

                      <div className="flex gap-2">
                        <input
                          id={key}
                          type={meta.secret && !shown ? "password" : "text"}
                          autoComplete="off"
                          spellCheck={false}
                          value={drafts[key] ?? ""}
                          onChange={(e) => setDrafts((d) => ({ ...d, [key]: e.target.value }))}
                          placeholder={
                            stored
                              ? `${meta.secret ? maskCredential(stored) : stored} — type to replace`
                              : server?.configured
                                ? "This host supplies one; enter your own to use it instead"
                                : "Not set"
                          }
                          className={FIELD}
                        />
                        {meta.secret && (
                          <button
                            type="button"
                            onClick={() => setReveal((r) => ({ ...r, [key]: !shown }))}
                            className="shrink-0 rounded-lg border border-line px-3.5 text-xs text-ink-2 transition-colors hover:border-line-strong hover:text-ink"
                          >
                            {shown ? "Hide" : "Show"}
                          </button>
                        )}
                      </div>
                      <p className="text-xs leading-relaxed text-ink-3">{meta.help}</p>
                    </div>
                  );
                })}
              </div>

              <div className="mt-5 flex flex-wrap items-start gap-3 border-t border-line pt-4">
                <button
                  type="button"
                  onClick={() => void runTest(service.id)}
                  disabled={test === "pending"}
                  className={`${buttonClass.secondary} ${sizeClass.sm}`}
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
            disabled={Object.keys(drafts).length === 0}
            className={`${buttonClass.primary} ${sizeClass.md}`}
          >
            Save in this browser
          </button>
          <button
            type="button"
            onClick={clearAll}
            className={`${buttonClass.quiet} ${sizeClass.md}`}
          >
            Clear
          </button>
        </div>

        {message && (
          <p className={`text-sm ${message.tone === "good" ? "text-good-text" : "text-bad-text"}`}>
            {message.text}
          </p>
        )}
      </form>
    </>
  );
}
