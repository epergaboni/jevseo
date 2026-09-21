"use client";

import { apiFetch } from "@/lib/client/credential-store";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import {
  BandChip,
  Card,
  Meter,
  bandOf,
  buttonClass,
  sizeClass,
} from "@/components/primitives";
import { ACTION_BLURB, ACTION_LABEL, type PageAction } from "@/lib/judge/actions";
import type { Crawl, PlanItem } from "@/lib/db/schema";
import type { PageRow } from "@/lib/db/queries";

type Tab = "plan" | "pages" | "overlap";

interface CannibalRow {
  id: string;
  overlap: number;
  recommendation: string | null;
  pageA: { id: string; url: string; title: string | null } | null;
  pageB: { id: string; url: string; title: string | null } | null;
}

interface Summary {
  pages: number;
  analysed: number;
  avgOverall: number | null;
  avgSeo: number | null;
  avgAeo: number | null;
  avgGeo: number | null;
}

const RUNNING = ["queued", "crawling", "analysing", "deciding"];

const STAGE_COPY: Record<string, string> = {
  queued: "Queued",
  crawling: "Reading the site",
  analysing: "Scoring each page",
  deciding: "Jev deciding what to do",
  complete: "Complete",
  failed: "Failed",
  cancelled: "Cancelled",
};

