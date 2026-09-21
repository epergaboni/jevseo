"use client";

import { useState } from "react";
import {
  BandChip,
  Card,
  DataRow,
  HeroFigure,
  Meter,
  SeverityTag,
  bandOf,
} from "@/components/primitives";
import { LOW_CONFIDENCE } from "@/lib/score/compose";
import { PILLAR_LABELS } from "@/lib/types";
import type { AnalysisReport, Fix, Pillar, PillarScore } from "@/lib/types";

const PILLAR_AUDIENCE: Record<Pillar, string> = {
  seo: "Google's ranked results",
  aeo: "Answer boxes and voice",
  geo: "ChatGPT and AI summaries",
};

export function Report({ report }: { report: AnalysisReport }) {
  return (
    <div className="flex flex-col gap-5">
      <Scorecard report={report} />
      {report.warnings.length > 0 && <Notices warnings={report.warnings} />}
      <Fixes report={report} />
      <Breakdown report={report} />
      {report.competitors.length > 0 && <Competitors report={report} />}
      <Provenance report={report} />
    </div>
  );
}

/* ------------------------------------------------------------- scorecard */

function Scorecard({ report }: { report: AnalysisReport }) {
  const band = bandOf(report.overall);
  const subject = report.facts.url ?? report.facts.title ?? "Untitled draft";

  return (
    <Card className="overflow-hidden">
      <div className="grid gap-px bg-line md:grid-cols-[1.1fr_2fr]">
        <div className="bg-surface p-6">
          <p className="text-xs font-medium uppercase tracking-[0.16em] text-ink-3">Overall</p>
          <div className="mt-3">
            <HeroFigure value={report.overall} band={band} />
          </div>
          <div className="mt-4">
            <BandChip band={band} />
          </div>
          <p className="mt-4 break-words text-sm text-ink-2" title={subject}>
            {report.facts.url ? (
              <a
                href={report.facts.url}
                target="_blank"
                rel="noreferrer noopener"
                className="underline decoration-line-strong underline-offset-2 hover:decoration-accent"
              >
                {trimUrl(report.facts.url)}
              </a>
            ) : (
              subject
            )}
          </p>
          {report.input.targetQuery && (
            <p className="mt-2 text-sm text-ink-3">
              Judged against “{report.input.targetQuery}”
              {report.intent && (
                <>
                  {" · "}
                  <span className="capitalize">{report.intent.choice}</span> intent
                  {report.intent.confidence < LOW_CONFIDENCE && " (mixed)"}
                </>
              )}
            </p>
          )}
        </div>

        <div className="grid gap-px bg-line sm:grid-cols-3">
          {report.pillars.map((pillar) => (
            <PillarTile key={pillar.pillar} pillar={pillar} />
          ))}
        </div>
      </div>
    </Card>
  );
}

function PillarTile({ pillar }: { pillar: PillarScore }) {
  const band = bandOf(pillar.score);
  return (
    <div className="bg-surface p-5">
      <div className="flex items-baseline justify-between gap-2">
        <span className="font-mono text-sm font-semibold tracking-wide text-ink">
          {PILLAR_LABELS[pillar.pillar]}
        </span>
        <span className="figure text-3xl font-semibold leading-none text-ink">{pillar.score}</span>
      </div>
      <div className="mt-3">
        <Meter
          value={pillar.score / 100}
          band={band}
          label={`${PILLAR_LABELS[pillar.pillar]} score`}
        />
      </div>
      <p className="mt-3 text-xs text-ink-3">{PILLAR_AUDIENCE[pillar.pillar]}</p>
      <p className="mt-1.5 text-xs font-medium text-ink-2">{bandWord(band)}</p>
    </div>
  );
}

function bandWord(band: ReturnType<typeof bandOf>): string {
  if (band === "strong") return "In good shape";
  if (band === "mixed") return "Room to improve";
  return "Needs attention";
}

/* ---------------------------------------------------------------- notices */

