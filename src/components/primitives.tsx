import type { ReactNode } from "react";
import type { Severity } from "@/lib/types";

/* ------------------------------------------------------------------ bands */

export type Band = "strong" | "mixed" | "weak";

/**
 * Status colour is never the only channel. Every band ships a word, so the
 * verdict survives colour blindness, greyscale printing and a screenshot.
 */
export function bandOf(score: number): Band {
  if (score >= 75) return "strong";
  if (score >= 50) return "mixed";
  return "weak";
}

export const BAND_LABEL: Record<Band, string> = {
  strong: "Strong",
  mixed: "Needs work",
  weak: "Weak",
};

const BAND_TEXT: Record<Band, string> = {
  strong: "text-good-text",
  mixed: "text-warn-text",
  weak: "text-bad-text",
};

const BAND_MARK: Record<Band, string> = {
  strong: "bg-good",
  mixed: "bg-warn",
  weak: "bg-bad",
};

const BAND_CHIP: Record<Band, string> = {
  strong: "bg-good-soft text-good-text",
  mixed: "bg-warn-soft text-warn-text",
  weak: "bg-bad-soft text-bad-text",
};

/* ------------------------------------------------------------- containers */

export function Card({
  children,
  className = "",
  as: Tag = "section",
}: {
  children: ReactNode;
  className?: string;
  as?: "section" | "div" | "li" | "article";
}) {
  return (
    <Tag className={`rounded-xl border border-line bg-surface ${className}`}>{children}</Tag>
  );
}

export function SectionHeading({
  overline,
  title,
  lead,
  className = "",
}: {
  overline?: string;
  title: string;
  lead?: string;
  className?: string;
}) {
  return (
    <div className={className}>
      {overline && (
        <p className="mb-3 text-[13px] font-medium uppercase tracking-[0.18em] text-accent">
          {overline}
        </p>
      )}
      <h2 className="text-3xl font-semibold leading-[1.15] tracking-tight text-ink sm:text-[2.5rem]">
        {title}
      </h2>
      {lead && <p className="mt-4 max-w-2xl text-lg leading-relaxed text-ink-2">{lead}</p>}
    </div>
  );
}

/* ------------------------------------------------------------------ marks */

/**
 * A meter. The fill length carries the value; a single ink fill is used for
 * ordinary magnitude so a long list does not become a row of traffic lights.
 * Pass a band only where the state itself is the message.
 */
export function Meter({
  value,
  band,
  height = "h-1.5",
  label,
}: {
  value: number;
  band?: Band;
  height?: string;
  label?: string;
}) {
  const pct = Math.round(Math.min(1, Math.max(0, value)) * 100);
  return (
    <div
      className={`${height} w-full overflow-hidden rounded-full bg-surface-3`}
      role="meter"
      aria-valuenow={pct}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={label}
    >
      <div
        className={`h-full rounded-full ${band ? BAND_MARK[band] : "bg-accent"}`}
        style={{ width: `${Math.max(pct, value > 0 ? 2 : 0)}%` }}
      />
    </div>
  );
}

/** The one number a view leads with. Exactly one per page. */
export function HeroFigure({ value, band }: { value: number; band: Band }) {
  return (
    <div className="flex items-end gap-3">
      <span className={`figure text-[4.5rem] font-semibold leading-[0.85] ${BAND_TEXT[band]}`}>
        {value}
      </span>
      <span className="pb-1.5 text-base text-ink-3">/ 100</span>
    </div>
  );
}

export function BandChip({ band, className = "" }: { band: Band; className?: string }) {
  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${BAND_CHIP[band]} ${className}`}
    >
      <span aria-hidden className={`h-1.5 w-1.5 rounded-full ${BAND_MARK[band]}`} />
      {BAND_LABEL[band]}
    </span>
  );
}

const SEVERITY_STYLE: Record<Severity, string> = {
  critical: "bg-bad text-white",
  high: "bg-bad-soft text-bad-text",
  medium: "bg-warn-soft text-warn-text",
  low: "bg-surface-2 text-ink-3",
};

const SEVERITY_LABEL: Record<Severity, string> = {
  critical: "Blocking",
  high: "High",
  medium: "Medium",
  low: "Low",
};

export function SeverityTag({ severity }: { severity: Severity }) {
  return (
    <span
      className={`shrink-0 rounded px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide ${SEVERITY_STYLE[severity]}`}
    >
      {SEVERITY_LABEL[severity]}
    </span>
  );
}

/* ----------------------------------------------------------------- tables */

export function DataRow({
  label,
  value,
  hint,
}: {
  label: string;
  value: ReactNode;
  hint?: string;
}) {
  return (
    <div className="flex items-baseline justify-between gap-6 border-b border-line py-2.5 last:border-0">
      <span className="text-sm text-ink-2">
        {label}
        {hint && <span className="block text-xs text-ink-3">{hint}</span>}
      </span>
      <span className="tnum text-right text-sm font-medium text-ink">{value}</span>
    </div>
  );
}

/* ---------------------------------------------------------------- actions */

const BUTTON_BASE =
  "inline-flex items-center justify-center gap-2 rounded-lg font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50";

export const buttonClass = {
  primary: `${BUTTON_BASE} bg-accent text-white hover:bg-accent-hover`,
  secondary: `${BUTTON_BASE} border border-line-strong bg-surface text-ink hover:border-accent hover:text-accent`,
  quiet: `${BUTTON_BASE} border border-line text-ink-2 hover:border-line-strong hover:text-ink`,
};

export const sizeClass = {
  lg: "px-7 py-3.5 text-base",
  md: "px-5 py-3 text-sm",
  sm: "px-3.5 py-2 text-xs",
};