export function ProjectWorkspace({
  projectId,
  initialCrawl,
  initialPages,
  summary,
  plan,
  cannibals,
}: {
  projectId: string;
  initialCrawl: Crawl | null;
  initialPages: PageRow[];
  summary: Summary;
  plan: PlanItem[];
  cannibals: CannibalRow[];
}) {
  const router = useRouter();
  const [crawl, setCrawl] = useState(initialCrawl);
  const [maxPages, setMaxPages] = useState(25);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("plan");

  const isRunning = crawl !== null && RUNNING.includes(crawl.status);

  // Poll only while a crawl is live. The run outlives the request that started
  // it, so the crawl row is the only reliable source of progress.
  useEffect(() => {
    if (!isRunning || !crawl) return;
    let cancelled = false;

    const tick = async () => {
      try {
        const res = await apiFetch(`/api/crawls/${crawl.id}`, { cache: "no-store" });
        const payload = (await res.json()) as { ok: boolean; crawl: Crawl; terminal: boolean };
        if (cancelled || !payload.ok) return;
        setCrawl(payload.crawl);
        if (payload.terminal) router.refresh();
      } catch {
        // A dropped poll is not worth surfacing; the next one will land.
      }
    };

    const timer = setInterval(() => void tick(), 1500);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [isRunning, crawl, router]);

  async function startCrawl() {
    setStarting(true);
    setError(null);
    try {
      const res = await apiFetch(`/api/projects/${projectId}/crawl`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ maxPages }),
      });
      const payload = (await res.json()) as
        | { ok: true; crawlId: string }
        | { ok: false; error: string; hint?: string };
      if (!payload.ok) {
        setError(payload.hint ? `${payload.error} ${payload.hint}` : payload.error);
        return;
      }
      setCrawl({
        id: payload.crawlId,
        projectId,
        status: "queued",
        maxPages,
        pagesFound: 0,
        pagesAnalysed: 0,
        inputTokens: 0,
        serpCostUsd: 0,
        error: null,
        startedAt: new Date(),
        finishedAt: null,
      });
    } catch {
      setError("The request never reached the server.");
    } finally {
      setStarting(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <Card className="p-6">
        <div className="flex flex-wrap items-end justify-between gap-6">
          <div className="flex flex-wrap items-end gap-8">
            <Stat label="Pages" value={summary.pages} />
            <Stat label="Scored" value={summary.analysed} />
            <Stat label="Average" value={summary.avgOverall ?? "—"} band />
            <Stat label="SEO" value={summary.avgSeo ?? "—"} muted />
            <Stat label="AEO" value={summary.avgAeo ?? "—"} muted />
            <Stat label="GEO" value={summary.avgGeo ?? "—"} muted />
          </div>

          {!isRunning && (
            <div className="flex flex-wrap items-end gap-3">
              <div className="flex flex-col gap-1.5">
                <label htmlFor="maxpages" className="text-xs font-medium text-ink-2">
                  Pages to crawl
                </label>
                <select
                  id="maxpages"
                  value={maxPages}
                  onChange={(e) => setMaxPages(Number(e.target.value))}
                  className="rounded-lg border border-line bg-surface px-4 py-2.5 text-sm text-ink outline-none focus:border-accent"
                >
                  {[10, 25, 50, 100, 200].map((n) => (
                    <option key={n} value={n}>
                      {n} pages
                    </option>
                  ))}
                </select>
              </div>
              <button
                type="button"
                onClick={() => void startCrawl()}
                disabled={starting}
                className={`${buttonClass.primary} ${sizeClass.md}`}
              >
                {starting ? "Starting…" : crawl ? "Crawl again" : "Start crawl"}
              </button>
            </div>
          )}
        </div>

        {isRunning && crawl && <Progress crawl={crawl} />}

        {crawl?.status === "failed" && (
          <p className="mt-4 rounded-lg border border-bad/30 bg-bad-soft px-4 py-3 text-sm text-bad-text">
            Crawl failed: {crawl.error ?? "unknown error"}
          </p>
        )}

        {crawl?.status === "complete" && crawl.error && (
          <p className="mt-4 rounded-lg border border-warn/30 bg-warn-soft px-4 py-3 text-sm leading-relaxed text-warn-text">
            {crawl.error}
          </p>
        )}

        {error && (
          <p className="mt-4 rounded-lg border border-bad/30 bg-bad-soft px-4 py-3 text-sm text-bad-text">
            {error}
          </p>
        )}

        {crawl?.status === "complete" && (
          <p className="mt-4 text-xs text-ink-3">
            Last crawl read {crawl.pagesFound} pages, scored {crawl.pagesAnalysed}, and used{" "}
            {crawl.inputTokens.toLocaleString("en-GB")} input tokens — about $
            {((crawl.inputTokens / 1_000_000) * 0.042).toFixed(4)}.
          </p>
        )}
      </Card>

      {summary.analysed > 0 && (
        <>
          <div className="flex gap-0.5 self-start rounded-lg border border-line bg-surface-2 p-0.5">
            {(
              [
                ["plan", `Plan (${plan.filter((p) => p.status === "todo").length})`],
                ["pages", `Pages (${initialPages.length})`],
                ["overlap", `Overlaps (${cannibals.length})`],
              ] as const
            ).map(([key, label]) => (
              <button
                key={key}
                type="button"
                aria-pressed={tab === key}
                onClick={() => setTab(key)}
                className={`rounded px-4 py-2 text-sm font-medium transition-colors ${
                  tab === key ? "bg-surface text-ink shadow-sm" : "text-ink-3 hover:text-ink"
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          {tab === "plan" && <Plan items={plan} />}
          {tab === "pages" && <Pages rows={initialPages} />}
          {tab === "overlap" && <Overlaps rows={cannibals} />}
        </>
      )}
    </div>
  );
}

function Stat({
  label,
  value,
  band,
  muted,
}: {
  label: string;
  value: number | string;
  band?: boolean;
  muted?: boolean;
}) {
  const numeric = typeof value === "number";
  return (
    <div>
      <p className="text-xs font-medium uppercase tracking-wide text-ink-3">{label}</p>
      <p
        className={`figure mt-1 font-semibold leading-none ${muted ? "text-2xl text-ink-2" : "text-3xl text-ink"}`}
      >
        {value}
      </p>
      {band && numeric && (
        <div className="mt-2">
          <BandChip band={bandOf(value)} />
        </div>
      )}
    </div>
  );
}

function Progress({ crawl }: { crawl: Crawl }) {
  const total = crawl.maxPages;
  const done = crawl.status === "crawling" ? crawl.pagesFound : crawl.pagesAnalysed;
  const value = total > 0 ? Math.min(1, done / total) : 0;

  return (
    <div className="mt-6">
      <div className="mb-2 flex items-baseline justify-between text-sm">
        <span className="font-medium text-ink">{STAGE_COPY[crawl.status] ?? crawl.status}</span>
        <span className="tnum text-ink-3">
          {crawl.pagesFound} found · {crawl.pagesAnalysed} scored
        </span>
      </div>
      <Meter value={value} height="h-2" label="Crawl progress" />
      <p className="mt-2 text-xs text-ink-3">
        This keeps running if you navigate away. Come back and it will be here.
      </p>
    </div>
  );
}

/* ------------------------------------------------------------------- plan */

function Plan({ items }: { items: PlanItem[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const open = items.filter((i) => i.status === "todo");
  const closed = items.filter((i) => i.status !== "todo");

  async function setStatus(id: string, status: "done" | "dismissed" | "todo") {
    setBusy(id);
    try {
      await apiFetch(`/api/plan/${id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ status }),
      });
      router.refresh();
    } finally {
      setBusy(null);
    }
  }

  if (items.length === 0) {
    return (
      <Card className="border-dashed p-10 text-center">
        <p className="text-sm text-ink-2">No plan yet. Run a crawl to build one.</p>
      </Card>
    );
  }

  return (
    <Card className="p-6">
      <h2 className="text-xl font-semibold tracking-tight text-ink">The plan</h2>
      <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-ink-2">
        Ordered by what Jev judged most worth doing: opportunity first, effort as a tie-break, with
        blocking problems pushed to the top. Work down it.
      </p>

      <ol className="mt-5 flex flex-col gap-2.5">
        {open.map((item, index) => (
          <PlanRow
            key={item.id}
            item={item}
            index={index + 1}
            busy={busy === item.id}
            onStatus={setStatus}
          />
        ))}
      </ol>

      {closed.length > 0 && (
        <details className="mt-5">
          <summary className="cursor-pointer text-sm text-ink-3 hover:text-ink">
            {closed.length} done or dismissed
          </summary>
          <ol className="mt-3 flex flex-col gap-2">
            {closed.map((item) => (
              <li
                key={item.id}
                className="flex items-center justify-between gap-4 rounded-lg border border-line px-4 py-2.5 text-sm text-ink-3"
              >
                <span className="line-through">{item.title}</span>
                <button
                  type="button"
                  onClick={() => void setStatus(item.id, "todo")}
                  className="shrink-0 text-xs text-accent hover:underline"
                >
                  Reopen
                </button>
              </li>
            ))}
          </ol>
        </details>
      )}
    </Card>
  );
}

const KIND_LABEL: Record<string, string> = {
  page_action: "Page decision",
  page_fix: "Fix",
  new_content: "New content",
  consolidation: "Consolidation",
};

function PlanRow({
  item,
  index,
  busy,
  onStatus,
}: {
  item: PlanItem;
  index: number;
  busy: boolean;
  onStatus: (id: string, status: "done" | "dismissed" | "todo") => void;
}) {
  return (
    <li className="rounded-lg border border-line p-4 transition-colors hover:border-line-strong">
      <div className="flex gap-4">
        <span className="tnum mt-0.5 w-5 shrink-0 text-sm font-medium text-ink-3">{index}</span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded bg-accent-soft px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-accent">
              {KIND_LABEL[item.kind] ?? item.kind}
            </span>
            <p className="font-medium text-ink">{item.title}</p>
          </div>
          <p className="mt-2 text-sm leading-relaxed text-ink-2">{item.detail}</p>
          {item.evidence && <p className="mt-2 text-xs text-ink-3">{item.evidence}</p>}
          <div className="mt-3 flex flex-wrap items-center gap-4 text-xs text-ink-3">
            <span className="tnum">Impact {item.impact}</span>
            <span className="tnum">Effort {item.effort}</span>
            {item.confidence !== null && (
              <span className={`tnum ${item.confidence < 55 ? "text-warn-text" : ""}`}>
                {item.confidence}% sure
              </span>
            )}
          </div>
        </div>
        <div className="flex shrink-0 flex-col gap-1.5">
          <button
            type="button"
            disabled={busy}
            onClick={() => onStatus(item.id, "done")}
            className={`${buttonClass.secondary} ${sizeClass.sm}`}
          >
            Done
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => onStatus(item.id, "dismissed")}
            className={`${buttonClass.quiet} ${sizeClass.sm}`}
          >
            Skip
          </button>
        </div>
      </div>
    </li>
  );
}

/* ------------------------------------------------------------------ pages */

const ACTION_STYLE: Record<string, string> = {
  leave: "bg-good-soft text-good-text",
  improve: "bg-accent-soft text-accent",
  rewrite: "bg-warn-soft text-warn-text",
  merge: "bg-warn-soft text-warn-text",
  split: "bg-warn-soft text-warn-text",
  prune: "bg-bad-soft text-bad-text",
};

function Pages({ rows }: { rows: PageRow[] }) {
  const [sort, setSort] = useState<"opportunity" | "score" | "url">("opportunity");

  const sorted = [...rows].sort((a, b) => {
    if (sort === "url") return a.url.localeCompare(b.url);
    if (sort === "score") return (a.overall ?? 999) - (b.overall ?? 999);
    return (b.opportunity ?? -1) - (a.opportunity ?? -1);
  });

  return (
    <Card className="p-6">
      <div className="mb-5 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold tracking-tight text-ink">Every page</h2>
          <p className="mt-1.5 text-sm text-ink-2">
            Jev picked one action per page. The percentage is how sure it was.
          </p>
        </div>
        <label className="flex items-center gap-2 text-sm text-ink-2">
          Sort
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value as typeof sort)}
            className="rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink outline-none focus:border-accent"
          >
            <option value="opportunity">Opportunity</option>
            <option value="score">Lowest score</option>
            <option value="url">URL</option>
          </select>
        </label>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-line text-left text-xs uppercase tracking-wide text-ink-3">
              <th className="pb-2.5 pr-4 font-medium">Page</th>
              <th className="pb-2.5 pr-4 font-medium">Decision</th>
              <th className="pb-2.5 pr-4 text-right font-medium">Score</th>
              <th className="pb-2.5 pr-4 text-right font-medium">Opp.</th>
              <th className="pb-2.5 text-right font-medium">Effort</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((row) => (
              <tr key={row.id} className="border-b border-line last:border-0">
                <td className="max-w-md py-3 pr-4">
                  <a
                    href={row.url}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="block truncate font-medium text-ink underline decoration-line-strong underline-offset-2 hover:decoration-accent"
                    title={row.title ?? row.url}
                  >
                    {row.title ?? row.url}
                  </a>
                  <span className="block truncate text-xs text-ink-3">
                    {row.url.replace(/^https?:\/\/[^/]+/, "") || "/"}
                  </span>
                  {row.fetchError && (
                    <span className="mt-1 block text-xs text-bad-text">{row.fetchError}</span>
                  )}
                </td>
                <td className="py-3 pr-4">
                  {row.action ? (
                    <>
                      <span
                        className={`inline-block rounded px-2 py-0.5 text-xs font-medium ${ACTION_STYLE[row.action] ?? "bg-surface-2 text-ink-2"}`}
                      >
                        {ACTION_LABEL[row.action as PageAction] ?? row.action}
                      </span>
                      <span
                        className={`tnum ml-2 text-xs ${
                          (row.actionConfidence ?? 100) < 55 ? "text-warn-text" : "text-ink-3"
                        }`}
                      >
                        {row.actionConfidence}%
                      </span>
                      <span className="mt-1 block text-xs text-ink-3">
                        {ACTION_BLURB[row.action as PageAction]}
                      </span>
                    </>
                  ) : (
                    <span className="text-xs text-ink-3">not scored</span>
                  )}
                </td>
                <td className="tnum py-3 pr-4 text-right font-medium text-ink">
                  {row.overall ?? "—"}
                </td>
                <td className="tnum py-3 pr-4 text-right text-ink-2">{row.opportunity ?? "—"}</td>
                <td className="tnum py-3 text-right text-ink-2">{row.effort ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

/* --------------------------------------------------------------- overlaps */

function Overlaps({ rows }: { rows: CannibalRow[] }) {
  if (rows.length === 0) {
    return (
      <Card className="border-dashed p-10 text-center">
        <p className="text-sm text-ink-2">
          No two pages look like they are competing for the same search. That is a good sign.
        </p>
      </Card>
    );
  }

  return (
    <Card className="p-6">
      <h2 className="text-xl font-semibold tracking-tight text-ink">Pages competing with each other</h2>
      <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-ink-2">
        When two of your own pages target the same intent, they split the authority that should
        belong to one. Jev judged each pair; only likely overlaps are shown.
      </p>
      <ul className="mt-5 flex flex-col gap-3">
        {rows.map((row) => (
          <li key={row.id} className="rounded-lg border border-line p-4">
            <div className="flex items-center gap-3">
              <span className="tnum rounded bg-warn-soft px-2 py-0.5 text-xs font-semibold text-warn-text">
                {row.overlap}% overlap
              </span>
            </div>
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              {[row.pageA, row.pageB].map((page, i) => (
                <div key={i} className="min-w-0 rounded border border-line bg-surface-2 p-3">
                  <p className="truncate text-sm font-medium text-ink">
                    {page?.title ?? page?.url ?? "Unknown page"}
                  </p>
                  <p className="truncate text-xs text-ink-3">{page?.url}</p>
                </div>
              ))}
            </div>
            {row.recommendation && (
              <p className="mt-3 text-sm leading-relaxed text-ink-2">{row.recommendation}</p>
            )}
          </li>
        ))}
      </ul>
    </Card>
  );
}