function Notices({ warnings }: { warnings: string[] }) {
  return (
    <Card className="border-warn/30 bg-warn-soft p-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-warn-text">
        Worth knowing
      </p>
      <ul className="mt-2 flex flex-col gap-1.5">
        {warnings.map((w) => (
          <li key={w} className="text-sm leading-relaxed text-warn-text">
            {w}
          </li>
        ))}
      </ul>
    </Card>
  );
}

/* ------------------------------------------------------------------ fixes */

function Fixes({ report }: { report: AnalysisReport }) {
  const [filter, setFilter] = useState<Pillar | "all">("all");
  const [showAll, setShowAll] = useState(false);

  const all = filter === "all" ? report.fixes : report.fixes.filter((f) => f.pillars.includes(filter));
  const shown = showAll ? all : all.slice(0, 6);
  const blocking = report.fixes.filter((f) => f.severity === "critical").length;

  return (
    <Card className="p-6">
      <div className="mb-5 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold tracking-tight">What to fix, in order</h2>
          <p className="mt-1.5 max-w-xl text-sm leading-relaxed text-ink-2">
            Ranked by how much score each one recovers. Work down the list.
            {blocking > 0 && (
              <span className="font-medium text-bad-text">
                {" "}
                Start with the {blocking === 1 ? "blocking issue" : `${blocking} blocking issues`} — nothing
                else counts until {blocking === 1 ? "it is" : "they are"} resolved.
              </span>
            )}
          </p>
        </div>
        <div
          className="flex gap-0.5 rounded-lg border border-line bg-surface-2 p-0.5"
          role="group"
          aria-label="Filter fixes by pillar"
        >
          {(["all", "seo", "aeo", "geo"] as const).map((key) => (
            <button
              key={key}
              type="button"
              aria-pressed={filter === key}
              onClick={() => {
                setFilter(key);
                setShowAll(false);
              }}
              className={`rounded px-2.5 py-1 text-xs font-medium uppercase tracking-wide transition-colors ${
                filter === key
                  ? "bg-surface text-ink shadow-sm"
                  : "text-ink-3 hover:text-ink"
              }`}
            >
              {key === "all" ? "All" : PILLAR_LABELS[key]}
            </button>
          ))}
        </div>
      </div>

      {all.length === 0 ? (
        <p className="rounded-lg border border-dashed border-line py-10 text-center text-sm text-ink-3">
          Nothing outstanding here. That is a good sign.
        </p>
      ) : (
        <>
          <ol className="flex flex-col gap-2.5">
            {shown.map((fix, index) => (
              <FixRow key={fix.id} fix={fix} index={index + 1} />
            ))}
          </ol>
          {all.length > shown.length && (
            <button
              type="button"
              onClick={() => setShowAll(true)}
              className="mt-4 w-full rounded-lg border border-line py-2.5 text-sm font-medium text-ink-2 transition-colors hover:border-line-strong hover:text-ink"
            >
              Show {all.length - shown.length} more
            </button>
          )}
        </>
      )}
    </Card>
  );
}

function FixRow({ fix, index }: { fix: Fix; index: number }) {
  const uncertain = fix.confidence !== null && fix.confidence < LOW_CONFIDENCE;
  return (
    <li className="rounded-lg border border-line p-4 transition-colors hover:border-line-strong">
      <div className="flex gap-4">
        <span className="tnum mt-0.5 w-5 shrink-0 text-sm font-medium text-ink-3">{index}</span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <SeverityTag severity={fix.severity} />
            <p className="font-medium text-ink">{fix.title}</p>
          </div>
          <p className="mt-2 text-sm leading-relaxed text-ink-2">{fix.detail}</p>
          <p className="mt-2 text-xs text-ink-3">{fix.evidence}</p>
          {uncertain && (
            <p className="mt-2 rounded border border-warn/30 bg-warn-soft px-2.5 py-1.5 text-xs text-warn-text">
              Jev was only {Math.round((fix.confidence ?? 0) * 100)}% sure here. Check this one
              yourself before acting on it.
            </p>
          )}
        </div>
        <div className="hidden shrink-0 gap-1 sm:flex">
          {fix.pillars.map((p) => (
            <span
              key={p}
              className="rounded border border-line px-1.5 py-0.5 text-[10px] font-medium uppercase text-ink-3"
            >
              {PILLAR_LABELS[p]}
            </span>
          ))}
        </div>
      </div>
    </li>
  );
}

