import type { Fix, Judgment, PillarScore, Rule, Severity } from "@/lib/types";
import { PILLARS } from "@/lib/types";

/**
 * Composition policy. Weights and thresholds live here, in code, so they can
 * change without re-running inference — the judgments are reusable data.
 */

/** How much of a pillar score comes from semantic judgment vs deterministic rules. */
const JUDGMENT_SHARE = 0.7;

/** Rules are flatter than judgments; these few carry more than the rest. */
const RULE_WEIGHTS: Record<string, number> = {
  indexable: 3,
  title_length: 2,
  content_depth: 2,
  answer_schema: 2,
  structured_data: 1.5,
  h1_single: 1.5,
  extractable_blocks: 1.5,
  outbound_citations: 1.5,
  heading_hierarchy: 1.5,
  question_headings: 1.5,
};
const DEFAULT_RULE_WEIGHT = 1;

/**
 * Violations that make the rest of the score meaningless. Handled as a separate
 * condition rather than a weight, because no amount of good writing compensates
 * for a page that cannot be indexed.
 */
const BLOCKING_RULES: Record<string, { cap: number; reason: string }> = {
  indexable: { cap: 20, reason: "The page is blocked from indexing, so nothing else on it can rank." },
};

function weightedMean(items: { value: number; weight: number }[]): number | null {
  const total = items.reduce((sum, i) => sum + i.weight, 0);
  if (total === 0) return null;
  return items.reduce((sum, i) => sum + i.value * i.weight, 0) / total;
}

function ruleWeight(id: string): number {
  return RULE_WEIGHTS[id] ?? DEFAULT_RULE_WEIGHT;
}

export function composePillars(judgments: Judgment[], rules: Rule[]): PillarScore[] {
  return PILLARS.map((pillar) => {
    const pillarJudgments = judgments.filter((j) => j.pillars.includes(pillar));
    const pillarRules = rules.filter((r) => r.pillars.includes(pillar));

    const judgmentMean = weightedMean(
      pillarJudgments.map((j) => ({ value: j.value, weight: j.weight })),
    );
    const ruleMean = weightedMean(
      pillarRules.map((r) => ({ value: r.value, weight: ruleWeight(r.id) })),
    );

    let blended: number;
    if (judgmentMean !== null && ruleMean !== null) {
      blended = judgmentMean * JUDGMENT_SHARE + ruleMean * (1 - JUDGMENT_SHARE);
    } else {
      blended = judgmentMean ?? ruleMean ?? 0;
    }

    let score = Math.round(blended * 100);

    for (const rule of pillarRules) {
      const blocking = BLOCKING_RULES[rule.id];
      if (blocking && !rule.passed) score = Math.min(score, blocking.cap);
    }

    const confidences = pillarJudgments
      .map((j) => j.confidence)
      .filter((c): c is number => c !== null);

    return {
      pillar,
      score,
      confidence: confidences.length
        ? confidences.reduce((a, b) => a + b, 0) / confidences.length
        : null,
      judgments: [...pillarJudgments].sort((a, b) => a.value - b.value),
      rules: [...pillarRules].sort((a, b) => a.value - b.value),
    };
  });
}

export function overallScore(pillars: PillarScore[]): number {
  if (pillars.length === 0) return 0;
  return Math.round(pillars.reduce((sum, p) => sum + p.score, 0) / pillars.length);
}

function severityFor(impact: number, blocking: boolean): Severity {
  if (blocking) return "critical";
  if (impact >= 1.6) return "high";
  if (impact >= 0.8) return "medium";
  return "low";
}

/** Judgments below this are worth surfacing as a fix. */
const JUDGMENT_FIX_THRESHOLD = 0.7;

/** Below this, the model was unsure enough that a human should check first. */
export const LOW_CONFIDENCE = 0.55;

export function buildFixes(judgments: Judgment[], rules: Rule[]): Fix[] {
  const fixes: Fix[] = [];

  for (const rule of rules) {
    if (rule.passed) continue;
    const blocking = Boolean(BLOCKING_RULES[rule.id]);
    const impact = ruleWeight(rule.id) * (1 - rule.value);
    fixes.push({
      id: `rule:${rule.id}`,
      pillars: rule.pillars,
      severity: severityFor(impact, blocking),
      title: blocking ? BLOCKING_RULES[rule.id].reason : `${rule.label}: ${rule.observed}`,
      detail: rule.expected,
      evidence: `Measured: ${rule.observed}`,
      impact,
      source: "rule",
      confidence: null,
    });
  }

  for (const judgment of judgments) {
    if (judgment.value >= JUDGMENT_FIX_THRESHOLD) continue;
    const impact = judgment.weight * (1 - judgment.value);
    fixes.push({
      id: `judgment:${judgment.id}`,
      pillars: judgment.pillars,
      severity: severityFor(impact, false),
      title: judgment.label,
      detail: judgment.remedy,
      evidence: judgment.verdict
        ? `Jev's read: "${judgment.verdict}"`
        : `Jev put this at ${Math.round(judgment.value * 100)}%.`,
      impact,
      source: "judgment",
      confidence: judgment.confidence,
    });
  }

  return fixes.sort((a, b) => {
    const order: Record<Severity, number> = { critical: 0, high: 1, medium: 2, low: 3 };
    if (order[a.severity] !== order[b.severity]) return order[a.severity] - order[b.severity];
    return b.impact - a.impact;
  });
}
