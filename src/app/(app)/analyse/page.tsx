"use client";

import { useState } from "react";
import { Report } from "@/components/report";
import { Card, buttonClass, sizeClass } from "@/components/primitives";
import type { AnalysisReport } from "@/lib/types";

type Mode = "url" | "content";

interface ApiFailure {
  ok: false;
  error: { message: string; hint: string | null };
}

const MIN_CONTENT = 200;

export default function AnalysePage() {
  const [mode, setMode] = useState<Mode>("url");
  const [url, setUrl] = useState("");
  const [content, setContent] = useState("");
  const [targetQuery, setTargetQuery] = useState("");
  const [audience, setAudience] = useState("");
  const [includeCompetitors, setIncludeCompetitors] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<{ message: string; hint: string | null } | null>(null);
  const [report, setReport] = useState<AnalysisReport | null>(null);

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setPending(true);
    setError(null);

    try {
      const res = await fetch("/api/analyse", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          mode,
          url: mode === "url" ? url : undefined,
          content: mode === "content" ? content : undefined,
          targetQuery: targetQuery.trim() || undefined,
          audience: audience.trim() || undefined,
          includeCompetitors,
        }),
      });

      const payload = (await res.json()) as { ok: true; report: AnalysisReport } | ApiFailure;
      if (!payload.ok) {
        setError(payload.error);
        setReport(null);
        return;
      }
      setReport(payload.report);
    } catch {
      setError({ message: "The request never reached the server.", hint: "Is the dev server still running?" });
      setReport(null);
    } finally {
      setPending(false);
    }
  }

  const canSubmit =
    mode === "url" ? url.trim().length > 0 : content.trim().length >= MIN_CONTENT;

  return (
    <main className="mx-auto w-full max-w-[90rem] px-6 py-10 sm:px-10">
      <header className="mb-8">
        <h1 className="text-3xl font-semibold tracking-tight text-ink">Analyse a page</h1>
        <p className="mt-2 max-w-2xl text-[15px] leading-relaxed text-ink-2">
          Give it a live URL or paste a draft. Adding the search term you want to win makes every
          judgment sharper, because half of them are about whether the page serves that specific
          intent.
        </p>
      </header>

      <form onSubmit={onSubmit} className="mb-8">
        <Card className="overflow-hidden">
          <div className="flex border-b border-line">
            {(
              [
                { value: "url", label: "Analyse a URL", hint: "A page that is already live" },
                { value: "content", label: "Check a draft", hint: "Before you publish" },
              ] as const
            ).map((tab) => (
              <button
                key={tab.value}
                type="button"
                onClick={() => setMode(tab.value)}
                aria-pressed={mode === tab.value}
                className={`flex-1 border-b-2 px-5 py-4 text-left transition-colors ${
                  mode === tab.value
                    ? "border-accent bg-surface"
                    : "border-transparent bg-surface-2 hover:bg-surface"
                }`}
              >
                <span
                  className={`block text-[15px] font-medium ${
                    mode === tab.value ? "text-ink" : "text-ink-2"
                  }`}
                >
                  {tab.label}
                </span>
                <span className="mt-0.5 block text-xs text-ink-3">{tab.hint}</span>
              </button>
            ))}
          </div>

          <div className="flex flex-col gap-5 p-6">
            {mode === "url" ? (
              <Field label="Page URL" htmlFor="url">
                <input
                  id="url"
                  type="url"
                  required
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  placeholder="https://example.co.uk/guide"
                  className={inputClass}
                />
              </Field>
            ) : (
              <Field
                label="Your draft"
                htmlFor="content"
                hint={`Markdown or plain text. At least ${MIN_CONTENT} characters — currently ${content.trim().length}.`}
              >
                <textarea
                  id="content"
                  required
                  rows={12}
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  placeholder={"# Your heading\n\nPaste the draft here…"}
                  className={`${inputClass} resize-y font-mono text-[13px] leading-relaxed`}
                />
              </Field>
            )}

            <div className="grid gap-5 sm:grid-cols-2">
              <Field
                label="Search term you want to win"
                htmlFor="query"
                optional
                hint="Unlocks intent, coverage and answer judgments."
              >
                <input
                  id="query"
                  type="text"
                  value={targetQuery}
                  onChange={(e) => setTargetQuery(e.target.value)}
                  placeholder="best crm for small charities"
                  className={inputClass}
                />
              </Field>
              <Field
                label="Who it is written for"
                htmlFor="audience"
                optional
                hint="Used to judge whether the reading level fits."
              >
                <input
                  id="audience"
                  type="text"
                  value={audience}
                  onChange={(e) => setAudience(e.target.value)}
                  placeholder="charity operations managers, non-technical"
                  className={inputClass}
                />
              </Field>
            </div>

            <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-line bg-surface-2 p-4">
              <input
                type="checkbox"
                checked={includeCompetitors}
                onChange={(e) => setIncludeCompetitors(e.target.checked)}
                className="mt-0.5 h-4 w-4 accent-[var(--accent)]"
              />
              <span>
                <span className="text-[15px] font-medium text-ink">
                  Compare against what currently ranks
                </span>
                <span className="mt-1 block text-sm leading-relaxed text-ink-2">
                  Pulls the live top ten for your search term and judges format, coverage and
                  differentiation against it. Needs a search term and DataForSEO credentials. About
                  $0.002, then cached free for 24 hours.
                </span>
              </span>
            </label>
          </div>

          <div className="flex flex-wrap items-center gap-4 border-t border-line bg-surface-2 px-6 py-4">
            <button
              type="submit"
              disabled={pending || !canSubmit}
              className={`${buttonClass.primary} ${sizeClass.md}`}
            >
              {pending ? "Analysing…" : "Analyse"}
            </button>
            <p className="text-sm text-ink-3">
              {pending
                ? "Reading the page, running the checks, asking Jev."
                : "Around two seconds. Costs about a hundredth of a penny."}
            </p>
          </div>
        </Card>

        {error && (
          <Card className="mt-4 border-bad/30 bg-bad-soft p-4">
            <p className="text-sm font-medium text-bad-text">{error.message}</p>
            {error.hint && <p className="mt-1 text-sm text-bad-text/90">{error.hint}</p>}
          </Card>
        )}
      </form>

      {pending && !report && <Pending />}
      {!pending && !report && !error && <EmptyState />}
      {report && <Report report={report} />}
    </main>
  );
}