/* -------------------------------------------------------------- breakdown */

function Breakdown({ report }: { report: AnalysisReport }) {
  const [open, setOpen] = useState<Pillar | null>(null);

  return (
    <Card className="p-6">
      <h2 className="text-xl font-semibold tracking-tight">Every judgment and check</h2>
      <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-ink-2">
        Nothing is hidden. Checks are measured in code; judgments are Jev reading the page against a
        written rubric, with its own certainty reported beside each one.
      </p>

      <div className="mt-5 flex flex-col gap-2">
        {report.pillars.map((pillar) => (
          <PillarPanel
            key={pillar.pillar}
            pillar={pillar}
            isOpen={open === pillar.pillar}
            onToggle={() => setOpen(open === pillar.pillar ? null : pillar.pillar)}
          />
        ))}
        <PageFactsPanel report={report} />
      </div>
    </Card>
  );
}

function PillarPanel({
  pillar,
  isOpen,
  onToggle,
}: {
  pillar: PillarScore;
  isOpen: boolean;
  onToggle: () => void;
}) {
  const band = bandOf(pillar.score);
  const failing = pillar.rules.filter((r) => !r.passed).length;

  return (
    <div className="rounded-lg border border-line">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={isOpen}
        className="flex w-full items-center gap-4 p-4 text-left"
      >
        <span className="font-mono text-sm font-semibold text-ink">
          {PILLAR_LABELS[pillar.pillar]}
        </span>
        <span className="figure text-lg font-semibold text-ink">{pillar.score}</span>
        <BandChip band={band} />
        <span className="ml-auto hidden text-xs text-ink-3 sm:inline">
          {pillar.judgments.length} judgments · {pillar.rules.length} checks
          {failing > 0 && ` · ${failing} failing`}
        </span>
        <span aria-hidden className={`text-ink-3 transition-transform ${isOpen ? "rotate-90" : ""}`}>
          ›
        </span>
      </button>

      {isOpen && (
        <div className="border-t border-line p-4">
          {pillar.judgments.length > 0 && (
            <>
              <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-ink-3">
                Judgments — Jev read the page
              </h3>
              <ul className="mb-6 flex flex-col gap-3.5">
                {pillar.judgments.map((j) => (
                  <li key={j.id}>
                    <div className="flex items-baseline justify-between gap-4">
                      <span className="text-sm font-medium text-ink">{j.label}</span>
                      <span className="tnum shrink-0 text-xs text-ink-3">
                        {Math.round(j.value * 100)}
                        {j.confidence !== null && (
                          <span
                            className={
                              j.confidence < LOW_CONFIDENCE ? "text-warn-text" : undefined
                            }
                          >
                            {" · "}
                            {Math.round(j.confidence * 100)}% sure
                          </span>
                        )}
                      </span>
                    </div>
                    <div className="mt-1.5">
                      <Meter value={j.value} label={j.label} />
                    </div>
                    {j.verdict && (
                      <p className="mt-1.5 text-xs leading-relaxed text-ink-3">“{j.verdict}”</p>
                    )}
                  </li>
                ))}
              </ul>
            </>
          )}

          {pillar.rules.length > 0 && (
            <>
              <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-ink-3">
                Checks — measured, not judged
              </h3>
              <ul className="flex flex-col">
                {pillar.rules.map((r) => (
                  <li
                    key={r.id}
                    className="flex items-baseline justify-between gap-4 border-b border-line py-2 last:border-0"
                  >
                    <span className="flex items-baseline gap-2 text-sm">
                      <span
                        aria-hidden
                        className={`text-xs ${r.passed ? "text-good-text" : "text-bad-text"}`}
                      >
                        {r.passed ? "✓" : "✕"}
                      </span>
                      <span className={r.passed ? "text-ink-2" : "text-ink"}>{r.label}</span>
                      <span className="sr-only">{r.passed ? "passed" : "failed"}</span>
                    </span>
                    <span className="text-right text-xs text-ink-3">{r.observed}</span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      )}
    </div>
  );
}

function PageFactsPanel({ report }: { report: AnalysisReport }) {
  const [isOpen, setOpen] = useState(false);
  const f = report.facts;

  return (
    <div className="rounded-lg border border-line">
      <button
        type="button"
        onClick={() => setOpen(!isOpen)}
        aria-expanded={isOpen}
        className="flex w-full items-center gap-4 p-4 text-left"
      >
        <span className="text-sm font-semibold text-ink">What was read</span>
        <span className="ml-auto hidden text-xs text-ink-3 sm:inline">
          {f.wordCount.toLocaleString("en-GB")} words
        </span>
        <span aria-hidden className={`text-ink-3 transition-transform ${isOpen ? "rotate-90" : ""}`}>
          ›
        </span>
      </button>
      {isOpen && (
        <div className="border-t border-line p-4">
          <DataRow label="Words" value={f.wordCount.toLocaleString("en-GB")} />
          <DataRow label="Headings" value={f.headings.length} />
          <DataRow label="Lists / tables" value={`${f.listCount} / ${f.tableCount}`} />
          {report.input.mode === "url" && (
            <>
              <DataRow
                label="Links in the content"
                hint="Navigation and footers are excluded"
                value={`${f.internalLinks} internal · ${f.externalLinks} external`}
              />
              <DataRow
                label="Images without alt text"
                value={`${f.imagesMissingAlt} of ${f.imageCount}`}
              />
              <DataRow
                label="Structured data"
                value={f.schemaTypes.length ? f.schemaTypes.join(", ") : "None found"}
              />
              <DataRow
                label="Server response"
                value={f.responseMs !== null ? `${f.responseMs} ms` : "—"}
              />
            </>
          )}
          <DataRow label="Title" value={f.title ?? "None"} />
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------ competitors */

function Competitors({ report }: { report: AnalysisReport }) {
  return (
    <Card className="p-6">
      <h2 className="text-xl font-semibold tracking-tight">
        What currently ranks for “{report.input.targetQuery}”
      </h2>
      <p className="mt-1.5 text-sm text-ink-2">
        {report.competitorSource === "cache"
          ? "Recently cached results. This lookup cost nothing."
          : `Live results from DataForSEO, $${report.competitorCost.toFixed(4)}.`}
      </p>
      <ol className="mt-5 flex flex-col">
        {report.competitors.map((c) => (
          <li
            key={`${c.rank}-${c.url}`}
            className="flex gap-4 border-b border-line py-3 last:border-0"
          >
            <span className="tnum w-6 shrink-0 text-sm font-medium text-ink-3">{c.rank}</span>
            <div className="min-w-0">
              <a
                href={c.url}
                target="_blank"
                rel="noreferrer noopener"
                className="text-sm font-medium text-ink underline decoration-line-strong underline-offset-2 hover:decoration-accent"
              >
                {c.title || c.url}
              </a>
              <p className="truncate text-xs text-ink-3">{trimUrl(c.url)}</p>
            </div>
          </li>
        ))}
      </ol>
    </Card>
  );
}

/* ------------------------------------------------------------- provenance */

function Provenance({ report }: { report: AnalysisReport }) {
  const spend =
    report.competitorSource === "cache"
      ? "SERP from cache, nothing spent"
      : report.competitorSource === "dataforseo"
        ? `SERP $${report.competitorCost.toFixed(4)}`
        : null;

  return (
    <p className="pb-2 text-center text-xs text-ink-3">
      {report.model} · {report.usage.input_tokens.toLocaleString("en-GB")} input tokens ·{" "}
      {(report.elapsedMs / 1000).toFixed(1)}s{spend && ` · ${spend}`}
    </p>
  );
}

function trimUrl(url: string): string {
  return url.replace(/^https?:\/\//, "").replace(/\/$/, "");
}
