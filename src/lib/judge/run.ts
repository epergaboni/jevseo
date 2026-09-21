import "server-only";
import type { ChoiceResponse, NoulResponse, ScoreResponse } from "@typesafe-ai/sdk";
import { getTypeSafeClient } from "@/lib/typesafe/client";
import { buildQuestions, DIMENSIONS } from "@/lib/judge/dimensions";
import type { AnalysisInput, Judgment, PageFacts } from "@/lib/types";

type AnyAnswer = NoulResponse | ScoreResponse | ChoiceResponse;

export interface JudgeResult {
  judgments: Judgment[];
  intent: { choice: string; confidence: number; probabilities: Record<string, number> } | null;
  model: string;
  usage: { input_tokens: number; output_tokens: number };
  warnings: string[];
}

/** The state Jev evaluates. Named fields so questions can point at them by path. */
function buildState(facts: PageFacts, input: AnalysisInput) {
  return {
    target_query: input.targetQuery?.trim() || "not specified",
    audience: input.audience?.trim() || "a general reader with no specialist background",
    page: {
      url: facts.url ?? "not published yet — this is a draft",
      title: facts.title ?? "none",
      meta_description: facts.metaDescription ?? "none",
      headings: facts.headings.map((h) => `${"#".repeat(h.level)} ${h.text}`),
      content: facts.text,
    },
  };
}

/**
 * One request, every question. Jev ingests the state once and answers them all
 * in parallel, which the docs measure as an order of magnitude cheaper and
 * faster than asking them one at a time.
 */
export async function judge(facts: PageFacts, input: AnalysisInput): Promise<JudgeResult> {
  const warnings: string[] = [];
  const { questions, applied } = buildQuestions(facts, input);

  const result = await getTypeSafeClient().systemOne({
    state: buildState(facts, input),
    questions,
  });

  const answers = result.answers as Record<string, AnyAnswer>;
  const raw = new Map<string, number>();
  const judgments: Judgment[] = [];

  // Pass one: normalise every answer to 0..1 so gates can be evaluated.
  for (const dimension of applied) {
    const answer = answers[dimension.id];
    if (!answer) {
      warnings.push(`Jev returned no answer for "${dimension.label}"; it was left out of the score.`);
      continue;
    }
    raw.set(dimension.id, normalise(answer, dimension.invert === true));
  }

  // Pass two: build the scored judgments, dropping gated ones that do not apply.
  for (const dimension of applied) {
    if (dimension.gateOnly) continue;
    const value = raw.get(dimension.id);
    if (value === undefined) continue;

    if (dimension.gate) {
      const gateValue = raw.get(dimension.gate.id);
      if (gateValue !== undefined && gateValue < dimension.gate.threshold) continue;
    }

    const answer = answers[dimension.id];
    judgments.push({
      id: dimension.id,
      pillars: dimension.pillars,
      label: dimension.label,
      question: describeQuestion(dimension.id),
      kind: answer.type,
      value,
      confidence: answer.type === "noul" ? null : answer.confidence,
      verdict: verdictOf(answer),
      weight: dimension.weight,
      remedy: dimension.remedy,
    });
  }

  const intentAnswer = answers.__intent as ChoiceResponse | undefined;

  return {
    judgments,
    intent:
      intentAnswer && intentAnswer.type === "choice"
        ? {
            choice: intentAnswer.choice,
            confidence: intentAnswer.confidence,
            probabilities: intentAnswer.probabilities as Record<string, number>,
          }
        : null,
    model: result.model,
    usage: result.usage,
    warnings,
  };
}

/** Map every primitive onto the same 0..1 axis so code can compose them. */
function normalise(answer: AnyAnswer, invert: boolean): number {
  let value: number;
  if (answer.type === "noul") {
    value = answer.noul;
  } else if (answer.type === "score") {
    const levels = Object.keys(answer.legend).length;
    value = levels > 1 ? answer.score / (levels - 1) : 0;
  } else {
    // A Choice has no natural ordering, so it is never used as a scored dimension.
    value = answer.confidence;
  }
  const clamped = Math.min(1, Math.max(0, value));
  return invert ? 1 - clamped : clamped;
}

function verdictOf(answer: AnyAnswer): string | null {
  if (answer.type !== "score") return null;
  const legend = answer.legend as Record<string, string>;
  const nearest = String(Math.round(answer.score));
  const text = legend[nearest];
  return typeof text === "string" ? text : null;
}

const QUESTION_TEXT = new Map(
  DIMENSIONS.map((d) => {
    const built = d.build();
    const instructions = built.instructions;
    return [d.id, typeof instructions === "string" ? instructions : JSON.stringify(instructions)];
  }),
);

function describeQuestion(id: string): string {
  return QUESTION_TEXT.get(id) ?? "";
}