function Pending() {
  return (
    <Card className="p-10">
      <div className="mx-auto max-w-md text-center">
        <div className="mx-auto h-1 w-40 overflow-hidden rounded-full bg-surface-3">
          <div className="h-full w-1/3 animate-pulse rounded-full bg-accent" />
        </div>
        <p className="mt-5 text-[15px] font-medium text-ink">Working through it</p>
        <p className="mt-2 text-sm leading-relaxed text-ink-2">
          Fetching the page, running twenty measured checks, then sending twenty-five questions to
          Jev in a single request.
        </p>
      </div>
    </Card>
  );
}

function EmptyState() {
  return (
    <Card className="border-dashed p-10">
      <div className="mx-auto max-w-lg text-center">
        <p className="text-[15px] font-medium text-ink">Nothing analysed yet</p>
        <p className="mt-2 text-sm leading-relaxed text-ink-2">
          You will get three scores — one each for Google, answer boxes and AI assistants — plus a
          ranked list of what to fix and the evidence behind every judgment.
        </p>
        <p className="mt-4 text-sm text-ink-3">
          No key configured yet? Add one on the{" "}
          <a href="/settings" className="text-accent underline underline-offset-2">
            settings page
          </a>
          .
        </p>
      </div>
    </Card>
  );
}

const inputClass =
  "w-full rounded-lg border border-line bg-surface px-4 py-3 text-[15px] text-ink outline-none transition-colors placeholder:text-ink-3/70 focus:border-accent";

function Field({
  label,
  htmlFor,
  hint,
  optional,
  children,
}: {
  label: string;
  htmlFor: string;
  hint?: string;
  optional?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={htmlFor} className="flex items-baseline gap-2 text-sm font-medium text-ink">
        {label}
        {optional && <span className="text-xs font-normal text-ink-3">optional</span>}
      </label>
      {children}
      {hint && <p className="text-xs leading-relaxed text-ink-3">{hint}</p>}
    </div>
  );
}
